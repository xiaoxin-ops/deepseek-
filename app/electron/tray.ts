/**
 * 蓝鲸鱼 system tray: status icon + context menu (show/hide, open in
 * browser, service controls, logs, quit).
 */
import { Menu, Tray, app, nativeImage, shell } from 'electron'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { log } from './logger'
import type { ServiceSnapshot } from './dsh-service'

export interface TrayActions {
  showMainWindow(): void
  openInBrowser(): void
  restartService(): void
  openLogs(): void
  openSettings(): void
  quit(): void
}

let tray: Tray | null = null
let actions: TrayActions | null = null

function iconFor(state: string): Electron.NativeImage | undefined {
  const base = join(__dirname, '..', 'build', 'tray')
  const candidates = state === 'running' || state === 'starting'
    ? [join(base, 'tray-running.png'), join(base, 'tray.png')]
    : [join(base, 'tray.png'), join(base, 'tray-running.png')]
  for (const candidate of candidates) {
    if (existsSync(candidate)) return nativeImage.createFromPath(candidate)
  }
  const fallback = join(__dirname, '..', 'build', 'icon.png')
  if (existsSync(fallback)) {
    const image = nativeImage.createFromPath(fallback)
    return image.resize({ width: 16, height: 16 })
  }
  return undefined
}

export function createTray(snapshot: () => ServiceSnapshot, handlers: TrayActions): void {
  actions = handlers
  const image = iconFor(snapshot().state)
  tray = new Tray(image ?? nativeImage.createEmpty())
  tray.setToolTip('蓝鲸鱼 · DSH Desktop')
  rebuildTrayMenu(snapshot())
}

export function updateTray(snapshot: ServiceSnapshot): void {
  if (tray === null) return
  const image = iconFor(snapshot.state)
  if (image !== undefined) tray.setImage(image)
  tray.setToolTip(tooltipFor(snapshot))
  rebuildTrayMenu(snapshot)
}

function tooltipFor(snapshot: ServiceSnapshot): string {
  const stateLabel = {
    stopped: '已停止',
    starting: '启动中…',
    running: '运行中',
    stopping: '停止中…',
  }[snapshot.state]
  const url = snapshot.url !== null ? ` · ${snapshot.url}` : ''
  return `蓝鲸鱼 · ${stateLabel}${url}`
}

function rebuildTrayMenu(snapshot: ServiceSnapshot): void {
  if (tray === null || actions === null) return
  const a = actions
  const running = snapshot.state === 'running'
  const menu = Menu.buildFromTemplate([
    { label: '显示主窗口', click: () => a.showMainWindow() },
    {
      label: running ? '在浏览器中打开' : '在浏览器中打开（未运行）',
      enabled: running,
      click: () => a.openInBrowser(),
    },
    { type: 'separator' },
    {
      label: running ? '重启 Harness 服务' : '启动 Harness 服务',
      click: () => a.restartService(),
    },
    { label: '打开日志', click: () => a.openLogs() },
    { label: '设置…', click: () => a.openSettings() },
    { type: 'separator' },
    { label: '退出 蓝鲸鱼', click: () => a.quit() },
  ])
  tray.setContextMenu(menu)
}

export function destroyTray(): void {
  if (tray !== null) {
    tray.destroy()
    tray = null
  }
}

export function openInBrowser(snapshot: ServiceSnapshot): void {
  if (snapshot.url !== null) {
    void shell.openExternal(snapshot.url)
  }
}

export { app, log }
