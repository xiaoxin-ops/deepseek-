# 蓝鲸鱼 · 开发者文档

## 仓库布局

```
dsh-blue-whale/
├── plugin/    dsh-blue-whale 桥接插件（TypeScript + esbuild，DSH 插件包）
├── app/       Electron 桌面壳（electron/ 主进程 TS + renderer/ Vue 3）
├── scripts/   make-icon.mjs（图标生成）· build-renderer.mjs（渲染层微构建）
├── dist/      npm pack 产物：dsh-blue-whale-<version>.tgz（随安装包分发）
└── docs/      架构设计见 architecture.md
```

## 构建

```powershell
npm install
node scripts/make-icon.mjs        # 生成 app/build/*.png
npm run plugin:build              # 插件 lib/（esbuild 平台二进制直调）
npm run plugin:pack               # 插件 tarball → dist/
npm run app:build                 # tsc 主进程 + 渲染层微构建
npm run app:dist:win              # Windows NSIS + MSI → app/dist-packages/
```

## 联调（本机）

```powershell
# 1) 测试 profile（隔离，不动日常 web profile）
$env:PATH = 'C:\Users\lenovo\Desktop\he-jia-qing\.runtime\npm-global\node_modules\.bin;' + $env:PATH
$env:DSH_HOME = '<repo>\.runtime\dsh-home'          # 隔离的 DSH_HOME
dsh plugin --profile web-bw-test add -w --ignore-scripts '@deepseek-ai/dsh-web-app@0.1.1-rc.1' '<repo>\dist\dsh-blue-whale-0.1.0.tgz'
dsh plugin --profile web-bw-test add -w --ignore-scripts 'react@18.3.1' 'react-dom@18.3.1'

# 2) 预置设置 + 启动壳
$env:BLUE_WHALE_USER_DATA = '<repo>\.runtime\user-data'   # 便携用户目录
node_modules\.bin\electron.cmd app
```

## 沙箱环境的已知坑（本仓库已内置规避）

- Node 子进程带管道 stdio 会被沙箱以 EPERM 拒绝：
  - 插件构建直接调用 esbuild 平台二进制（`stdio: inherit`）；
  - 渲染层不用 vite/esbuild JS API，用 `scripts/build-renderer.mjs`（compiler-sfc 进程内 + esbuild 二进制）；
  - 桌面壳 spawn `dsh` 失败时自动降级 `stdio: inherit` + 固定端口推导 URL。
- pnpm 生命周期脚本被拒：安装测试 profile 时加 `--ignore-scripts`（二进制来自可选依赖，无需脚本）。
- npm/electron-builder 缓存目录须指到工作区（`--cache` / `ELECTRON_BUILDER_CACHE`）。
- Electron 本体在沙箱内无法创建窗口（异常码 -36861）：联调需全权限运行 `electron app --no-sandbox`；仅影响本开发沙箱，正式包不受影响。

## 发布

1. `npm run app:dist` 产 Windows 包；macOS `.dmg` 由 GitHub Actions（`.github/workflows/build.yml`）产出。
2. 插件可独立发布：`cd plugin && npm publish`（或发布 tarball 供 `dsh plugin add <file>` 使用）。
3. 版本号：`app/package.json`、`plugin/package.json`、`app/electron/bridge.ts` 中的 hello version 需同步。
