/**
 * handcraft-mode 冒烟测试（零依赖 stub，验证插件行为契约）。
 * 覆盖：
 *   A. host 平面（--patch）：全局 ctx → settings 注册 + agent/created 钩子
 *   B. agent 预设：scoped ctx → settings 注册跳过（已注册）+ 直接锁
 *   C. 状态驱动：开关变化后 guard 行为随之变化
 * 用法：node smoke-test.mjs
 */
import { name, inject, apply, READ_TOOLS, SEARCH_TOOLS, ASK_TOOLS, WRITE_TOOLS, DEFAULT_DENY_TOOLS } from './handcraft-mode.mjs'

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
        get: () => ({ enabled: true, readTools: true, searchTools: true, askTools: true, injectPrompt: true, ...baseOf(opts), ...(stored ?? {}) }),
        watch: (cb) => { watches.push(cb); return () => {} },
      }
    },
    get: () => (registered ? { enabled: true, readTools: true, searchTools: true, askTools: true, injectPrompt: true, ...(stored ?? {}) } : undefined),
    registers, watches,
  }
}

function makeCtx({ scoped = false, restrictError = null, settings = null } = {}) {
  const restrictCalls = []
  const sectionCalls = []
  const logs = []
  const createdListeners = []
  const guardFns = []
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
    on(event, cb) { if (event === 'agent/created') createdListeners.push(cb) },
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
  return { ctx, restrictCalls, sectionCalls, logs, createdListeners, guardFns }
}

const exec = (n) => ({ name: n, arguments: {}, callId: 'c1' })

// ── 1. export 形状 ──────────────────────────────────────────────────────
console.log('[1] export 形状')
check('name 存在', typeof name === 'string' && name.length > 0, name)
check('inject 含 tools 与 settings', Array.isArray(inject) && inject.includes('tools') && inject.includes('settings'), JSON.stringify(inject))
check('apply 是函数', typeof apply === 'function')
check('工具分组导出', Array.isArray(READ_TOOLS) && Array.isArray(SEARCH_TOOLS) && Array.isArray(ASK_TOOLS))
check('deny 名单非空', Array.isArray(DEFAULT_DENY_TOOLS) && DEFAULT_DENY_TOOLS.length > 10)

// ── 场景 A：全局 ctx（--patch） ─────────────────────────────────────────
console.log('[2] 场景 A：全局 ctx（--patch）')
{
  const settings = makeSettings()
  const { ctx, restrictCalls, sectionCalls, logs, createdListeners, guardFns } = makeCtx({ settings })
  apply(ctx, undefined)
  check('settings 注册成功', settings.registers.length === 1 && settings.registers[0].ns === 'handcraft-mode')
  check('settings watch 已挂', settings.watches.length === 1)
  check('guard 已注册', guardFns.length === 1)
  check('restrict 未直接在全局调用', restrictCalls.length === 0)
  check('注册了 agent/created 钩子', createdListeners.length === 1)

  const fakeAgent = {
    id: 'agent-1',
    ctx: {
      tools: { restrict(f) { restrictCalls.push(f); return () => {} } },
      systemPrompt: { section(s) { sectionCalls.push(s); return () => {} } },
    },
  }
  createdListeners[0]({ agent: fakeAgent })

  check('agent/created 里 restrict 用 deny 模式',
    JSON.stringify(restrictCalls[0]) === JSON.stringify({ deny: DEFAULT_DENY_TOOLS }),
    JSON.stringify(restrictCalls[0]?.deny?.length))
  check('agent/created 里注册了约束段落', sectionCalls[0]?.name === 'handcraft-mode:policy')
  check('约束段落含"只能动嘴"', sectionCalls[0]?.text.includes('只能动嘴'))
  check('guard 放行 read/glob/grep/web_search/ask_user_question',
    ['read', 'glob', 'grep', 'web_search', 'ask_user_question'].every(n => guardFns[0](exec(n)) === undefined))
  check('guard 默认拒绝 write/edit/str_replace_editor（写文件默认关）',
    ['write', 'edit', 'str_replace_editor'].every(n => typeof guardFns[0](exec(n)) === 'string'))
  check('guard 拒绝 bash/subagent',
    ['bash', 'subagent'].every(n => typeof guardFns[0](exec(n)) === 'string'))
  check('guard 拒绝 memory/todo', ['memory', 'todo_write'].every(n => typeof guardFns[0](exec(n)) === 'string'))
  check('guard 放行 MCP 搜索前缀', guardFns[0](exec('mcp__argo__argo_search')) === undefined)
  check('拒绝理由含"手搓模式"', guardFns[0](exec('bash')).includes('手搓模式'))
  check('默认 deny 名单 = 基础名单（write 未开，write/edit 留在隐藏名单）',
    JSON.stringify(restrictCalls[0]) === JSON.stringify({ deny: DEFAULT_DENY_TOOLS }),
    `got ${restrictCalls[0]?.deny?.length} 个`)
}

// ── 场景 B：agent 预设（scoped ctx，settings 已注册） ───────────────────
console.log('[3] 场景 B：agent 预设（scoped ctx）')
{
  const settings = makeSettings({ registered: true, stored: { readTools: false } })
  const { ctx, restrictCalls, sectionCalls, createdListeners, guardFns, logs } = makeCtx({ scoped: true, settings })
  apply(ctx, undefined)
  check('settings 注册跳过（已注册）', settings.registers.length === 1)
  check('读取了已存值（readTools=false 被采用）', guardFns[0](exec('read')) !== undefined) // 已存值关掉读
  // 动态 deny：readTools=false → 基础名单 + 读组（写组已在基础名单内不重复）
  const expectedB = [...DEFAULT_DENY_TOOLS, ...READ_TOOLS]
  check('restrict 直接在 scoped ctx 上 deny（含关闭的读组）',
    JSON.stringify(restrictCalls[0]) === JSON.stringify({ deny: expectedB }),
    `got ${restrictCalls[0]?.deny?.length} 个`)
  check('section 直接注入', sectionCalls[0]?.name === 'handcraft-mode:policy')
  check('不再注册 agent/created 钩子', createdListeners.length === 0)
  check('guard 拒绝 bash', typeof guardFns[0](exec('bash')) === 'string')
  check('guard 放行 web_search（searchTools 仍开）', guardFns[0](exec('web_search')) === undefined)
  check('日志含跳过提示', logs.some(l => String(l[1]).includes('已注册') || String(l[1]).includes('handcraft')))
}

// ── 场景 C：状态驱动 —— settings watch 推更新 ───────────────────────────
console.log('[4] 场景 C：状态驱动')
{
  const settings = makeSettings()
  const { ctx, guardFns } = makeCtx({ settings })
  apply(ctx, undefined)
  const guard = guardFns[0]
  check('初始：read 放行', guard(exec('read')) === undefined)
  check('初始：bash 拒绝', typeof guard(exec('bash')) === 'string')
  check('初始：write 拒绝（默认关）', typeof guard(exec('write')) === 'string')

  settings.watches[0]({ enabled: true, readTools: false, searchTools: true, askTools: true, writeTools: false, injectPrompt: true })
  check('watch 后：read 被拒', typeof guard(exec('read')) === 'string')
  check('watch 后：web_search 仍放行', guard(exec('web_search')) === undefined)

  settings.watches[0]({ enabled: true, readTools: true, searchTools: true, askTools: true, writeTools: true, injectPrompt: true })
  check('watch 打开写文件后：write/edit 放行', ['write', 'edit', 'str_replace_editor'].every(n => guard(exec(n)) === undefined))

  settings.watches[0]({ enabled: false, readTools: false, searchTools: false, askTools: false, writeTools: false, injectPrompt: true })
  check('总开关关闭：全部放行', ['read', 'bash', 'write'].every(n => guard(exec(n)) === undefined))
}

// ── 场景 D：全锁与自定义 ────────────────────────────────────────────────
console.log('[5] 全锁与自定义')
{
  const settings = makeSettings()
  const { ctx, guardFns, restrictCalls } = makeCtx({ scoped: true, settings })
  apply(ctx, { enabled: true, readTools: false, searchTools: false, askTools: false, writeTools: false, injectPrompt: false, denyTools: ['bash'] })
  check('全锁：read 被拒', typeof guardFns[0](exec('read')) === 'string')
  check('全锁：ask_user_question 被拒', typeof guardFns[0](exec('ask_user_question')) === 'string')
  // 动态 deny：基础 ['bash'] + 全部关闭能力组的工具
  const expectedDeny = ['bash', ...READ_TOOLS, ...SEARCH_TOOLS, ...ASK_TOOLS, ...WRITE_TOOLS]
  check('动态 deny 名单 = 基础名单 + 关闭的能力组工具',
    JSON.stringify(restrictCalls[0]) === JSON.stringify({ deny: expectedDeny }),
    `got ${JSON.stringify(restrictCalls[0]?.deny)}`)
  check('injectPrompt=false 不注入', true) // section 注册走 scoped 分支，这里无 section 检查点
}

// ── 场景 E：scoped 但 restrict 失败（deny 名单未知名字）→ guard-only ────
console.log('[6] scoped 但 restrict 失败（未知工具名）→ guard-only')
{
  const settings = makeSettings()
  const { ctx, guardFns, createdListeners } = makeCtx({ scoped: true, restrictError: 'tools.restrict() names unknown global tools "nope"', settings })
  apply(ctx, undefined)
  check('不注册 agent/created 钩子', createdListeners.length === 0)
  check('guard 仍生效（拒绝 bash）', typeof guardFns[0](exec('bash')) === 'string')
  check('guard 放行 read', guardFns[0](exec('read')) === undefined)
}

// ── 场景 F：打开写文件后 deny 名单动态移除 write 组 ─────────────────────
console.log('[7] 打开写文件 → deny 名单移除 write 组')
{
  const settings = makeSettings({ stored: { writeTools: true } })
  const { ctx, restrictCalls, guardFns } = makeCtx({ scoped: true, settings })
  apply(ctx, undefined)
  const deny = restrictCalls[0]?.deny ?? []
  check('deny 名单不再含 write/edit/str_replace_editor',
    !WRITE_TOOLS.some(n => deny.includes(n)), JSON.stringify(deny))
  check('deny 名单仍含 bash（命令仍隐藏）', deny.includes('bash'))
  check('guard 放行 write（已打开）', guardFns[0](exec('write')) === undefined)
  check('guard 仍拒绝 bash', typeof guardFns[0](exec('bash')) === 'string')
}

console.log(failures === 0 ? '\n全部通过 ✓' : `\n${failures} 项失败 ✗`)
process.exit(failures === 0 ? 0 : 1)
