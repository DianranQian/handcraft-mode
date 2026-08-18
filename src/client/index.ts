/**
 * 手搓模式插件，浏览器半 —— 设置面板的一个「手搓模式」分区
 * （settings.section 槽，仿 dsh-pet）：设置导航出现分区入口，
 * 内部是总开关 + 六个能力开关，经官方 ctx.settingsScope 读写
 * namespace 'handcraft-mode'（applies: live，改动即时生效）。
 */

// Type-only：拉入 locale 插件与 settings 槽的 Context 合并。
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type { SettingsScope } from '@deepseek-ai/dsh-client-runtime/client'
import { HandcraftSection, type HandcraftSectionInjected } from './HandcraftSection.tsx'
import {
  HANDCRAFT_SETTINGS_NS, HandcraftSettingsController, type HandcraftSettingsValue,
} from './settings-store.ts'

export type { HandcraftSectionInjected, HandcraftSectionProps } from './HandcraftSection.tsx'

/** 需要的服务（cordis fiber inject；settingsScope 由 ui-settings 提供）。 */
export const inject = ['slots', 'locale', 'settingsScope']

const LOCALE_NS = 'settings.handcraft'

const zh = {
  'settings.title': '手搓模式',
  'settings.description': 'AI 只能动嘴不能动手：禁命令、禁写文件，只给关键代码片段。勾选允许的能力。',
  'settings.master': '启用（总开关）',
  'settings.loading': '加载中…',
  'settings.unavailable': '当前部署未暴露本插件的设置命名空间，表单不可用。',
}
const en = {
  'settings.title': 'Handcraft Mode',
  'settings.description': 'AI talks only: no commands, no file writes, snippets only. Tick the capabilities it may use.',
  'settings.master': 'Enabled',
  'settings.loading': 'Loading…',
  'settings.unavailable': 'This deployment does not expose the plugin\'s settings namespace.',
}

/**
 * 浏览器插件主体：注册设置面板分区。
 * @param ctx - client root context。
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(LOCALE_NS, { zh, en }), 'handcraft: section dictionaries')

  ctx.slots.inject('settings.section', () => {
    // settingsScope 是 ui-settings 提供的官方 binder；bind 把 transport 与
    // 失效订阅绑定到本插件的 fiber 生命周期。
    const scope = ctx.settingsScope.bind({ namespace: HANDCRAFT_SETTINGS_NS }) as SettingsScope<HandcraftSettingsValue>
    const controller = new HandcraftSettingsController(scope)
    const unregister = ctx.slots.register({
      name: 'settings.section',
      id: 'handcraft',
      order: 130,
      label: () => ctx.locale.bind(LOCALE_NS)('settings.title'),
      locale: LOCALE_NS,
      inject: (): HandcraftSectionInjected => ({
        hooks: { handcraft: controller.store },
        load: () => controller.load(),
        set: (field, value) => controller.set(field, value),
      }),
    }, HandcraftSection)
    return () => {
      controller.dispose()
      unregister()
    }
  })
}
