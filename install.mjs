#!/usr/bin/env node
/**
 * handcraft-mode 一键安装脚本（零依赖）。
 *
 * 用法（在本仓库根目录执行）：
 *   node install.mjs              # 自动探测 + 创建链接
 *   node install.mjs --preset     # 额外安装 agent 预设（GUI 新建会话可选）
 *   node install.mjs --harness <路径> --profiles <路径>   # 手动指定
 *
 * 做什么：
 *   1. 探测 DeepSeek Harness 源码仓库根（含 apps/cli 与 pnpm-workspace.yaml）
 *   2. 探测 DSH profiles 根（默认 ~/.dsh/profiles）
 *   3. 把本插件目录链接进两处解析根（host 半加载 + 浏览器半发现）
 *   4. （--preset）把 preset/ 目录复制为 ~/.dsh/.agent-presets/handcraft
 *
 * 幂等：重复运行会更新已有链接；pnpm install 清掉链接后重跑即可。
 * 卸载：删掉下面打印的两条链接（和 --preset 装的预设目录）。
 */
import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, rmSync, symlinkSync, copyFileSync, statSync, readlinkSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { homedir } from 'node:os'

const HERE = dirname(fileURLToPath(import.meta.url))
const PACKAGE_NAME = 'handcraft-mode'

const args = process.argv.slice(2)
const flag = (name) => {
  const i = args.indexOf(name)
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : undefined
}
const withPreset = args.includes('--preset')

// ── 1. 探测 DSH 仓库根 ──────────────────────────────────────────────────
function findHarnessRoot(from) {
  let dir = from
  for (;;) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml')) && existsSync(join(dir, 'apps', 'cli'))) return dir
    const parent = dirname(dir)
    if (parent === dir) return undefined
    dir = parent
  }
}

/** 从正在运行的 dsh web 进程的工作目录探测仓库根（Linux /proc）。 */
function findHarnessByProcess() {
  try {
    const out = execFileSync('ps', ['-eo', 'pid,args'], { encoding: 'utf8' })
    for (const line of out.split('\n')) {
      if (!/dsh\s+web/.test(line)) continue
      const pid = line.trim().split(/\s+/)[0]
      if (!/^\d+$/.test(pid)) continue
      try {
        const cwd = readlinkSync(`/proc/${pid}/cwd`)
        if (findHarnessRoot(cwd) !== undefined) return findHarnessRoot(cwd)
      } catch { /* 无权限或非 Linux，跳过 */ }
    }
  } catch { /* ps 不可用 */ }
  return undefined
}

const harnessFlag = flag('--harness')
const harnessRoot = harnessFlag !== undefined
  ? resolve(harnessFlag)
  : findHarnessRoot(HERE) ?? findHarnessByProcess()
if (harnessRoot === undefined || !existsSync(harnessRoot)) {
  console.error('[install] 找不到 DeepSeek Harness 源码仓库根（已尝试：向上查找、运行中的 dsh web 进程）。')
  console.error('[install] 请用 --harness <路径> 显式指定，例如：node install.mjs --harness /path/to/deepseek-harness')
  process.exit(1)
}

// ── 2. 探测 profiles 根 ─────────────────────────────────────────────────
const profilesFlag = flag('--profiles')
const profilesRoot = profilesFlag !== undefined
  ? resolve(profilesFlag)
  : join(homedir(), '.dsh', 'profiles')
if (!existsSync(profilesRoot)) {
  console.error(`[install] 找不到 DSH profiles 根：${profilesRoot}`)
  console.error('[install] 请用 --profiles <路径> 显式指定。')
  process.exit(1)
}

// ── 3. 创建链接 ─────────────────────────────────────────────────────────
function linkInto(linkPath) {
  try {
    if (existsSync(linkPath) || lstatSync(linkPath)) {
      if (statSync(linkPath).isDirectory()) {
        // 同名真实目录（不是链接）：拒绝覆盖，避免误删用户数据。
        console.error(`[install] 目标已存在且是真实目录，跳过（请手动处理）：${linkPath}`)
        return false
      }
      rmSync(linkPath, { force: true })
    }
  } catch { /* 不存在，直接建 */ }
  symlinkSync(HERE, linkPath, process.platform === 'win32' ? 'junction' : 'dir')
  return true
}

const targets = [
  join(profilesRoot, 'node_modules', PACKAGE_NAME),
  join(harnessRoot, 'node_modules', '.pnpm', 'node_modules', PACKAGE_NAME),
]

console.log(`[install] 插件目录：${HERE}`)
console.log(`[install] Harness 仓库：${harnessRoot}`)
console.log(`[install] Profiles 根：${profilesRoot}`)
for (const target of targets) {
  const ok = linkInto(target)
  console.log(`[install] ${ok ? '已链接' : '跳过  '} ${target} → ${HERE}`)
}

// ── 4. （可选）安装 agent 预设 ──────────────────────────────────────────
if (withPreset) {
  const srcPreset = join(HERE, 'preset')
  const destRoot = join(homedir(), '.dsh', '.agent-presets', 'handcraft')
  if (!existsSync(srcPreset)) {
    console.error(`[install] 仓库内没有 preset/ 目录：${srcPreset}`)
  } else {
    mkdirSync(destRoot, { recursive: true })
    for (const file of readdirSync(srcPreset)) {
      const src = join(srcPreset, file)
      if (!statSync(src).isFile()) continue
      copyFileSync(src, join(destRoot, file))
      console.log(`[install] 预设已安装：${join(destRoot, file)}`)
    }
  }
}

// ── 5. 启用说明 ─────────────────────────────────────────────────────────
console.log()
console.log('完成。接下来：')
console.log('  1) 重启 dsh web（停止后重新运行 pnpm dsh web），刷新浏览器')
console.log('  2) 全局启用（所有会话）：在 Harness 仓库根运行：')
console.log(`     pnpm dsh web --patch ${join(HERE, 'cordis.yml')}`)
console.log('     或把 cordis.yml 里的 - insert: 段合并进 ~/.dsh/profiles/web/cordis.yml')
if (withPreset) {
  console.log('  3) 预设已装：新建会话时在预设选择器里选「手搓模式」')
}
console.log()
console.log('验证：启动日志出现 [handcraft-mode] 行；设置面板 General 出现「手搓模式」行。')
console.log('卸载：删除上面列出的两条链接' + (withPreset ? ' 与 ~/.dsh/.agent-presets/handcraft' : '') + '。')
