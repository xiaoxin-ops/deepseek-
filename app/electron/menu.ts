/**
 * 蓝鲸鱼 application menu (macOS global bar / Windows window menu).
 */
import { Menu, app, shell, type MenuItemConstructorOptions } from 'electron'

export interface MenuActions {
  reloadPage(): void
  openSettings(): void
  restartService(): void
  openLogs(): void
  openInBrowser(): void
  quit(): void
}

const isMac = process.platform === 'darwin'

export function installMenu(actions: MenuActions, devtoolsEnabled: boolean): void {
  const a = actions

  const template: MenuItemConstructorOptions[] = [
    ...(isMac
      ? [{
          label: app.name,
          submenu: [
            { role: 'about' as const, label: '关于 蓝鲸鱼' },
            { type: 'separator' as const },
            { label: '设置…', accelerator: 'CmdOrCtrl+,', click: () => a.openSettings() },
            { type: 'separator' as const },
            { role: 'hide' as const, label: '隐藏 蓝鲸鱼' },
            { role: 'quit' as const, label: '退出 蓝鲸鱼' },
          ],
        }]
      : []),
    {
      label: '文件',
      submenu: [
        { label: '设置…', accelerator: 'CmdOrCtrl+,', click: () => a.openSettings() },
        { type: 'separator' },
        isMac ? { role: 'close' as const, label: '关闭窗口' } : { role: 'quit' as const, label: '退出' },
      ],
    },
    {
      label: '视图',
      submenu: [
        { label: '重新加载界面', accelerator: 'CmdOrCtrl+R', click: () => a.reloadPage() },
        { role: 'togglefullscreen', label: '切换全屏' },
        ...(devtoolsEnabled
          ? [{ role: 'toggleDevTools' as const, label: '开发者工具' }]
          : []),
        ...(!isMac
          ? [{ type: 'separator' as const }, { role: 'resetZoom' as const, label: '重置缩放' }, { role: 'zoomIn' as const, label: '放大' }, { role: 'zoomOut' as const, label: '缩小' }]
          : []),
      ],
    },
    {
      label: '服务',
      submenu: [
        { label: '重启 Harness 服务', accelerator: 'CmdOrCtrl+Shift+R', click: () => a.restartService() },
        { label: '打开日志', click: () => a.openLogs() },
        { label: '在浏览器中打开', click: () => a.openInBrowser() },
      ],
    },
    {
      label: '帮助',
      role: 'help',
      submenu: [
        { label: '项目主页', click: () => void shell.openExternal('https://github.com/deepseek-ai/deepseek-harness') },
        { label: 'DSH 文档', click: () => void shell.openExternal('https://github.com/deepseek-ai/deepseek-harness#readme') },
      ],
    },
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
