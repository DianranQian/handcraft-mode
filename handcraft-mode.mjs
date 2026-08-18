/**
 * handcraft-mode（手搓模式）— host 半
 *
 * 让 DeepSeek Harness 的 AI 只能动嘴，不能替你动手：
 *   - 禁止：执行命令（bash/ssh）、写文件/改文件（write/edit/str_replace_editor）、
 *     派活（subagent/workflow/browser/openpencil/记忆写入）等一切"替你干活"的操作
 *   - 允许（可 UI 开关）：读文件（read/read_image/glob/grep）、
 *     搜索与网络（web_search + mcp 搜索工具）、提问（ask_user_question）
 *   - 注入行为约束：只给关键代码片段和思路，不给完整代码让用户复制
 *
 * 三层机制：
 *   1. guard（执行闸门，硬锁）：白名单放行（按 settings 开关动态组装），
 *      其余工具调用一律返回拒绝理由；enabled=false 时全放行（退出手搓模式）。
 *   2. restrict（可见性锁，省 token）：deny 名单隐藏"动手类"工具，模型在
 *      系统提示里看不到它们，不浪费输出 token 去尝试调用；名单里未注册的
 *      名字会抛错，自动降级 guard-only（执行仍锁死）。
 *   3. systemPrompt.section（提示约束）：注入"手搓模式"行为规则段落。
 *
 * 设置（UI 开关）：
 *   - 注册 settings namespace 'handcraft-mode'（全局唯一，同名重复注册自动跳过），
 *     配置 UI 通过 describe/mutate 读写；scope.watch 驱动 guard 状态实时更新。
 *   - 优先级：schema 默认值 → cordis.yml config（base 层）→ UI 写入（user 层）。
 *
 * 两种装载场景自适应（用 restrict 是否抛"requires a scoped context"区分）：
 *   - agent 预设装载（agent.cordis.yml insert）：ctx 即 agent 的 scoped context，
 *     restrict/section 直接对本 agent 生效，子代理经 scope 链继承。
 *   - host 平面装载（--patch cordis.yml）：ctx 是全局的，restrict 会抛错，
 *     改为监听 agent/created，对每个新 agent 的 agent.ctx 施加同样两道锁。
 *
 * 依赖：仅 @deepseek-ai/schemastery（Config schema），经插件目录内
 * node_modules → 仓库 .pnpm/node_modules 的符号链接解析。
 */

import z from '@deepseek-ai/schemastery'

export const name = 'handcraft-mode'

/** 依赖工具注册表与设置服务；guard/restrict/settings 都从它们走。 */
export const inject = ['tools', 'settings']

/** settings namespace（全局唯一，UI 开关读写它）。 */
export const NAMESPACE = 'handcraft-mode'

/** 读文件组：模型可以看代码给建议。 */
export const READ_TOOLS = ['read', 'read_image', 'glob', 'grep']
/** 搜索/网络组：web_search + MCP 搜索工具前缀（guard 按前缀放行）。 */
export const SEARCH_TOOLS = ['web_search']
export const MCP_SEARCH_PREFIX = 'mcp__argo__'
/** 提问组：老师确认学生是否听懂。 */
export const ASK_TOOLS = ['ask_user_question']
/** 写文件组：默认关闭，用户可在 UI 打开（写简单文件）。 */
export const WRITE_TOOLS = ['write', 'edit', 'str_replace_editor']

/**
 * 能力组表：guard 白名单与 restrict deny 名单都从它推导。
 * `default` 只用于文档；运行时以 settings/config 为准（schema 默认值）。
 */
export const GROUPS = [
  { key: 'readTools', label: '读文件', tools: READ_TOOLS },
  { key: 'searchTools', label: '搜索与网络', tools: SEARCH_TOOLS },
  { key: 'askTools', label: '提问', tools: ASK_TOOLS },
  { key: 'writeTools', label: '写文件', tools: WRITE_TOOLS },
]

/** 默认 deny 名单：隐藏"替你动手"的工具（可见性锁，guard 才是硬锁）。 */
export const DEFAULT_DENY_TOOLS = [
  'bash', 'bash_persistent', 'str_replace_editor', 'write', 'edit',
  'ssh_exec', 'ssh_upload', 'ssh_download', 'ssh_tunnel', 'ssh_cluster',
  'subagent', 'subagent_fork', 'workflow', 'ralph',
  'browser_open', 'browser_click', 'browser_type', 'browser_scroll', 'browser_screenshot',
  'openpencil_new', 'openpencil_edit', 'openpencil_create', 'de_channel_send',
  'skill_manage', 'todo_write', 'create_goal', 'update_goal', 'job_kill',
  'interrupt_agent', 'send_message', 'memory', 'dtodo',
  'agent_teams_create', 'agent_teams_delete', 'agent_teams_add_member',
  'agent_teams_remove_member', 'agent_teams_create_task', 'agent_teams_reassign_task',
  'agent_teams_claim_task', 'agent_teams_send_message', 'agent_teams_update_task',
  'agent_teams_status',
]

export const DEFAULT_PROMPT = `Handcraft Mode（手搓模式）正在生效。你是一名指导老师，只能动嘴讲解：
- 你可以读文件、搜索资料来帮助指导，但禁止执行任何命令，禁止写文件、改文件，禁止任何会替你动手的操作。
- 不要输出可直接复制粘贴的完整代码文件或完整命令。只给关键代码片段（例如某个函数的核心几行），并解释为什么这么写、背后的逻辑。
- 每次只把一件事说透，等学生说"好了"再讲下一件。
- 学生自己动手实现，你负责把每一步说得足够详细（文件路径、写什么内容、大概长什么样），让学生能亲手敲出来。`

export const DEFAULT_DENY_REASON = '手搓模式已锁定：AI 只能动嘴讲解。你可以读文件和搜索资料，但禁止执行命令、写文件、修改文件等一切替你动手的操作。请改为口头指导，只给关键代码片段和思路。'

/** Plugin config / settings schema（UI 开关的字段定义）。 */
export const Config = z.object({
  /** 总开关：false = 完全退出手搓模式（所有工具放行）。 */
  enabled: z.boolean().default(true),
  /** 允许读文件（read/read_image/glob/grep）。 */
  readTools: z.boolean().default(true),
  /** 允许搜索与网络（web_search + mcp 搜索工具）。 */
  searchTools: z.boolean().default(true),
  /** 允许提问（ask_user_question）。 */
  askTools: z.boolean().default(true),
  /** 允许写文件（write/edit/str_replace_editor）；新能力，默认关闭。 */
  writeTools: z.boolean().default(false),
  /** 是否注入"手搓模式"行为约束段落。 */
  injectPrompt: z.boolean().default(true),
  /** 约束段落在系统提示中的排序（persona 是 0，工具说明在 100-199）。 */
  sectionOrder: z.number().default(50),
  /** 行为约束段落文本（覆盖默认）。 */
  promptText: z.string().default(DEFAULT_PROMPT),
  /** guard 拒绝时返回给模型的理由。 */
  denyReason: z.string().default(DEFAULT_DENY_REASON),
  /** restrict 的 deny 基础名单（实际名单按能力开关动态调整）。 */
  denyTools: z.array(z.string()).default(DEFAULT_DENY_TOOLS),
})

/** 与 Config 同构的默认值（cordis.yml 未提供时 apply 内兜底合并）。 */
const DEFAULTS = {
  enabled: true,
  readTools: true,
  searchTools: true,
  askTools: true,
  writeTools: false,
  injectPrompt: true,
  sectionOrder: 50,
  promptText: DEFAULT_PROMPT,
  denyReason: DEFAULT_DENY_REASON,
  denyTools: DEFAULT_DENY_TOOLS,
}

/**
 * @param {import('@deepseek-ai/cordis').Context} ctx
 * @param {Partial<typeof DEFAULTS>} [config] cordis.yml 传入的配置（base 层）
 */
export function apply(ctx, config) {
  const state = { ...DEFAULTS, ...config }

  // ── settings：注册全局 namespace，UI 开关经它读写 ──────────────────────
  // 全局唯一：agent 预设场景每个会话都会 apply，第二个起 register 抛错，
  // 自动跳过注册（配置以 cordis.yml 为准），但仍尝试读取一次已存值。
  let registeredScope = null
  try {
    registeredScope = ctx.settings.register(NAMESPACE, Config, { applies: 'live', base: config })
    Object.assign(state, registeredScope.get()) // resolved = 默认 → base → UI(user)
    registeredScope.watch((next) => {
      Object.assign(state, next)
      ctx.logger.info(`[handcraft-mode] 设置已更新：${JSON.stringify(next)}`)
    })
    ctx.logger.info(`[handcraft-mode] settings namespace "${NAMESPACE}" 已注册（UI 开关可用）`)
  } catch (error) {
    const message = String(error?.message ?? error)
    if (!message.includes('is already registered')) {
      ctx.logger.warn(`[handcraft-mode] settings 注册失败（继续用 config）: ${message}`)
    }
    try {
      const stored = ctx.settings.get(NAMESPACE)
      if (stored !== undefined && typeof stored === 'object') Object.assign(state, stored)
    } catch { /* settings 服务不可用则忽略 */ }
  }

  // ── 第二道锁：执行闸门（硬锁，动态状态） ──────────────────────────────
  // 白名单 = 所有开启能力组的工具并集（+ MCP 搜索前缀）；其余一律拒绝；
  // enabled=false 全放行。guard 注册到 ctx 所在层：全局 ctx = 所有 agent
  // 生效；agent scope ctx = 该 agent（及 scope 链子孙）。
  const allowedNames = () => {
    const set = new Set()
    for (const group of GROUPS) {
      if (state[group.key]) for (const n of group.tools) set.add(n)
    }
    return set
  }
  ctx.tools.guard((execution) => {
    if (!state.enabled) return undefined
    const name = execution.name
    if (allowedNames().has(name)) return undefined
    if (state.searchTools && name.startsWith(MCP_SEARCH_PREFIX)) return undefined
    return state.denyReason
  })

  // ── 第一道锁的动态 deny 名单 ──────────────────────────────────────────
  // 与 guard 保持一致的可见性：deny = 基础名单 - 已开启能力组的工具
  // （开放的工具不能被隐藏）+ 已关闭能力组的工具（关掉的能力被隐藏）。
  const denyList = () => {
    const enabled = new Set(GROUPS.filter(g => state[g.key]).flatMap(g => g.tools))
    const denied = state.denyTools.filter(n => !enabled.has(n))
    for (const group of GROUPS) {
      if (state[group.key]) continue
      for (const n of group.tools) if (!denied.includes(n)) denied.push(n)
    }
    return denied
  }

  const summarize = () => {
    if (!state.enabled) return '（总开关关闭，全部放行）'
    const parts = GROUPS.filter(g => state[g.key]).map(g => g.label)
    return parts.join('+') || '（无，全部拒绝）'
  }
  ctx.logger.info(`[handcraft-mode] 执行闸门已开启：放行 ${summarize()}`)

  // ── 可见性裁剪（deny 名单隐藏未开放的工具，省 token） ────────────────
  const applyRestrict = (scoped) => {
    if (!state.enabled) return
    try {
      scoped.tools.restrict({ deny: denyList() })
      ctx.logger.info(`[handcraft-mode] 可见性已裁剪：隐藏 ${denyList().length} 个工具`)
      return true
    } catch (error) {
      // 典型原因：deny 名单含当前部署未注册的名字。降级 guard-only，
      // 执行仍被锁死，只是模型还看得到这些工具。
      ctx.logger.warn(`[handcraft-mode] restrict 失败，降级 guard-only: ${error?.message ?? error}`)
      return false
    }
  }

  // ── 第三层：行为约束段落 ──────────────────────────────────────────────
  const injectPrompt = (scoped) => {
    if (!state.injectPrompt) return
    try {
      scoped.systemPrompt.section({
        name: 'handcraft-mode:policy',
        order: state.sectionOrder,
        text: state.promptText,
      })
      ctx.logger.info('[handcraft-mode] 行为约束段落已注入')
    } catch (error) {
      ctx.logger.warn(`[handcraft-mode] 约束段落注入失败（不影响工具锁定）: ${error?.message ?? error}`)
    }
  }

  // ── 区分两种装载场景 ──────────────────────────────────────────────────
  try {
    ctx.tools.restrict({ deny: denyList() })
    // 走到这里 = ctx 是 scoped context（agent 预设场景），直接对本 agent 生效。
    ctx.logger.info(`[handcraft-mode] 可见性已裁剪：隐藏 ${denyList().length} 个工具`)
    injectPrompt(ctx)
  } catch (error) {
    const message = String(error?.message ?? error)
    if (message.includes('requires a scoped context')) {
      // 全局 ctx（--patch 场景）：restrict 必须作用在 agent 的 scoped ctx 上。
      // agent/created 事件携带 { agent }，Agent 对象自带 scoped context 属性
      // `agent.ctx`（runtime-types.ts）——tools.restrict 正是要求这种 scoped
      // context，systemPrompt.section 也注册进该 agent 自己的 scope 层。
      ctx.on('agent/created', ({ agent }) => {
        applyRestrict(agent.ctx)
        injectPrompt(agent.ctx)
      })
    } else {
      // scoped 但 deny 名单含未知名字 → guard-only（执行仍锁死）。
      ctx.logger.warn(`[handcraft-mode] restrict 失败，降级 guard-only: ${message}`)
      injectPrompt(ctx)
    }
  }
}
