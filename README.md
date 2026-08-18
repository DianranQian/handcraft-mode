# handcraft-mode（手搓模式）

DeepSeek Harness 插件：让 AI 只能动嘴、不能替你动手。

- **默认禁止**：执行命令（bash/ssh）、写文件/改文件（write/edit）、派活（子代理/浏览器/画布/记忆写入）等一切"替你干活"的操作
- **默认允许**（可在 UI 勾选关闭）：读文件（read/read_image/glob/grep）、搜索与网络（web_search + MCP 搜索工具）、提问（ask_user_question）
- **可选开启**（UI 勾选，默认关）：写文件（write/edit/str_replace_editor）
- AI 不给完整代码让你复制，只给关键代码片段 + 思路讲解，逼你亲手敲
- 顺带省 token：被禁工具对模型**不可见**，模型不会浪费输出去尝试调用

## UI 开关

插件启用后，Web GUI **设置面板 → General** 会出现「手搓模式」一行：

- **启用**（总开关，关掉 = 完全退出手搓模式，所有工具放行）
- **读文件**（read / read_image / glob / grep）— 默认开
- **搜索与网络**（web_search + MCP 搜索工具）— 默认开
- **提问**（ask_user_question）— 默认开
- **写文件**（write / edit / str_replace_editor）— **默认关**

改动经 host settings 即时生效（applies: live），不用重启，设置持久化保存。

## 安装（三条命令，无需改任何路径）

```sh
git clone https://github.com/DianranQian/handcraft-mode.git
cd handcraft-mode
node install.mjs          # 自动探测 Harness 仓库与 profiles 并建立解析链接
```

可选：`node install.mjs --preset` 额外安装 agent 预设（GUI 新建会话时可选「手搓模式」）。
探测失败时用 `--harness <路径>` / `--profiles <路径>` 显式指定。

然后重启 dsh web、刷新浏览器，启用：

```sh
pnpm dsh web --patch <本仓库路径>/cordis.yml   # 全局生效；或在 Harness 仓库根运行
```

验证：启动日志出现 `[handcraft-mode]` 行；设置面板 General 出现「手搓模式」行。

> 说明：`pnpm install`（Harness 仓库或 profiles）可能清掉手工链接，重跑 `node install.mjs` 即可。
> 卸载：运行 `node install.mjs` 打印的两条链接删除，外加 `--preset` 装的 `~/.dsh/.agent-presets/handcraft`。

## 文件结构

```
handcraft-mode/
├── package.json          # 包声明：dsh.client 指向 lib/client.js（浏览器半）
├── handcraft-mode.mjs    # host 半：双锁 + 行为约束 + settings 注册（零构建）
├── install.mjs           # 一键安装：自动探测 + 建立解析链接（+ --preset）
├── preset/               # agent 预设模板（install.mjs --preset 安装）
│   ├── preset.yml
│   └── agent.cordis.yml
├── src/client/           # 浏览器半源码（TS/React 设置行）
│   ├── index.ts
│   ├── HandcraftRow.tsx
│   └── settings-store.ts
├── tsdown.config.ts      # client 半构建配置（closure-factory bundle）
├── lib/client.js         # 构建产物（tsdown 生成）
├── cordis.yml            # --patch 启用配置
└── smoke-test.mjs        # 冒烟测试（node smoke-test.mjs）
```

## 开发（改了浏览器半之后重新构建）

```sh
node <Harness 仓库>/node_modules/.bin/tsdown    # 在插件目录运行
node smoke-test.mjs                             # 跑冒烟测试
```

## 工作原理（三层）

1. **guard（执行闸门，硬锁）**——`ctx.tools.guard()`：白名单放行（读/搜/问/写按
   设置动态组装），其余工具调用一律返回拒绝理由；`enabled=false` 全放行。
   状态由 settings `watch` 驱动，UI 改动即时生效。
2. **restrict（可见性锁，省 token）**——deny 名单动态计算：基础名单（默认 40 个
   动手工具）减去已开启能力组的工具（开放的工具不能被隐藏），加上已关闭能力组
   的工具；对模型隐藏。deny 含未注册名字时自动降级 guard-only（执行仍锁死）。
3. **systemPrompt.section（提示约束）**——注入"只能动嘴、只给关键片段、
   每次讲透一件事"的行为规则段落。

两种装载场景自适应：预设装载（ctx 即 agent scoped）直接锁本 agent；`--patch`
装载（全局 ctx）监听 `agent/created` 对每个新 agent 的 `agent.ctx` 施加同样
两道锁。全部钩子 try/catch 容错。

## 配置项（cordis.yml → config，UI 开关会覆盖）

| 字段 | 默认 | 说明 |
| --- | --- | --- |
| `enabled` | `true` | 总开关；false = 完全放行 |
| `readTools` | `true` | 读文件：read/read_image/glob/grep |
| `searchTools` | `true` | 搜索/网络：web_search + `mcp__*` 搜索前缀 |
| `askTools` | `true` | 提问：ask_user_question |
| `writeTools` | `false` | 写文件：write/edit/str_replace_editor（默认关） |
| `injectPrompt` | `true` | 注入行为约束段落 |
| `sectionOrder` | `50` | 约束段落在系统提示中的排序 |
| `promptText` | 内置 | 自定义约束段落 |
| `denyReason` | 内置 | 拒绝理由文案 |
| `denyTools` | 内置 40 个 | restrict 隐藏名单基础项（可覆盖） |

## 注意事项

- **硬锁是工具层**：命令/文件写入/派活工具一定被拒；"不给完整代码"是
  提示约束（软约束），偶发给了大段代码就回它"手搓模式，只给片段"。
- UI 开关对**已存在会话**的执行层即时生效；可见性（restrict）按会话创建时的
  设置快照，改设置后新开会话完全生效。
- 想彻底全锁（连读/搜/问都不要）：UI 里全部取消勾选即可。
