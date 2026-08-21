# dsh-blue-whale

「蓝鲸鱼」桌面客户端（DSH Desktop）的桥接插件 —— DeepSeek Harness Web GUI 的原生桌面通道。

一切皆插件：桌面壳（Electron）本身不含任何 Harness 私有逻辑，只负责进程托管与原生 UI；**所有桌面集成能力都来自本插件**，通过官方插件通道（`dsh plugin`）安装，与官方生态无缝组合。

## 结构

| 半边 | 文件 | 职责 |
|---|---|---|
| Node 半边 | `src/index.ts` | 在 `dsh web` 进程内注册 `/blue-whale/api/status`（HTTP）与 `/blue-whale/ws`（WebSocket），向桌面壳报告插件/配置事实并转发主机事件（会话完成等） |
| Client 半边 | `src/client.ts` | 在官方 Web UI 内运行：检测 `window.dshDesktop`（桌面壳 preload 注入），提供 `dshDesktop` 服务供其他插件调用，并在会话回合结束时触发原生桌面通知；纯浏览器环境下完全惰性 |

## 安装

```sh
dsh plugin --profile <name> add <dsh-blue-whale 包或 tarball 路径>
```

`dsh plugin` 会完成依赖安装并把 `dsh-blue-whale` 追加进 `dsh.profile.bundles`，无需手改 profile 文件。

## 有线协议

- WS `/blue-whale/ws`（JSON 消息）：`hello`/`ping`（壳 → 主机）、`welcome`/`pong`/`event`（主机 → 壳）。受官方浏览器信任栅栏保护（回环 + `--trusted-host` + 同源校验）。
- HTTP `/blue-whale/api/status`：`{ ok, plugin, version, profile, shellConnected }`。
- `window.dshDesktop`（preload 桥）：`notify()`、`setBadge()`、`flashFrame()`、`showWindow()`。

## 开发

```sh
pnpm build      # 或 npm run build（esbuild 产出 lib/index.js + lib/client.js）
pnpm typecheck  # tsc --noEmit
pnpm pack       # 产出 tarball 到 ../dist
```
