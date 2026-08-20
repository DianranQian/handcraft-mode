/**
 * handcraft-mode 冒烟测试（零依赖 stub，验证插件行为契约）。
 * 覆盖：
 *   A. 全局装载（bundle/--patch）：不锁任何会话——不注册 guard，只注册 settings
 *   B. agent 预设（scoped ctx）：会话级锁定——guard + restrict + section
 *   C. 状态驱动：settings watch 推更新后 guard 行为随之变化
 *   D. 打开写文件后 deny 名单动态移除 write 组
 * 用法：node smoke-test.mjs
 */
import { mkdtempSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
// 隔离：installPreset 写入临时 DSH_HOME，不碰真实 ~/.dsh
process.env.DSH_HOME = mkdtempSync(join(tmpdir(), 'hm-smoke-'))
import { name, inject, apply, READ_TOOLS, VISION_TOOLS, SEARCH_TOOLS, ASK_TOOLS, WRITE_TOOLS, MEMORY_WRITE_TOOLS, TODO_TOOLS, DEFAULT_DENY_TOOLS } from './handcraft-mode.mjs'

let failures = 0
function check(label, cond, detail = '') {
  if (cond) console.log(`  ok  ${label}`)
  else { failures++; console.error(`FAIL  ${label} ${detail}`) }
}

function makeSettings({ registered = false, stored = null } = {}) {
  const registers = []
  const watches = []
  const baseOf = (opts) => opts?.base ?? {}
  return {
    register(ns, schema, opts) {
      registers.push({ ns, opts })
      if (registered) throw new Error(`settings namespace "${ns}" is already registered`)
      return {
        // resolved = 默认全开 → base(config) → user(stored)，user 优先
        get: () => ({ enabled: true, readTools: true, searchTools: true, askTools: true, writeTools: false, injectPrompt: true, ...baseOf(opts), ...(stored ?? {}) }),
        watch: (cb) => { watches.push(cb); return () => {} },
      }
    },
    get: () => (registered ? { enabled: true, readTools: true, searchTools: true, askTools: true, writeTools: false, injectPrompt: true, ...(stored ?? {}) } : undefined),
    registers, watches,
  }
}

function makeCtx({ scoped = false, restrictError = null, settings = null } = {}) {
  const restrictCalls = []
  const sectionCalls = []
  const logs = []
  const guardFns = []
  const eventListeners = {}
  const ctx = {
    tools: {
      guard(fn) { guardFns.push(fn); return () => {} },
      restrict(filter) {
        if (!scoped) throw new Error('tools.restrict() requires a scoped context (agent.ctx): a context-global restriction would mask every agent')
        if (restrictError) throw new Error(restrictError)
        restrictCalls.push(filter)
        return () => {}
      },
    },
    on(event, cb) {
      ;(eventListeners[event] ??= []).push(cb)
      return () => {}
    },
    effect(cb) { const d = cb(); return () => { if (typeof d === 'function') d() } },
    logger: {
      info: (...a) => logs.push(['info', ...a]),
      warn: (...a) => logs.push(['warn', ...a]),
    },
  }
  if (settings) ctx.settings = settings
  if (scoped) {
    ctx.systemPrompt = {
      section(section) { sectionCalls.push(section); return () => {} },
    }
  }
  return { ctx, restrictCalls, sectionCalls, logs, guardFns, eventListeners }
}

const exec = (n) => ({ name: n, arguments: {}, callId: 'c1' })

// ── 1. export 形状 ──────────────────────────────────────────────────────
console.log('[1] export 形状')
check('name 存在', typeof name === 'string' && name.length > 0, name)
check('inject 含 tools 与 settings', Array.isArray(inject) && inject.includes('tools') && inject.includes('settings'), JSON.stringify(inject))
check('apply 是函数', typeof apply === 'function')
check('工具分组导出', Array.isArray(READ_TOOLS) && Array.isArray(SEARCH_TOOLS) && Array.isArray(ASK_TOOLS) && Array.isArray(WRITE_TOOLS))
check('deny 名单非空', Array.isArray(DEFAULT_DENY_TOOLS) && DEFAULT_DENY_TOOLS.length > 10)

// ── 场景 A：全局装载 → 不锁任何会话 ────────────────────────────────────
console.log('[2] 场景 A：全局装载（不锁）')
{
  const settings = makeSettings()
  const { ctx, restrictCalls, sectionCalls, logs, guardFns } = makeCtx({ settings })
  apply(ctx, undefined)
  check('settings 注册成功（UI 开关可用）', settings.registers.length === 1 && settings.registers[0].ns === 'handcraft-mode')
  check('不注册 guard（不锁任何会话）', guardFns.length === 0)
  check('不做 restrict', restrictCalls.length === 0)
  check('不注入约束段落', sectionCalls.length === 0)
  check('日志提示会话级启用', logs.some(l => String(l[1]).includes('未锁定')))
  check('自动安装预设到 DSH_HOME/.agent-presets/handcraft',
    existsSync(join(process.env.DSH_HOME, '.agent-presets', 'handcraft', 'agent.cordis.yml')))
}

// ── 场景 B：agent 预设（scoped ctx）→ 会话级锁定 ───────────────────────
console.log('[3] 场景 B：agent 预设（会话级锁定）')
{
  const settings = makeSettings({ registered: true, stored: { readTools: false } })
  const { ctx, restrictCalls, sectionCalls, guardFns } = makeCtx({ scoped: true, settings })
  apply(ctx, undefined)
  check('settings 注册跳过（已注册，读取已存值）', settings.registers.length === 1)
  check('guard 已注册（per-agent）', guardFns.length === 1)
  check('读取了已存值（readTools=false 被采用）', guardFns[0](exec('read')) !== undefined)
  // 动态 deny：readTools=false → 基础名单 + 关闭的读/看图组
  // （写/记忆组工具已在基础名单内不重复；看图组不在基础名单会追加）。
  // 注意 restrictCalls[0] 是 scoped 探针（{deny: []}），真正名单是最后一次调用。
  // memoryWriteTools 默认开 → memory 从 deny 移除；其余关闭组追加。
  const expectedB = [...DEFAULT_DENY_TOOLS.filter(n => n !== 'memory'), ...READ_TOOLS, ...VISION_TOOLS]
  check('restrict deny = 基础名单 + 关闭的读/看图组',
    JSON.stringify(restrictCalls.at(-1)) === JSON.stringify({ deny: expectedB }),
    `got ${restrictCalls.at(-1)?.deny?.length} 个`)
  check('section 注入', sectionCalls[0]?.name === 'handcraft-mode:policy')
  check('默认演示档：段落允许完整可运行代码（codeSnippets 默认开）', sectionCalls[0]?.text.includes('可运行代码演示'))
  check('guard 拒绝 bash', typeof guardFns[0](exec('bash')) === 'string')
  check('guard 放行 web_search（searchTools 仍开）', guardFns[0](exec('web_search')) === undefined)
  check('guard 拒绝 read（已存值 readTools=false）', typeof guardFns[0](exec('read')) === 'string')
  check('guard 拒绝 glob/grep（同属读组，已关闭）',
    ['glob', 'grep'].every(n => typeof guardFns[0](exec(n)) === 'string'))
  check('guard 放行 ask_user_question', guardFns[0](exec('ask_user_question')) === undefined)
  check('guard 默认拒绝 write/edit（写文件默认关）',
    ['write', 'edit', 'str_replace_editor'].every(n => typeof guardFns[0](exec(n)) === 'string'))
  check('guard 默认拒绝看图（visionTools 默认关）',
    VISION_TOOLS.every(n => typeof guardFns[0](exec(n)) === 'string'))
  check('guard 默认放行记忆写入（memoryWriteTools 默认开）',
    MEMORY_WRITE_TOOLS.every(n => guardFns[0](exec(n)) === undefined))
  check('guard 默认拒绝待办与目标（memoryTools 默认关）',
    TODO_TOOLS.every(n => typeof guardFns[0](exec(n)) === 'string'))
  check('guard 拒绝 subagent', typeof guardFns[0](exec('subagent')) === 'string')
  check('guard 放行 MCP 搜索前缀', guardFns[0](exec('mcp__argo__argo_search')) === undefined)
  check('拒绝理由含"手搓模式"', guardFns[0](exec('bash')).includes('手搓模式'))
}

// ── 场景 C：状态驱动 —— settings watch 推更新 ───────────────────────────
console.log('[4] 场景 C：状态驱动')
{
  const settings = makeSettings()
  const { ctx, guardFns } = makeCtx({ scoped: true, settings })
  apply(ctx, undefined)
  const guard = guardFns[0]
  check('初始：read 放行', guard(exec('read')) === undefined)
  check('初始：bash 拒绝', typeof guard(exec('bash')) === 'string')
  check('初始：write 拒绝（默认关）', typeof guard(exec('write')) === 'string')

  settings.watches[0]({ enabled: true, readTools: false, searchTools: true, askTools: true, writeTools: false, injectPrompt: true })
  check('watch 后：read 被拒', typeof guard(exec('read')) === 'string')
  check('watch 后：web_search 仍放行', guard(exec('web_search')) === undefined)

  settings.watches[0]({ enabled: true, readTools: true, searchTools: true, askTools: true, writeTools: true, visionTools: true, memoryTools: true, injectPrompt: true })
  check('watch 打开写文件后：write/edit 放行', ['write', 'edit', 'str_replace_editor'].every(n => guard(exec(n)) === undefined))
  check('watch 打开看图后：describe_image 放行', VISION_TOOLS.every(n => guard(exec(n)) === undefined))
  check('watch 打开记忆后：memory/dtodo 放行', ['memory', 'dtodo', 'create_goal', 'update_goal'].every(n => guard(exec(n)) === undefined))

  settings.watches[0]({ enabled: false, readTools: false, visionTools: false, searchTools: false, askTools: false, writeTools: false, memoryTools: false, injectPrompt: true })
  check('总开关关闭：全部放行', ['read', 'bash', 'write', 'memory'].every(n => guard(exec(n)) === undefined))
}

// ── 场景 D：打开写文件 → deny 名单动态移除 write 组 ─────────────────────
console.log('[5] 打开写文件 → deny 名单移除 write 组')
{
  const settings = makeSettings({ stored: { writeTools: true } })
  const { ctx, restrictCalls, guardFns } = makeCtx({ scoped: true, settings })
  apply(ctx, undefined)
  const deny = restrictCalls.at(-1)?.deny ?? []
  check('deny 名单不再含 write/edit/str_replace_editor',
    !WRITE_TOOLS.some(n => deny.includes(n)), JSON.stringify(deny))
  check('deny 名单仍含 bash（命令仍隐藏）', deny.includes('bash'))
  check('guard 放行 write（已打开）', guardFns[0](exec('write')) === undefined)
  check('guard 仍拒绝 bash', typeof guardFns[0](exec('bash')) === 'string')
}

// ── 场景 E：scoped 但 restrict 失败（未知工具名）→ guard-only ──────────
console.log('[6] scoped 但 restrict 失败（未知工具名）→ guard-only')
{
  const settings = makeSettings()
  const { ctx, guardFns } = makeCtx({ scoped: true, restrictError: 'tools.restrict() names unknown global tools "nope"', settings })
  apply(ctx, undefined)
  check('guard 仍生效（拒绝 bash）', typeof guardFns[0](exec('bash')) === 'string')
  check('guard 放行 read', guardFns[0](exec('read')) === undefined)
}

// ── 场景 G：代码演示档位（codeSnippets，默认开） ───────────────────────
console.log('[7] 代码演示档位（codeSnippets）')
{
  // 默认（开）：演示档段落
  const s1 = makeSettings()
  const c1 = makeCtx({ scoped: true, settings: s1 })
  apply(c1.ctx, undefined)
  check('默认演示档：允许完整可运行代码', c1.sectionCalls[0]?.text.includes('可运行代码演示'))
  check('默认演示档：先讲思路', c1.sectionCalls[0]?.text.includes('先讲思路'))

  // watch 关掉 codeSnippets：段落切换为手搓档
  const s2 = makeSettings()
  const c2 = makeCtx({ scoped: true, settings: s2 })
  apply(c2.ctx, undefined)
  check('初始为演示档', c2.sectionCalls[0]?.text.includes('可运行代码演示'))
  s2.watches[0]({ enabled: true, readTools: true, visionTools: false, searchTools: true, askTools: true, writeTools: false, memoryTools: false, codeSnippets: false, injectPrompt: true })
  check('watch 关闭代码演示后：段落禁止完整代码', c2.sectionCalls.at(-1)?.text.includes('不要输出可直接复制粘贴的完整代码'))
  check('手搓档：guard 行为不变（bash 仍拒）', typeof c2.guardFns[0](exec('bash')) === 'string')
  check('手搓档：guard 放行 read', c2.guardFns[0](exec('read')) === undefined)

  // 已存值 codeSnippets=false：直接手搓档
  const s3 = makeSettings({ stored: { codeSnippets: false } })
  const c3 = makeCtx({ scoped: true, settings: s3 })
  apply(c3.ctx, undefined)
  check('已存值 codeSnippets=false：首段即手搓档', c3.sectionCalls[0]?.text.includes('不要输出可直接复制粘贴的完整代码'))
}

// ── 场景 H：省电模式（ecoMode） ────────────────────────────────────────
console.log('[8] 省电模式（ecoMode）')
{
  // 默认关：段落无 ECO 后缀
  const s1 = makeSettings()
  const c1 = makeCtx({ scoped: true, settings: s1 })
  apply(c1.ctx, undefined)
  check('默认省电关：段落不含精简规则', !c1.sectionCalls[0]?.text.includes('省电模式生效'))

  // watch 打开：段落追加精简规则
  const s2 = makeSettings()
  const c2 = makeCtx({ scoped: true, settings: s2 })
  apply(c2.ctx, undefined)
  s2.watches[0]({ enabled: true, readTools: true, visionTools: false, searchTools: true, askTools: true, writeTools: false, memoryTools: false, codeSnippets: true, ecoMode: true, injectPrompt: true })
  check('watch 打开省电后：段落含精简规则', c2.sectionCalls.at(-1)?.text.includes('省电模式生效'))
  check('省电后：仍保留演示档内容', c2.sectionCalls.at(-1)?.text.includes('可运行代码演示'))
  check('省电：guard 行为不变（bash 仍拒）', typeof c2.guardFns[0](exec('bash')) === 'string')

  // 已存值 ecoMode=true
  const s3 = makeSettings({ stored: { ecoMode: true } })
  const c3 = makeCtx({ scoped: true, settings: s3 })
  apply(c3.ctx, undefined)
  check('已存值 ecoMode=true：首段含精简规则', c3.sectionCalls[0]?.text.includes('省电模式生效'))
}

// ── 场景 I：DeepSeek 娘模式（chanMode） ────────────────────────────────
console.log('[9] DeepSeek 娘模式（chanMode）')
{
  // 默认关
  const s1 = makeSettings()
  const c1 = makeCtx({ scoped: true, settings: s1 })
  apply(c1.ctx, undefined)
  check('默认娘化关：段落不含娘化人设', !c1.sectionCalls[0]?.text.includes('鲸鱼娘模式'))

  // watch 打开
  const s2 = makeSettings()
  const c2 = makeCtx({ scoped: true, settings: s2 })
  apply(c2.ctx, undefined)
  s2.watches[0]({ enabled: true, readTools: true, visionTools: false, searchTools: true, askTools: true, writeTools: false, memoryTools: false, codeSnippets: true, ecoMode: false, chanMode: true, injectPrompt: true })
  check('watch 打开娘化后：段落含鲸鱼娘人设', c2.sectionCalls.at(-1)?.text.includes('鲸鱼娘模式'))
  check('鲸鱼娘人设含覆盖声明（优先于 persona）', c2.sectionCalls.at(-1)?.text.includes('优先于系统里任何其他身份描述'))
  check('鲸鱼娘人设明确不再是严肃辅导者', c2.sectionCalls.at(-1)?.text.includes('不再是严肃稳重的辅导者'))
  check('娘化后：人设在规则前', c2.sectionCalls.at(-1)?.text.indexOf('DeepSeek娘模式') < c2.sectionCalls.at(-1)?.text.indexOf('可运行代码演示'))
  check('娘化后：guard 行为不变（bash 仍拒）', typeof c2.guardFns[0](exec('bash')) === 'string')

  // 娘化 + 省电叠加
  const s3 = makeSettings({ stored: { chanMode: true, ecoMode: true } })
  const c3 = makeCtx({ scoped: true, settings: s3 })
  apply(c3.ctx, undefined)
  const t3 = c3.sectionCalls[0]?.text
  check('叠加：人设 + 精简规则同时存在', t3.includes('鲸鱼娘模式') && t3.includes('省电模式生效'))
}

// ── 场景 J：settings/updated 事件即时重注入（预设场景无 watch 时） ──────
console.log('[10] settings/updated 事件兜底')
{
  // 预设场景：register 失败（已注册）→ 无 watch → 靠事件
  const s1 = makeSettings({ registered: true })
  const c1 = makeCtx({ scoped: true, settings: s1 })
  apply(c1.ctx, undefined)
  check('无 watch（注册被占用）', s1.watches.length === 0)
  check('注册了 settings/updated 监听', Array.isArray(c1.eventListeners['settings/updated']) && c1.eventListeners['settings/updated'].length === 1)

  const fire = (patch) => c1.eventListeners['settings/updated'][0]('handcraft-mode', patch)
  check('初始：无娘化人设', !c1.sectionCalls[0]?.text.includes('鲸鱼娘模式'))
  fire({ enabled: true, readTools: true, visionTools: false, searchTools: true, askTools: true, writeTools: false, memoryTools: false, codeSnippets: true, ecoMode: false, chanMode: true, injectPrompt: true })
  check('事件后：段落含鲸鱼娘人设（即时生效）', c1.sectionCalls.at(-1)?.text.includes('鲸鱼娘模式'))
  check('事件后：guard 锁定不变', typeof c1.guardFns[0](exec('bash')) === 'string')

  // 幂等：同档位重复事件不重复注入
  const before = c1.sectionCalls.length
  fire({ enabled: true, readTools: true, visionTools: false, searchTools: true, askTools: true, writeTools: false, memoryTools: false, codeSnippets: true, ecoMode: false, chanMode: true, injectPrompt: true })
  check('幂等：同档位重复事件不重注入', c1.sectionCalls.length === before)
}

// ── 场景 K：工具层开关即时生效（restrict 可重入） ──────────────────────
console.log('[11] 工具层开关即时生效（restrict 可重入）')
{
  // 预设场景（无 watch）：事件触发开关变化
  const s1 = makeSettings({ registered: true })
  const c1 = makeCtx({ scoped: true, settings: s1 })
  apply(c1.ctx, undefined)
  const fire = (patch) => c1.eventListeners['settings/updated'][0]('handcraft-mode', patch)

  // 初始 deny：默认关闭组（看图/写/记忆）
  const initialDeny = c1.restrictCalls.at(-1)?.deny ?? []
  check('初始 deny 隐藏 write', initialDeny.includes('write'))
  check('初始 deny 隐藏 describe_image', initialDeny.includes('describe_image'))
  check('初始 deny 不含 read（读组默认开）', !initialDeny.includes('read'))

  // 打开写文件 + 看图 → deny 移除对应组；关闭读 → deny 追加读组
  fire({ enabled: true, readTools: false, visionTools: true, searchTools: true, askTools: true, writeTools: true, memoryTools: false, codeSnippets: true, ecoMode: false, chanMode: false, injectPrompt: true })
  const newDeny = c1.restrictCalls.at(-1)?.deny ?? []
  check('打开写文件后：deny 移除 write/edit', !['write', 'edit', 'str_replace_editor'].some(n => newDeny.includes(n)))
  check('打开看图后：deny 移除 describe_image', !newDeny.includes('describe_image'))
  check('关闭读后：deny 追加 read', newDeny.includes('read') && newDeny.includes('glob'))
  check('guard 联动：write 放行', c1.guardFns[0](exec('write')) === undefined)
  check('guard 联动：read 被拒', typeof c1.guardFns[0](exec('read')) === 'string')

  // 总开关关闭 → restrict 释放（可见性恢复）
  fire({ enabled: false, readTools: true, visionTools: false, searchTools: true, askTools: true, writeTools: false, memoryTools: false, codeSnippets: true, ecoMode: false, chanMode: false, injectPrompt: true })
  check('总开关关闭：guard 全放行', ['read', 'bash', 'write'].every(n => c1.guardFns[0](exec(n)) === undefined))
  // restrict 被 dispose（不再有新的 deny 注册）
  const afterDisable = c1.restrictCalls.at(-1)?.deny ?? []
  check('总开关关闭：最后无新 deny 注册（旧 restrict 已释放）',
    c1.restrictCalls.length >= 3 && afterDisable.length >= 0)
}

console.log(failures === 0 ? '\n全部通过 ✓' : `\n${failures} 项失败 ✗`)
process.exit(failures === 0 ? 0 : 1)
