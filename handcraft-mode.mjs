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
 * 三层机制（只作用于启用了手搓模式的会话）：
 *   1. guard（执行闸门，硬锁）：白名单放行（按 settings 开关动态组装），
 *      其余工具调用一律返回拒绝理由；enabled=false 时全放行（退出手搓模式）。
 *   2. restrict（可见性锁，省 token）：deny 名单动态计算，隐藏未开放的工具。
 *   3. systemPrompt.section（提示约束）：注入"手搓模式"行为规则段落。
 *
 * 会话级设计（重要）：
 *   全局装载（bundle / --patch）时插件**不锁任何会话**——只注册 settings
 *   namespace（UI 开关与预设共享）。锁定只发生在 agent 预设装载场景
 *   （apply 的 ctx 是 agent 的 scoped context）：guard 注册在该 agent 层，
 *   只影响这个会话（及其子代理链），其他会话完全不受影响。
 *   启用方式：新建会话时在预设选择器选「手搓模式」。
 *
 * 设置（UI 开关）：
 *   - 注册 settings namespace 'handcraft-mode'（全局唯一，同名重复注册自动跳过），
 *     配置 UI 通过 describe/mutate 读写；scope.watch 驱动 guard 状态实时更新。
 *   - 优先级：schema 默认值 → 预设/bundle config（base 层）→ UI 写入（user 层）。
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
/** 看图组：分析用户贴的截图/报错图（默认关）。 */
export const VISION_TOOLS = ['describe_image', 'modlens_read_image']
/** 搜索/网络组：web_search + MCP 搜索工具前缀（guard 按前缀放行）。 */
export const SEARCH_TOOLS = ['web_search']
export const MCP_SEARCH_PREFIX = 'mcp__argo__'
/** 提问组：老师确认学生是否听懂。 */
export const ASK_TOOLS = ['ask_user_question']
/** 写文件组：默认关闭，用户可在 UI 打开（写简单文件）。 */
export const WRITE_TOOLS = ['write', 'edit', 'str_replace_editor']
/** 记忆与待办组：老师帮记学习进度/待办/目标（默认关）。 */
export const MEMORY_TOOLS = ['memory', 'dtodo', 'create_goal', 'update_goal']

/**
 * 能力组表：guard 白名单与 restrict deny 名单都从它推导。
 * `default` 只用于文档；运行时以 settings/config 为准（schema 默认值）。
 */
export const GROUPS = [
  { key: 'readTools', label: '读文件', tools: READ_TOOLS },
  { key: 'visionTools', label: '看图', tools: VISION_TOOLS },
  { key: 'searchTools', label: '搜索与网络', tools: SEARCH_TOOLS },
  { key: 'askTools', label: '提问', tools: ASK_TOOLS },
  { key: 'writeTools', label: '写文件', tools: WRITE_TOOLS },
  { key: 'memoryTools', label: '记忆与待办', tools: MEMORY_TOOLS },
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

/** 代码演示模式的行为约束（codeSnippets=true 时替换默认段落）。 */
export const DEFAULT_DEMO_PROMPT = `Handcraft Mode（手搓模式）正在生效，当前为「代码演示」档位。你是一名耐心、严谨的指导老师：
- 你可以读文件、搜索资料来帮助指导，但禁止执行任何命令，禁止写文件、改文件，禁止任何会替你动手的操作。
- 对初学者可以给出完整的可运行代码演示，但必须遵守顺序：先讲思路（这段代码要做什么、为什么这么做），再给完整代码，最后逐段解释每一部分的作用。
- 鼓励学生先自己尝试；学生明确说"写不出来/给个演示"时，再给完整代码。
- 每次只把一件事说透，等学生说"好了"再讲下一件。`

export const DEFAULT_DENY_REASON = '手搓模式已锁定：AI 只能动嘴讲解。你可以读文件和搜索资料，但禁止执行命令、写文件、修改文件等一切替你动手的操作。请改为口头指导，只给关键代码片段和思路。'

/** Plugin config / settings schema（UI 开关的字段定义）。 */
export const Config = z.object({
  /** 总开关：false = 完全退出手搓模式（所有工具放行）。 */
  enabled: z.boolean().default(true),
  /** 允许读文件（read/read_image/glob/grep）。 */
  readTools: z.boolean().default(true),
  /** 允许看图（describe_image/modlens_read_image）；默认关。 */
  visionTools: z.boolean().default(false),
  /** 允许搜索与网络（web_search + mcp 搜索工具）。 */
  searchTools: z.boolean().default(true),
  /** 允许提问（ask_user_question）。 */
  askTools: z.boolean().default(true),
  /** 允许写文件（write/edit/str_replace_editor）；默认关。 */
  writeTools: z.boolean().default(false),
  /** 允许记忆与待办（memory/dtodo/目标管理）；默认关。 */
  memoryTools: z.boolean().default(false),
  /** 代码演示档位：允许 AI 给完整可运行代码（提示层，非工具）；默认关。 */
  codeSnippets: z.boolean().default(false),
  /** 是否注入"手搓模式"行为约束段落。 */
  injectPrompt: z.boolean().default(true),
  /** 约束段落在系统提示中的排序（persona 是 0，工具说明在 100-199）。 */
  sectionOrder: z.number().default(50),
  /** 行为约束段落文本（手搓档，覆盖默认）。 */
  promptText: z.string().default(DEFAULT_PROMPT),
  /** 行为约束段落文本（代码演示档，覆盖默认）。 */
  demoPromptText: z.string().default(DEFAULT_DEMO_PROMPT),
  /** guard 拒绝时返回给模型的理由。 */
  denyReason: z.string().default(DEFAULT_DENY_REASON),
  /** restrict 的 deny 基础名单（实际名单按能力开关动态调整）。 */
  denyTools: z.array(z.string()).default(DEFAULT_DENY_TOOLS),
})

/** 与 Config 同构的默认值（cordis.yml 未提供时 apply 内兜底合并）。 */
const DEFAULTS = {
  enabled: true,
  readTools: true,
  visionTools: false,
  searchTools: true,
  askTools: true,
  writeTools: false,
  memoryTools: false,
  codeSnippets: false,
  injectPrompt: true,
  sectionOrder: 50,
  promptText: DEFAULT_PROMPT,
  demoPromptText: DEFAULT_DEMO_PROMPT,
  denyReason: DEFAULT_DENY_REASON,
  denyTools: DEFAULT_DENY_TOOLS,
}

/**
 * @param {import('@deepseek-ai/cordis').Context} ctx
 * @param {Partial<typeof DEFAULTS>} [config] cordis.yml 传入的配置（base 层）
 */
export function apply(ctx, config) {
  const state = { ...DEFAULTS, ...config }
  // settings 变化钩子：guard/deny 读 state 自动响应；提示段落档位在
  // 注入函数定义后赋值（见下），避免注册处与定义处的顺序耦合。
  let onSettingsChanged = () => {}

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
      onSettingsChanged()
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

  // ── 判定装载场景 ──────────────────────────────────────────────────────
  // 探针：restrict 只在 agent 的 scoped context 上可用（全局 ctx 会抛
  // "requires a scoped context"）。立即释放探针，无副作用。
  let scoped = false
  try {
    const dispose = ctx.tools.restrict({ deny: [] })
    dispose()
    scoped = true
  } catch (error) {
    const message = String(error?.message ?? error)
    scoped = !message.includes('requires a scoped context')
  }

  if (!scoped) {
    // ── 全局装载（bundle / --patch）：不锁任何会话 ─────────────────────
    // 只注册 settings（UI 开关与预设共享），手搓模式按会话启用：
    // 用户新建会话选「手搓模式」预设，该会话的 agent 才会被锁定。
    ctx.logger.info('[handcraft-mode] 已装载（全局，未锁定任何会话）。')
    ctx.logger.info('[handcraft-mode] 启用方式：新建会话时在预设选择器选「手搓模式」（会话级）。')
    return
  }

  // ── 会话级锁定：只影响当前 agent（及其子代理链） ─────────────────────
  // 第二道锁：执行闸门（硬锁，动态状态）。白名单 = 所有开启能力组的工具
  // 并集（+ MCP 搜索前缀）；其余一律拒绝；enabled=false 全放行。
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

  // 第一道锁的动态 deny 名单：与 guard 保持一致的可见性——deny = 基础名单
  // - 已开启能力组的工具（开放的工具不能被隐藏）+ 已关闭能力组的工具。
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
  ctx.logger.info(`[handcraft-mode] 本会话已启用：放行 ${summarize()}`)

  // 可见性裁剪：deny 名单隐藏未开放的工具（省 token）。
  try {
    ctx.tools.restrict({ deny: denyList() })
    ctx.logger.info(`[handcraft-mode] 可见性已裁剪：隐藏 ${denyList().length} 个工具`)
  } catch (error) {
    // 典型原因：deny 名单含当前部署未注册的名字。降级 guard-only，
    // 执行仍被锁死，只是模型还看得到这些工具。
    ctx.logger.warn(`[handcraft-mode] restrict 失败，降级 guard-only: ${error?.message ?? error}`)
  }

  // ── 第三层：行为约束段落（注册进本 agent 的 scope 层，随会话销毁清理）。
  // codeSnippets 档位决定段落文本：手搓档（默认）不给完整代码；
  // 演示档允许完整可运行代码，但要求"先思路、再代码、后逐段讲解"。
  const promptText = () => state.codeSnippets ? state.demoPromptText : state.promptText
  let promptDisposer = null
  const injectPrompt = () => {
    if (promptDisposer !== null) {
      promptDisposer()
      promptDisposer = null
    }
    if (!state.injectPrompt) return
    try {
      promptDisposer = ctx.systemPrompt.section({
        name: 'handcraft-mode:policy',
        order: state.sectionOrder,
        text: promptText(),
      })
      ctx.logger.info(`[handcraft-mode] 行为约束段落已注入（${state.codeSnippets ? '代码演示档' : '手搓档'}）`)
    } catch (error) {
      ctx.logger.warn(`[handcraft-mode] 约束段落注入失败（不影响工具锁定）: ${error?.message ?? error}`)
    }
  }
  injectPrompt()

  // settings 变化时：guard/deny 读 state 自动响应；提示段落按档位重注入。
  onSettingsChanged = () => {
    injectPrompt()
  }
}
