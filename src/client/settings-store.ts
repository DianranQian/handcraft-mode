/**
 * 手搓模式设置分区：绑定 host 端 settings namespace 'handcraft-mode'。
 * 使用官方 `ctx.settingsScope`（SettingsScopeBinder）——注册即暴露，
 * 无需白名单；写操作 revision 设栅、失败自动重读。
 */

import type {
  SettingsScope, SettingsScopeSnapshot,
} from '@deepseek-ai/dsh-client-runtime/client'
import {
  createSnapshotStore, type SnapshotStore,
} from '@deepseek-ai/dsh-client-runtime/client'

/** 与 host 半 NAMESPACE 一致的 settings namespace。 */
export const HANDCRAFT_SETTINGS_NS = 'handcraft-mode'

/** UI 可调的能力字段（host Config 的子集）。 */
export interface HandcraftSettingsValue {
  enabled: boolean
  readTools: boolean
  visionTools: boolean
  searchTools: boolean
  askTools: boolean
  writeTools: boolean
  memoryTools: boolean
  injectPrompt: boolean
}

/** 分区快照（渲染用）。 */
export interface HandcraftSectionState {
  status: 'loading' | 'ready' | 'unavailable' | 'error'
  error: string | null
  writable: boolean
  value: HandcraftSettingsValue | null
}

/** 与 host schema 一致的默认值（旧文档缺字段时补齐）。 */
const DEFAULTS: HandcraftSettingsValue = {
  enabled: true,
  readTools: true,
  visionTools: false,
  searchTools: true,
  askTools: true,
  writeTools: false,
  memoryTools: false,
  injectPrompt: true,
}

/** 控制器：把 settingsScope 的 snapshot 投影为分区渲染快照。 */
export class HandcraftSettingsController {
  readonly store: SnapshotStore<HandcraftSectionState> = createSnapshotStore({
    status: 'loading',
    error: null,
    writable: false,
    value: null,
  })

  private readonly unsubscribe: () => void

  constructor(private readonly scope: SettingsScope<HandcraftSettingsValue>) {
    this.publish()
    this.unsubscribe = this.scope.subscribe(() => this.publish())
  }

  /** 拉取一次 host 描述（首次渲染时调用）。 */
  load = (): Promise<void> => this.scope.load()

  /** 写一个字段（开关即时生效，applies: live）。 */
  set = (field: string, value: boolean): Promise<void> => this.scope.set(field, value)

  /** 停止订阅（分区卸载时由注册侧调用）。 */
  dispose(): void {
    this.unsubscribe()
  }

  private publish(): void {
    const snapshot: SettingsScopeSnapshot<HandcraftSettingsValue> = this.scope.getSnapshot()
    if (snapshot.status === 'ready') {
      this.store.update((state) => {
        state.status = 'ready'
        state.error = null
        state.writable = snapshot.writable
        state.value = { ...DEFAULTS, ...snapshot.value }
      })
    } else if (snapshot.status === 'unavailable') {
      this.store.update((state) => {
        state.status = 'unavailable'
        state.error = null
        state.writable = false
        state.value = null
      })
    } else {
      this.store.update((state) => {
        state.status = 'loading'
        state.error = null
      })
    }
  }
}
