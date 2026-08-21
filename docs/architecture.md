# 蓝鲸鱼 · 架构设计

「蓝鲸鱼」（DSH Desktop）把 DeepSeek Harness 的官方 Web UI 变成原生桌面应用。设计红线是**一切皆插件**：桌面壳不包含任何 Harness 私有逻辑，所有桌面集成能力都来自一个合法的 DSH 插件 `dsh-blue-whale`，通过官方 `dsh plugin` 通道安装。

## 总体架构

```
┌──────────────────────────── 蓝鲸鱼桌面壳（Electron） ────────────────────────────┐
│  main 进程                                                         │  renderer    │
│  ┌─────────────┐  ┌────────────┐  ┌─────────────┐  ┌───────────┐  │  (Vue 3)     │
│  │ DshService   │  │ BridgeClient│  │ Tray        │  │ Menu      │  │  设置/关于    │
│  │ 进程托管      │  │ WS 客户端   │  │ 系统托盘     │  │ 应用菜单   │  │  加载/离线页  │
│  └──────┬──────┘  └─────┬──────┘  └─────────────┘  └───────────┘  │              │
│         │ spawn         │ ws://127.0.0.1:<port>/blue-whale/ws      │              │
│  ┌──────▼───────────────▼───────────────────────────────┐          │              │
│  │ BrowserWindow（嵌入官方 Web UI）                       │◄─────────┘              │
│  │  http://127.0.0.1:<port>/   preload → window.dshDesktop│                        │
│  └───────────────────────────────────────────────────────┘                        │
└───────────────────────────────┬─────────────────────────────────────────────────────┘
                                │ 子进程（托管）
┌───────────────────────────────▼─────────────────────────────────────────────────────┐
│  dsh web（--no-open --port <port>，用户 profile + dsh-blue-whale 插件）             │
│  ┌──────────────────────────┐   ┌──────────────────────────────────────────┐       │
│  │ dsh-blue-whale Node 半边  │   │ dsh-blue-whale Client 半边（官方 UI 内）  │       │
│  │ /blue-whale/api/status   │   │ window.dshDesktop 检测 → dshDesktop 服务 │       │
│  │ /blue-whale/ws           │   │ sessions.list 订阅 → 回合完成通知         │       │
│  └──────────────────────────┘   └──────────────────────────────────────────┘       │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

## 组件职责

### DshService（进程托管）

- `dsh web --no-open --port <port>`（profile ≠ `web` 时改用 `--profile <name>` 形式）。
- 从 stdout 的 `dsh web: <url>` 行发现规范 URL（`--port 0` 自动选口时这是唯一来源）；沙箱/受限环境下退化到 `stdio: inherit` + 固定端口直接推导。
- 健康轮询直到 HTTP 可服务；意外退出按 1s/2s/5s/10s 退避自动重启（可关）。
- 停止时整树终止（Windows `taskkill /T /F`）；退出应用时优雅关闭。

### BridgeClient（WS 通道）

- 连接 `ws://<host>/blue-whale/ws`，`hello`/`ping` 心跳；接收 `welcome`（插件版本）与 `event`（`session.completed` 等）→ 原生通知。
- 断线 5s 退避重连；通道由插件内置的官方浏览器信任栅栏保护。

### 原生体验

- **托盘**：状态图标（运行/停止双态）、tooltip 显示状态与 URL、菜单（显示/隐藏、浏览器打开、重启服务、日志、设置、退出）。
- **通知**：服务崩溃/插件安装等壳级事件 + 插件转发的会话完成事件；点击通知聚焦窗口；可全局关闭。
- **菜单**：文件/视图/服务/帮助（重载、缩放、开发者工具可选、快捷键）。
- 单实例锁、关闭隐藏到托盘、登录自启（可选）。

### dsh-blue-whale 插件

| 半边 | 位置 | 职责 |
|---|---|---|
| Node | `dsh web` 进程内 | 注册 `/blue-whale/api/status` 与 `/blue-whale/ws`；转发主机会话事件；受浏览器信任栅栏保护 |
| Client | 官方 Web UI 内 | 检测 `window.dshDesktop`（preload 注入）→ 提供 `dshDesktop` 服务供其他插件调用；订阅 `sessions.list` 的运行位下降沿 → 原生通知；纯浏览器下完全惰性 |

有线协议见 [plugin/README.zh.md](../plugin/README.zh.md)。

## 关键设计决策

1. **不打包 Harness**：壳只托管用户本机的 `dsh`（PATH 解析，可在设置中覆盖路径）。升级 Harness 无需升级桌面客户端。
2. **一切皆插件**：托盘菜单里没有一条“桌面能力”逻辑依赖 Harness 内部 API——壳只通过插件暴露的 WS/HTTP 通道与 UI 交互；官方 UI 内其他插件也可通过 `dshDesktop` 服务调用原生能力。
3. **测试 profile 先行**：默认 profile 为 `web`，但设置中可切换任意 profile（如 `web-bw-test`），保证在不动日常环境的前提下验证插件。
4. **降级安全**：管道捕获受限（EPERM）、插件未装、`--port 0` 无法发现 URL 等场景都有明确降级路径，UI 给出可操作的离线页。
5. **跨平台构建**：Windows `.exe`(NSIS)/`.msi` 与本机开发可在 Windows 完成；macOS `.dmg` 由 GitHub Actions 的 macos 跑者产出（`.github/workflows/build.yml`）。
