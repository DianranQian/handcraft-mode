/**
 * 手搓模式设置分区组件（settings.section 槽，仿 dsh-pet 的 PetSettingsSection）：
 * 设置面板导航出现「手搓模式」分区，内部是总开关 + 能力开关。
 *
 * 交互：乐观更新 + 400ms 合并写入——点击立即切换显示（不等待网络往返），
 * 连续点击合并为一次批量写入，避免每点一次都触发 settings 写入 + 事件
 * 广播导致的卡顿（"关了打不开"的卡死感即源于此）。
 */

import { useEffect, useRef, useState } from 'react'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { HandcraftSectionState, HandcraftSettingsValue } from './settings-store.ts'

/** 合并写入窗口（ms）：窗口内多次点击只写一次。 */
const COMMIT_DEBOUNCE_MS = 400

/** 注册侧业务面：渲染器把 hooks 绑定成 useHandcraft 选择器。 */
export interface HandcraftSectionInjected {
  hooks: {
    handcraft: SnapshotStore<HandcraftSectionState>
  }
  /** 分区首次渲染时拉取描述符。 */
  load: () => Promise<void>
  /** 写一个能力开关（由合并写入批量调用）。 */
  set: (field: keyof HandcraftSettingsValue, value: boolean) => Promise<void>
}

/** 组件完整 props。 */
export type HandcraftSectionProps =
  PropsRuntime<'settings.section'>
  & PropsLocale<'settings.handcraft'>
  & InjectFace<HandcraftSectionInjected>

/** 能力开关定义（label 为中文显示名；hint 列出具体工具）。 */
interface ToggleSpec {
  key: keyof HandcraftSettingsValue
  label: string
  hint: string
}

const TOGGLES: ToggleSpec[] = [
  { key: 'readTools', label: '读文件', hint: 'read / read_image / glob / grep' },
  { key: 'visionTools', label: '看图（默认关）', hint: 'describe_image / modlens_read_image' },
  { key: 'searchTools', label: '搜索与网络', hint: 'web_search + MCP 搜索工具' },
  { key: 'askTools', label: '提问', hint: 'ask_user_question' },
  { key: 'writeTools', label: '写文件（默认关）', hint: 'write / edit / str_replace_editor' },
  { key: 'memoryWriteTools', label: '记忆写入（默认开）', hint: '记住学习进度/偏好，跨会话持续教学' },
  { key: 'memoryTools', label: '待办与目标（默认关）', hint: 'dtodo / create_goal / update_goal' },
  { key: 'codeSnippets', label: '代码演示（默认开）', hint: '允许 AI 给完整可运行代码 + 讲解' },
  { key: 'ecoMode', label: '省电模式（默认关）', hint: '回答精简，降低 token 费用' },
  { key: 'chanMode', label: '鲸鱼娘（默认关）', hint: 'AI 化身治愈系鲸鱼娘指导老师' },
]

const rowStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0',
}
const hintStyle: React.CSSProperties = { opacity: 0.55, fontSize: 12 }

/**
 * 渲染手搓模式设置分区。
 * @param props - 组合槽 props（useHandcraft 来自 injected hooks）。
 */
export function HandcraftSection({ t, useHandcraft, load, set }: HandcraftSectionProps) {
  const state = useHandcraft(snapshot => snapshot)
  // 乐观草稿：点击立即生效的本地值；合并窗口结束后写入 settings。
  const [draft, setDraft] = useState<Partial<HandcraftSettingsValue> | null>(null)
  const pendingRef = useRef<Partial<HandcraftSettingsValue>>({})
  const timerRef = useRef<number | undefined>(undefined)

  useEffect(() => {
    void load()
  }, [load])

  // 卸载时清掉未提交的定时器与草稿。
  useEffect(() => () => {
    if (timerRef.current !== undefined) window.clearTimeout(timerRef.current)
  }, [])

  if (state.status === 'unavailable') {
    return <p role="alert">{t('unavailable')}</p>
  }

  // 渲染值 = 已提交值 + 乐观草稿（点击立即可见）。
  const value: HandcraftSettingsValue | null =
    state.value === null && draft === null ? null : { ...(state.value ?? {}), ...(draft ?? {}) } as HandcraftSettingsValue
  const writable = state.status === 'ready' && state.writable
  const disabled = !writable || value === null

  const commit = (field: keyof HandcraftSettingsValue, next: boolean) => {
    if (!writable || value === null) return
    // 1) 乐观更新本地草稿（立即切换，不等网络）。
    Object.assign(pendingRef.current, { [field]: next })
    setDraft({ ...pendingRef.current })
    // 2) 重置合并窗口：窗口内继续点只更新草稿。
    if (timerRef.current !== undefined) window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(() => {
      timerRef.current = undefined
      const patch = pendingRef.current
      pendingRef.current = {}
      setDraft(null)
      // 3) 合并窗口结束：一次性批量写入（每字段一次 set，串行排队）。
      for (const [key, v] of Object.entries(patch)) {
        void set(key as keyof HandcraftSettingsValue, v as boolean)
      }
    }, COMMIT_DEBOUNCE_MS)
  }

  return (
    <div>
      <p style={{ opacity: 0.75 }}>{t('description')}</p>

      <label style={{ ...rowStyle, fontWeight: 600 }}>
        <input
          type="checkbox"
          checked={value?.enabled ?? true}
          disabled={disabled}
          onChange={(event) => { commit('enabled', event.target.checked) }}
        />
        <span>{t('master')}</span>
      </label>

      {(value?.enabled ?? true) && (
        <div style={{ paddingLeft: 12, opacity: disabled ? 0.6 : 1 }}>
          {TOGGLES.map(({ key, label, hint }) => (
            <label key={key} style={rowStyle}>
              <input
                type="checkbox"
                checked={value ? Boolean(value[key]) : false}
                disabled={disabled}
                onChange={(event) => { commit(key, event.target.checked) }}
              />
              <span style={{ whiteSpace: 'nowrap' }}>{label}</span>
              <span style={hintStyle}>{hint}</span>
            </label>
          ))}
        </div>
      )}

      {state.error !== null && <p role="alert" style={{ color: 'var(--danger, #c0392b)' }}>{state.error}</p>}
      {state.status !== 'ready' && <p style={{ opacity: 0.5 }}>{t('loading')}</p>}
    </div>
  )
}
