/**
 * 手搓模式设置分区组件（settings.section 槽，仿 dsh-pet 的 PetSettingsSection）：
 * 设置面板导航出现「手搓模式」分区，内部是总开关 + 六个能力开关。
 * 开关即写即生效（applies: live），无需保存按钮。
 */

import { useEffect } from 'react'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { HandcraftSectionState, HandcraftSettingsValue } from './settings-store.ts'

/** 注册侧业务面：渲染器把 hooks 绑定成 useHandcraft 选择器。 */
export interface HandcraftSectionInjected {
  hooks: {
    handcraft: SnapshotStore<HandcraftSectionState>
  }
  /** 分区首次渲染时拉取描述符。 */
  load: () => Promise<void>
  /** 写一个能力开关。 */
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
  { key: 'memoryTools', label: '记忆与待办（默认关）', hint: 'memory / dtodo / 目标管理' },
  { key: 'codeSnippets', label: '代码演示（默认开）', hint: '允许 AI 给完整可运行代码 + 讲解' },
  { key: 'ecoMode', label: '省电模式（默认关）', hint: '回答精简，降低 token 费用' },
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

  useEffect(() => {
    void load()
  }, [load])

  if (state.status === 'unavailable') {
    return <p role="alert">{t('unavailable')}</p>
  }

  const busy = state.status !== 'ready'
  const value = state.value
  const disabled = busy || !state.writable || value === null

  return (
    <div>
      <p style={{ opacity: 0.75 }}>{t('description')}</p>

      <label style={{ ...rowStyle, fontWeight: 600 }}>
        <input
          type="checkbox"
          checked={value?.enabled ?? true}
          disabled={disabled}
          onChange={(event) => { void set('enabled', event.target.checked) }}
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
                onChange={(event) => { void set(key, event.target.checked) }}
              />
              <span style={{ whiteSpace: 'nowrap' }}>{label}</span>
              <span style={hintStyle}>{hint}</span>
            </label>
          ))}
        </div>
      )}

      {state.error !== null && <p role="alert" style={{ color: 'var(--danger, #c0392b)' }}>{state.error}</p>}
      {busy && <p style={{ opacity: 0.5 }}>{t('loading')}</p>}
    </div>
  )
}
