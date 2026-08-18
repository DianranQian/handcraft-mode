/**
 * 手搓模式插件，浏览器半 —— 设置面板 General 里的一行：
 * 总开关 + 读文件/搜索网络/提问三个细分开关，读写 host settings
 * namespace 'handcraft-mode'（applies: live，改动即时生效）。
 * 与权限预设行（ui-permission-presets）同槽不同 id。
 */

import type { ConnectionHandle } from '@deepseek-ai/dsh-api-remotes/client'
// Type-only：拉入 locale 插件与 settings 槽的 Context 合并。
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import { HandcraftRow, type HandcraftRowInjected } from './HandcraftRow.tsx'
import { HandcraftSettingsController } from './settings-store.ts'

export type { HandcraftRowInjected, HandcraftRowProps } from './HandcraftRow.tsx'

/** 需要的服务（cordis fiber inject）。 */
export const inject = ['connection', 'slots', 'locale', 'remote']

const LOCALE_NS = 'settings.handcraft'

const zh = {
  title: '手搓模式',
  master: '启用',
  description: 'AI 只能动嘴不能动手：禁命令、禁写文件，只给关键代码片段。可勾选允许的能力。',
  saving: '保存中…',
}
const en = {
  title: 'Handcraft Mode',
  master: 'Enabled',
  description: 'AI talks only: no commands, no file writes, snippets only. Tick the capabilities it may use.',
  saving: 'Saving…',
}

/**
 * 浏览器插件主体：注册设置面板行。
 * @param ctx - client root context。
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(LOCALE_NS, { zh, en }), 'handcraft: settings row dictionaries')

  const connection = ctx.get('connection') as ConnectionHandle
  const controller = new HandcraftSettingsController(connection.api)
  const injected = (): HandcraftRowInjected => ({
    hooks: { handcraft: controller.store },
    load: () => controller.load(),
    set: (patch) => controller.set(patch),
  })

  ctx.effect(() => {
    const disposers = [
      ctx.remote.$on('settings/document-updated', () => {
        // 行只加载过一次才刷新（避免后台空转）。
        if (controller.store.getSnapshot().status === 'idle') return
        void controller.load()
      }),
      ctx.on('connection/reset', () => {
        if (controller.store.getSnapshot().status === 'idle') return
        void controller.load()
      }),
    ]
    return () => {
      controller.dispose()
      for (const dispose of disposers) dispose()
    }
  }, 'handcraft: settings invalidations')

  ctx.slots.inject('settings.general.item', () => ctx.slots.register({
    name: 'settings.general.item',
    id: 'handcraft',
    order: -15,
    locale: LOCALE_NS,
    inject: injected,
  }, HandcraftRow))
}
