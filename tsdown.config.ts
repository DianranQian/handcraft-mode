/**
 * 手搓模式 client 半构建配置。
 * 等价于仓库 packages/client/tsdown.client.ts 的 clientBundle()：
 * 产物是 closure-factory bundle —— 调用 window.__ModuleLoader__.load({id, factory})，
 * externals 通过注入的 require 解析（loader module table）。
 * 平台模块（external）名单来自 packages/client/web/src/platform.ts 的
 * PLATFORM_MODULES + 文档化的 RUNTIME_STORE_EXEMPTION。
 */
import { defineConfig } from 'tsdown'

const PLUGIN_ID = 'handcraft-mode'

/** 平台 seed 条目：loader module table 提供，必须 external。 */
const PLATFORM_MODULES = [
  'react', 'react/jsx-runtime', 'react-dom', 'react-dom/client', '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-web-react',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-attachment',
  '@deepseek-ai/dsh-client-schema-form',
]

/** 文档化豁免：snapshot-store 引擎在 runtime 里，运行时由 lazy CJS table 应答。 */
const RUNTIME_STORE_EXEMPTION = '@deepseek-ai/dsh-client-runtime/client'

const CLIENT_EXTERNALS = [...PLATFORM_MODULES, RUNTIME_STORE_EXEMPTION]

export default defineConfig({
  name: `${PLUGIN_ID}/client`,
  entry: { client: 'src/client/index.ts' },
  outDir: 'lib',
  format: 'cjs',
  platform: 'browser',
  target: 'es2024',
  dts: false,
  sourcemap: true,
  clean: false,
  external: CLIENT_EXTERNALS,
  // 除平台模块外全部内联（本插件只有 react 与两个 platform 包是 external）。
  noExternal: (id: string) => (CLIENT_EXTERNALS.includes(id) ? undefined : true),
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'production'),
    'import.meta.env.MODE': JSON.stringify(process.env.NODE_ENV ?? 'production'),
    'import.meta.env': JSON.stringify({ MODE: process.env.NODE_ENV ?? 'production' }),
  },
  outputOptions: {
    entryFileNames: 'client.js',
    banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(PLUGIN_ID)}, factory: (require) => {`,
    footer: 'return module.exports; } });',
    intro: 'var module = { exports: {} }; var exports = module.exports;',
  },
})
