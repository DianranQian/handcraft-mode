/**
 * 手搓模式设置行（settings.general.item 槽）：
 * 总开关 + 三个能力细分开关（读文件 / 搜索网络 / 提问）。
 * 读写 host settings namespace 'handcraft-mode'，改动即时生效（applies: live）。
 */

import { useEffect, useState } from 'react'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { HandcraftSettingsState, HandcraftSettingsValue } from './settings-store.ts'

/** 注册侧业务面：渲染器把 hooks 绑定成 useHandcraft 选择器。 */
export interface HandcraftRowInjected {
  hooks: {
    handcraft: SnapshotStore<HandcraftSettingsState>
  }
  /** 行首次渲染时拉取描述符。 */
  load: () => Promise<void>
  /** 持久化一个字段补丁。 */
  set: (patch: Partial<HandcraftSettingsValue>) => Promise<void>
}

/** 组件完整 props。 */
export type HandcraftRowProps =
  PropsRuntime<'settings.general.item'>
  & PropsLocale<'settings.handcraft'>
  & InjectFace<HandcraftRowInjected>

/** 一个细分开关的定义。 */
interface ToggleSpec {
  key: keyof HandcraftSettingsValue
  label: string
  hint: string
}

const TOGGLES: ToggleSpec[] = [
  { key: 'readTools', label: '读文件', hint: 'read / read_image / glob / grep' },
  { key: 'searchTools', label: '搜索与网络', hint: 'web_search + MCP 搜索工具' },
  { key: 'askTools', label: '提问', hint: 'ask_user_question' },
  { key: 'writeTools', label: '写文件（默认关）', hint: 'write / edit / str_replace_editor' },
]

/** 行内小开关（原生 checkbox，避免额外组件依赖）。 */
function Toggle(props: {
  checked: boolean
  disabled: boolean
  onChange: (next: boolean) => void
  label: string
  hint: string
}) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 0', cursor: props.disabled ? 'default' : 'pointer' }}>
      <input
        type="checkbox"
        checked={props.checked}
        disabled={props.disabled}
        onChange={(event) => props.onChange(event.target.checked)}
      />
      <span style={{ whiteSpace: 'nowrap' }}>{props.label}</span>
      <span style={{ opacity: 0.55, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{props.hint}</span>
    </label>
  )
}

/**
 * 渲染手搓模式设置行。
 * @param props - 组合槽 props（useHandcraft 来自 injected hooks）。
 */
export function HandcraftRow({ load, set, useHandcraft, t }: HandcraftRowProps) {
  const state = useHandcraft(snapshot => snapshot)
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (state.status === 'ready' || state.status === 'error') setDirty(false)
  }, [state.status])

  if (state.status === 'unavailable') return null

  const busy = state.status === 'loading' || state.status === 'saving'
  const value = state.value
  const disabled = busy || !state.writable || value === null
  const description = state.error ?? t('description')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '6px 0' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <div style={{ fontWeight: 600 }}>{t('title')}</div>
          <div role={state.error === null ? undefined : 'alert'} style={{ opacity: state.error === null ? 0.7 : 1, fontSize: 12 }}>
            {description}
          </div>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: disabled ? 'default' : 'pointer', whiteSpace: 'nowrap' }}>
          <input
            type="checkbox"
            checked={value?.enabled ?? true}
            disabled={disabled}
            onChange={(event) => {
              setDirty(true)
              void set({ enabled: event.target.checked })
            }}
          />
          <span style={{ fontWeight: 600 }}>{t('master')}</span>
        </label>
      </div>

      {(value?.enabled ?? true) && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, paddingLeft: 8, opacity: disabled ? 0.6 : 1 }}>
          {TOGGLES.map(({ key, label, hint }) => (
            <Toggle
              key={key}
              checked={value[key] as boolean}
              disabled={disabled}
              label={label}
              hint={hint}
              onChange={(next) => {
                setDirty(true)
                void set({ [key]: next })
              }}
            />
          ))}
        </div>
      )}

      {dirty && <div style={{ fontSize: 12, opacity: 0.6 }}>{t('saving')}</div>}
    </div>
  )
}
