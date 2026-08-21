# 蓝鲸鱼 · 安装与使用指南

## 环境要求

- **Node.js ≥ 20 与 dsh CLI**：蓝鲸鱼不自带 Harness，它托管你本机的 `dsh`。
  ```powershell
  npm install -g @deepseek-ai/dsh
  ```
- **pnpm**（插件自动安装需要）：`npm install -g pnpm`
- Windows 10/11（WebView2 内置）或 macOS 12+。

## 安装

### Windows

1. 从发行页下载 `蓝鲸鱼 Setup 0.1.0.exe`（NSIS，可改安装目录）或 `蓝鲸鱼 0.1.0.msi`。
2. 安装后启动；首次启动会在托盘常驻并自动启动 `dsh web`。
3. 如需桌面通知等集成能力，首次启动会自动把 `dsh-blue-whale` 插件装进 `web` profile（可在设置中关闭）。

### macOS

1. 下载 `蓝鲸鱼-0.1.0.dmg`，拖入 Applications。
2. 未签名构建首次打开需右键 → 打开（或 `xattr -dr com.apple.quarantine` 后打开）。

## 使用

| 入口 | 说明 |
|---|---|
| 主窗口 | 嵌入官方 Web UI（http://127.0.0.1:<port>），与浏览器版完全一致 |
| 托盘 | 状态图标（绿点=运行中）；显示/隐藏、浏览器打开、重启服务、日志、设置、退出 |
| 通知 | 会话完成、服务崩溃/恢复、插件安装结果等原生通知；点击聚焦窗口 |
| 设置窗口 | 菜单「文件 → 设置」：profile、端口、dsh 命令、工作目录、托盘/自启/通知开关、插件安装 |

## 常见问题

**端口被占用**：设置里把端口改成 0（自动选空闲端口）或其他值。

**看不到桌面通知**：确认设置中「桌面通知」开启；Windows 需允许应用在系统通知设置中显示。

**想先试用再装插件**：设置 → Profile 填 `web-bw-test`（或其他测试 profile），应用会托管该 profile；插件安装也只作用于所选 profile。

**dsh 不在 PATH**：设置 → dsh 命令填绝对路径（如 `C:\Users\you\AppData\Roaming\npm\dsh.cmd`）。

**日志**：托盘/菜单「打开日志」，文件位于
- Windows：`%APPDATA%\dsh-blue-whale-app\logs\main.log`
- macOS：`~/Library/Application Support/dsh-blue-whale-app/logs/main.log`

## 卸载

- Windows：控制面板卸载「蓝鲸鱼」；`~/.dsh` 与各 profile 不受影响。若不再需要桥接插件，运行
  `dsh plugin --profile web remove dsh-blue-whale`。
