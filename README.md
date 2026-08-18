# handcraft-mode（手搓模式）

DeepSeek Harness 社区插件：让 AI 只能动嘴、不能替你动手。

- **会话级生效**：插件装上后**不锁任何会话**；只有你新建会话选了「手搓模式」预设，那个会话才被锁定，其他会话完全不受影响
- **默认禁止**：执行命令（bash/ssh）、写文件（write/edit）、派活（子代理/浏览器/画布/记忆写入）等
- **默认允许**（可在 UI 勾选关闭）：读文件（read/read_image/glob/grep）、搜索与网络（web_search + MCP 搜索工具）、提问（ask_user_question）
- **代码演示**（默认开，可关）：允许 AI 给完整可运行代码 + 讲解；关掉则只给关键片段（严格手搓档）
- AI 不给完整代码让你复制，只给关键代码片段 + 思路讲解，逼你亲手敲；被禁工具对模型不可见，顺带省 token

## 安装（官方 bundle 机制，两条命令）

```sh
# 1) 安装插件包（装进 profile，自动启用 bundle 层）
pnpm dsh plugin --profile web add github:DianranQian/handcraft-mode

# 2) （可选）安装 agent 预设：新建会话时可选「手搓模式」
mkdir -p ~/.dsh/.agent-presets/handcraft
cp preset/preset.yml preset/agent.cordis.yml ~/.dsh/.agent-presets/handcraft/
```

重启 dsh web，刷新浏览器。验证：设置面板出现「手搓模式」分区入口。

本地开发时用 `pnpm dsh plugin --profile web add ./handcraft-mode`（指向本地目录）替代第 1 步。

> 从 GitHub 安装会执行包的 `prepare` 构建脚本：pnpm ≥10 首次安装会拒绝，
> 按提示把包名加入 profile 的 `pnpm-workspace.yaml` 的 `allowBuilds` 后重试
> （详见官方 publish 文档）。不想开构建权限就发布 npm 或用 `pnpm pack` 的 tarball。

## 网页版提示词（不用装插件也能用）

不想装插件？复制 `prompt.md` 里的提示词粘贴到 DeepSeek 网页版 / App 即可获得手搓模式体验（含手搓档、演示档两个选择）。详见 [prompt.md](prompt.md)。

## 使用

1. 新建会话 → 预设选择器选「手搓模式」→ 只有这个会话被锁定
2. 设置面板 → 导航里的「手搓模式」分区：总开关 + 读文件 / 看图 / 搜索网络 / 提问 / 写文件 / 记忆与待办 / 代码演示（默认开）七个能力开关，改动即时生效
3. 想退出：关掉「启用」总开关（该会话全部工具放行）

## 文件结构

```
handcraft-mode/
├── package.json          # 包声明：dsh.bundle（patch 层）+ dsh.client（浏览器半）
├── handcraft-mode.mjs    # host 半：settings 注册 + 会话级锁定（guard/restrict/提示）
├── preset/               # agent 预设模板（复制到 ~/.dsh/.agent-presets/handcraft/）
│   ├── preset.yml
│   └── agent.cordis.yml
├── src/client/           # 浏览器半源码（TS/React 设置分区，仿 dsh-pet）
│   ├── index.ts
│   ├── HandcraftSection.tsx
│   └── settings-store.ts
├── tsdown.config.ts      # client 半构建配置（closure-factory bundle）
├── lib/client.js         # 构建产物（tsdown 生成）
├── cordis.yml            # bundle 的 patch 层（dsh plugin add 时自动应用）
└── smoke-test.mjs        # 冒烟测试（node smoke-test.mjs）
```

## 工作原理

**会话级设计**：插件在 agent 预设场景装载时（apply 的 ctx 是 agent 的 scoped
context），才注册执行闸门（guard，per-agent）——只锁这个会话及其子代理链；
在全局装载（bundle 层）时只注册 settings（UI 开关与预设共享），不锁任何会话。

三层机制（只作用于手搓模式会话）：
1. **guard（执行闸门，硬锁）**——白名单放行（读/搜/问/写按设置动态组装），
   其余工具调用一律返回拒绝理由；`enabled=false` 全放行。状态由 settings
   `watch` 驱动，UI 改动即时生效。
2. **restrict（可见性锁，省 token）**——deny 名单动态计算：基础名单（默认
   40 个动手工具）- 已开启能力组 + 已关闭能力组；对模型隐藏。deny 含未注册
   名字时自动降级 guard-only（执行仍锁死）。
3. **systemPrompt.section（提示约束）**——注入"只能动嘴、只给关键片段、
   每次讲透一件事"的行为规则段落。

## 配置项（cordis.yml / 预设 config，UI 开关会覆盖）

| 字段 | 默认 | 说明 |
| --- | --- | --- |
| `enabled` | `true` | 总开关；false = 完全放行 |
| `readTools` | `true` | 读文件：read/read_image/glob/grep |
| `visionTools` | `false` | 看图：describe_image / modlens_read_image（默认关） |
| `searchTools` | `true` | 搜索/网络：web_search + `mcp__*` 搜索前缀 |
| `askTools` | `true` | 提问：ask_user_question |
| `writeTools` | `false` | 写文件：write/edit/str_replace_editor（默认关） |
| `memoryTools` | `false` | 记忆与待办：memory/dtodo/目标管理（默认关） |
| `codeSnippets` | `true` | 代码演示档：允许 AI 给完整可运行代码（提示层，默认开） |
| `ecoMode` | `false` | 省电模式：追加"回答精简"规则，降低输出 token 费用 |
| `chanMode` | `false` | DeepSeek 娘模式：AI 化身元气萌娘指导老师（人设层） |
| `demoPromptText` | 内置 | 代码演示档的行为约束段落（可覆盖） |
| `injectPrompt` | `true` | 注入行为约束段落 |
| `sectionOrder` | `50` | 约束段落在系统提示中的排序 |
| `promptText` | 内置 | 自定义约束段落 |
| `denyReason` | 内置 | 拒绝理由文案 |
| `denyTools` | 内置 40 个 | restrict 隐藏名单基础项（可覆盖） |

## 开发

```sh
node <Harness 仓库>/node_modules/.bin/tsdown   # 改了浏览器半之后重建 lib/client.js
node smoke-test.mjs                             # 冒烟测试（38 项）
```

## 省钱建议

- **省电模式开关**：设置面板 → 手搓模式分区 →「省电模式」，打开后 AI 回答被要求精简（少寒暄、少铺垫、代码只给需要的部分），直接降低输出 token 费用
- **历史自动压缩**：预设已内置 compaction（多轮对话自动压缩旧历史），防止输入 token 随轮数膨胀——这是最容易被忽视的费用大头
- **推理档（最大头）**：`~/.dsh/settings.yaml` 里 `agent-default-model.reasoningEffort: max` 很烧钱；空闲学习场景改成 `low` 或删掉该行（用模型默认），费用可降一个量级，体验差别不大
- 工具可见性已最小化（restrict 隐藏未开放工具），工具 schema 占用的输入 token 已压到最低

## 注意事项

- **硬锁是工具层**：命令/文件写入/派活工具一定被拒；"不给完整代码"是
  提示约束（软约束），偶发给了大段代码就回它"手搓模式，只给片段"。
- UI 开关对**已存在会话**的执行层即时生效；可见性（restrict）按会话创建时的
  设置快照，改设置后新开会话完全生效。
- 想彻底全锁（连读/搜/问都不要）：UI 里全部取消勾选即可。
- 卸载：`pnpm dsh plugin --profile web remove handcraft-mode`，再删掉预设目录
  与 `~/.dsh/.agent-presets/handcraft`。
