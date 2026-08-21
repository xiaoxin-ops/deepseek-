# 蓝鲸鱼 · DSH Desktop

DeepSeek Harness 的原生桌面客户端：**Electron + Vue 3 + TypeScript** 桌面壳 + **dsh-blue-whale** 桥接插件。

- **核心集成**：自动启动并托管本地 `dsh web` 服务（崩溃自动重启、退出优雅关闭），把官方 Web UI 嵌入原生窗口
- **原生体验**：系统托盘、桌面通知（会话完成等）、自定义应用菜单、隐藏到托盘、单实例
- **一切皆插件**：桌面集成能力全部来自 `dsh-blue-whale` 插件，经官方 `dsh plugin` 通道安装，与官方生态无缝组合；纯浏览器打开同一 UI 时插件完全惰性
- **跨平台**：Windows（NSIS .exe + MSI）、macOS（.dmg），构建在 GitHub Actions 完成（本仓库 `plugin/` 与 `app/` 均为纯 npm 工程）

## 仓库结构

```
dsh-blue-whale/
├── plugin/          # dsh-blue-whale 桥接插件（DSH 插件，npm 包）
│   ├── src/index.ts     # Node 半边：/blue-whale/ws + /api/status
│   ├── src/client.ts    # Client 半边：dshDesktop 服务 + 会话完成通知
│   ├── cordis.patch.yml
│   └── dsh.plugin.json
├── app/             # 蓝鲸鱼桌面壳（Electron + Vue 3）
│   ├── electron/        # 主进程：dsh-service / tray / menu / notifications
│   ├── renderer/        # 设置与关于窗口（Vue 3 + Vite）
│   └── preload/
├── scripts/         # 图标生成等构建脚本
├── docs/            # 架构文档
└── .github/         # CI：Windows 安装包 + macOS .dmg
```

## 快速开始（本机）

```powershell
npm install                       # 工作区依赖（含 Electron）
node scripts/make-icon.mjs        # 生成应用图标
npm run plugin:build              # 构建插件 lib/
npm run plugin:pack               # 打包插件 tarball 到 dist/

# 1) 把插件装进测试 profile（不动你现有的 web profile）
#    确保 PATH 里有 pnpm；或使用 .runtime\npm-global\node_modules\.bin\pnpm.cmd
dsh plugin --profile web-bw-test add @deepseek-ai/dsh-web-app ./dist/dsh-blue-whale-0.1.0.tgz

# 2) 开发模式启动桌面壳
npm run app:dev
```

首次运行桌面壳会引导设置：选择 profile（默认 `web`）、端口（默认 3080，或 0 = 自动选空闲端口）、工作目录，并可一键把 `dsh-blue-whale` 安装到该 profile（默认开启，可关闭）。

## 构建安装包

```powershell
npm run app:dist        # 本机产出 Windows NSIS .exe + MSI（dist-packages/）
```

macOS .dmg 由 GitHub Actions 产出（`.github/workflows/build.yml`，windows/macos 双平台）。

## 文档

- 架构与设计：[docs/architecture.md](docs/architecture.md)
- 插件协议：[plugin/README.zh.md](plugin/README.zh.md)
