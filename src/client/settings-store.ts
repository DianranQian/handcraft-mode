/**
 * 手搓模式设置行：读写 host 端 settings namespace 'handcraft-mode'。
 * 控制器模式照抄 ui-permission-presets 的 PermissionPresetSettingsController
 * （describe 拉取、mutate 写入、revision 防陈旧写）。
 */

import type {
  IApiClient, SettingsNamespaceView,
} from '@deepseek-ai/dsh-api-remotes/client'
import {
  createSnapshotStore, type SnapshotStore,
} from '@deepseek-ai/dsh-client-runtime/client'

/** 与 host 半 NAMESPACE 一致的 settings namespace。 */
export const HANDCRAFT_SETTINGS_NS = 'handcraft-mode'

/** UI 可调的能力字段（host Config 的子集）。 */
export interface HandcraftSettingsValue {
  enabled: boolean
  readTools: boolean
  searchTools: boolean
  askTools: boolean
  writeTools: boolean
  injectPrompt: boolean
}

/** 设置行快照。 */
export interface HandcraftSettingsState {
  status: 'idle' | 'loading' | 'ready' | 'saving' | 'unavailable' | 'error'
  error: string | null
  writable: boolean
  value: HandcraftSettingsValue | null
  revision: number
}

/** 从 host 描述符解析当前值（缺字段时用默认；写文件默认关）。 */
function valueOf(view: SettingsNamespaceView): HandcraftSettingsValue {
  const raw = (view.value as HandcraftSettingsValue | null) ?? {}
  return {
    enabled: raw.enabled ?? true,
    readTools: raw.readTools ?? true,
    searchTools: raw.searchTools ?? true,
    askTools: raw.askTools ?? true,
    writeTools: raw.writeTools ?? false,
    injectPrompt: raw.injectPrompt ?? true,
  }
}

/** 控制器：连接设置读、写与推送失效。 */
export class HandcraftSettingsController {
  readonly store: SnapshotStore<HandcraftSettingsState> = createSnapshotStore({
    status: 'idle',
    error: null,
    writable: false,
    value: null,
    revision: 0,
  })

  private generation = 0
  private view: SettingsNamespaceView | undefined

  constructor(private readonly api: Pick<IApiClient, 'settings'>) {}

  /** 刷新描述符；最新请求胜出。 */
  async load(): Promise<void> {
    const generation = ++this.generation
    this.store.update((state) => {
      state.status = 'loading'
      state.error = null
    })
    try {
      const response = await this.api.settings.describe({})
      if (!response.result.ok) throw new Error(response.result.error.message)
      if (generation !== this.generation) return
      const view = response.result.value.namespaces.find(entry => entry.ns === HANDCRAFT_SETTINGS_NS)
      if (view === undefined) {
        this.view = undefined
        this.store.update((state) => {
          state.status = 'unavailable'
          state.writable = false
          state.value = null
        })
        return
      }
      this.accept(view, response.result.value.writable)
    } catch (error) {
      if (generation !== this.generation) return
      this.fail(error)
    }
  }

  /** 持久化一个补丁（只写用户改过的字段）。 */
  async set(patch: Partial<HandcraftSettingsValue>): Promise<void> {
    const view = this.view
    const state = this.store.getSnapshot()
    if (view === undefined || !state.writable || state.value === null) return
    const generation = ++this.generation
    this.store.update((draft) => {
      draft.status = 'saving'
      draft.error = null
    })
    try {
      const ops = Object.entries(patch).map(([key, value]) => ({
        op: 'set' as const,
        path: [key],
        value,
      }))
      const response = await this.api.settings.mutate({
        ns: HANDCRAFT_SETTINGS_NS,
        ops,
        expectedRevision: view.revision,
      })
      if (generation !== this.generation) return
      if (!response.result.ok) throw new Error(response.result.error.message)
      this.accept(response.result.value, true)
    } catch (error) {
      if (generation !== this.generation) return
      this.fail(error)
    }
  }

  dispose(): void {
    this.generation += 1
    this.view = undefined
  }

  private accept(view: SettingsNamespaceView, writable: boolean): void {
    this.view = view
    this.store.update((state) => {
      state.status = 'ready'
      state.error = null
      state.writable = writable
      state.value = valueOf(view)
      state.revision = view.revision
    })
  }

  private fail(error: unknown): void {
    this.store.update((state) => {
      state.status = 'error'
      state.error = error instanceof Error ? error.message : String(error)
    })
  }
}
