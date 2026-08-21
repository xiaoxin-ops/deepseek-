/**
 * 蓝鲸鱼 main process: window lifecycle, tray, menu, the dsh service, the
 * bridge WebSocket, and the plugin installer — orchestrated here.
 */
import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { join } from 'node:path'
import { existsSync } from 'node:fs'
import { DshService, type ServiceSnapshot, type DshServiceOptions } from './dsh-service'
import { BridgeClient } from './bridge'
import { loadSettings, saveSettings, type AppSettings } from './settings'
import { initLogger, log, logFilePath, recentLogs } from './logger'
import { createTray, destroyTray, updateTray, openInBrowser } from './tray'
import { installMenu } from './menu'
import { showNotification, setNotificationFocusHandler } from './notifications'
import { installPlugin, pluginTarballBundled } from './plugin-install'

// ---------------------------------------------------------------------------
// Single instance
// ---------------------------------------------------------------------------

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  void main()
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let mainWindow: BrowserWindow | null = null
let settingsWindow: BrowserWindow | null = null
let service: DshService | null = null
let bridge: BridgeClient | null = null
let quitting = false
let pluginVersion: string | null = null
let pluginInstalled: boolean | null = null
let lastPluginOutput = ''

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  // Portable-user-data switch (also the sandbox-friendly test seam).
  const portable = process.env.BLUE_WHALE_USER_DATA
  if (typeof portable === 'string' && portable.trim() !== '') {
    app.setPath('userData', portable.trim())
  }
  initLogger()
  app.on('second-instance', () => {
    showMainWindow()
  })

  app.on('before-quit', (event) => {
    if (quitting) return
    event.preventDefault()
    quitting = true
    void shutdown().then(() => {
      destroyTray()
      app.exit(0)
    })
  })

  app.on('window-all-closed', () => {
    // The tray keeps the app (and the harness) alive; quit explicitly from
    // the tray or the menu.
  })

  await app.whenReady()

  const settings = loadSettings()
  applyLoginItem(settings)

  setNotificationFocusHandler(() => {
    showMainWindow()
  })

  registerIpc()
  createMainWindow(settings)
  createTray(() => currentSnapshot(), {
    showMainWindow,
    openInBrowser: () => {
      const snapshot = currentSnapshot()
      openInBrowser(snapshot)
    },
    restartService: () => void restartHarness(),
    openLogs: () => void shell.openPath(logFilePath()),
    openSettings: () => openSettingsWindow(),
    quit: () => {
      quitting = true
      void shutdown().then(() => app.exit(0))
    },
  })
  installMenu(
    {
      reloadPage: () => reloadMainPage(),
      openSettings: () => openSettingsWindow(),
      restartService: () => void restartHarness(),
      openLogs: () => void shell.openPath(logFilePath()),
      openInBrowser: () => openInBrowser(currentSnapshot()),
      quit: () => {
        quitting = true
        void shutdown().then(() => app.exit(0))
      },
    },
    settings.devtools !== undefined ? settings.devtools : false,
  )

  await startHarness()
}

async function shutdown(): Promise<void> {
  log('app', 'shutdown requested')
  bridge?.disconnect()
  if (service !== null) {
    await Promise.race([service.stop(), new Promise((resolve) => setTimeout(resolve, 8000))])
  }
}

// ---------------------------------------------------------------------------
// Windows
// ---------------------------------------------------------------------------

function createMainWindow(settings: AppSettings): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 900,
    minHeight: 600,
    show: false,
    backgroundColor: '#0d1117',
    title: '蓝鲸鱼',
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  const loadingFile = rendererFile('#loading')
  void mainWindow.loadFile(loadingFile.file, { hash: loadingFile.hash })

  mainWindow.once('ready-to-show', () => {
    if (!settings.startMinimized) mainWindow?.show()
  })

  mainWindow.on('close', (event) => {
    if (!quitting && loadSettings().closeToTray) {
      event.preventDefault()
      mainWindow?.hide()
    }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  // Native download handling for session exports and file downloads.
  mainWindow.webContents.session.on('will-download', (_event, item) => {
    const filename = item.getFilename()
    item.setSavePath(join(app.getPath('downloads'), filename))
    log('app', `download started: ${filename}`)
  })
}

function rendererFile(hash: string): { file: string; hash: string } {
  return { file: join(__dirname, '..', 'dist', 'index.html'), hash }
}

function openSettingsWindow(): void {
  if (settingsWindow !== null) {
    settingsWindow.show()
    settingsWindow.focus()
    return
  }
  settingsWindow = new BrowserWindow({
    width: 780,
    height: 720,
    resizable: true,
    minimizable: false,
    title: '蓝鲸鱼 · 设置',
    backgroundColor: '#0d1117',
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  void settingsWindow.loadFile(rendererFile('#settings').file, { hash: '#settings' })
  settingsWindow.on('closed', () => {
    settingsWindow = null
  })
}

function showMainWindow(): void {
  if (mainWindow === null) {
    createMainWindow(loadSettings())
  }
  mainWindow?.show()
  mainWindow?.focus()
}

function reloadMainPage(): void {
  if (service?.url !== null && service?.url !== undefined) {
    void mainWindow?.loadURL(service.url)
  } else {
    mainWindow?.reload()
  }
}

function broadcastStatus(): void {
  const snapshot = currentSnapshot()
  updateTray(snapshot)
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send('status:changed', snapshot)
  }
}

// ---------------------------------------------------------------------------
// Harness lifecycle
// ---------------------------------------------------------------------------

function currentSnapshot(): ServiceSnapshot {
  return service !== null ? service.snapshot() : {
    state: 'stopped',
    url: null,
    pid: null,
    profile: loadSettings().profile,
    port: loadSettings().port,
    command: loadSettings().command,
  }
}

function serviceOptions(): DshServiceOptions {
  const settings = loadSettings()
  return {
    command: settings.command,
    profile: settings.profile,
    port: settings.port,
    workspace: settings.workspace,
    autoRestart: settings.autoRestart,
  }
}

async function startHarness(): Promise<void> {
  service = new DshService(serviceOptions())
  service.on('state', () => {
    broadcastStatus()
  })
  service.on('line', (line: string) => {
    for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.send('log:line', line)
    }
  })
  service.on('crashed', () => {
    log('app', 'harness crashed')
    showNotification({ title: '蓝鲸鱼', body: 'Harness 服务已退出，正在自动重启…' })
    showOfflineView()
  })

  bridge = new BridgeClient()
  bridge.on('connected', () => {
    log('bridge', 'shell connected to the blue-whale channel')
  })
  bridge.on('plugin', ({ version }) => {
    pluginVersion = typeof version === 'string' ? version : null
    pluginInstalled = true
    broadcastStatus()
  })
  bridge.on('event', (event) => {
    handleBridgeEvent(event)
  })

  try {
    const url = await service.start()
    log('app', `harness ready at ${url}`)
    bridge.connect(url)
    if (mainWindow !== null && existsSync(join(__dirname, '..', 'dist', 'index.html'))) {
      await mainWindow.loadURL(url)
    }
    broadcastStatus()
    if (loadSettings().autoInstallPlugin && pluginTarballBundled()) {
      void ensurePlugin()
    }
    void refreshPluginStatus(url)
  } catch (error) {
    log('app', `harness start failed: ${error instanceof Error ? error.message : String(error)}`)
    showOfflineView()
  }
}

async function restartHarness(): Promise<void> {
  if (service === null) {
    await startHarness()
    return
  }
  bridge?.disconnect()
  try {
    const url = await service.restart()
    log('app', `harness restarted at ${url}`)
    bridge?.connect(url)
    await mainWindow?.loadURL(url)
    broadcastStatus()
    void refreshPluginStatus(url)
  } catch (error) {
    log('app', `restart failed: ${error instanceof Error ? error.message : String(error)}`)
    showOfflineView()
  }
}

function showOfflineView(): void {
  if (mainWindow === null || mainWindow.isDestroyed()) return
  void mainWindow.loadFile(rendererFile('#offline').file, { hash: '#offline' })
}

function handleBridgeEvent(event: { kind: string; [key: string]: unknown }): void {
  switch (event.kind) {
    case 'session.completed': {
      const sessionId = typeof event.sessionId === 'string' ? event.sessionId : undefined
      showNotification({
        title: '会话完成',
        body: sessionId !== undefined ? `会话 ${sessionId}` : undefined,
      })
      break
    }
    case 'shell.connected':
    case 'shell.disconnected':
      // lifecycle noise — logged only
      log('bridge', `event: ${event.kind}`)
      break
    default:
      log('bridge', `event: ${event.kind} ${JSON.stringify(event)}`)
  }
}

async function refreshPluginStatus(url: string): Promise<void> {
  try {
    const response = await fetch(`${url}/blue-whale/api/status`, { signal: AbortSignal.timeout(4000) })
    if (response.ok) {
      const status = (await response.json()) as { ok?: boolean; version?: string }
      pluginInstalled = status.ok === true
      pluginVersion = status.version ?? pluginVersion
    } else {
      pluginInstalled = false
    }
  } catch {
    pluginInstalled = false
  }
  broadcastStatus()
}

async function ensurePlugin(): Promise<void> {
  const settings = loadSettings()
  try {
    const url = service?.url
    if (url === null || url === undefined) return
    const probe = await fetch(`${url}/blue-whale/api/status`, { signal: AbortSignal.timeout(4000) }).catch(() => null)
    if (probe !== null && probe.ok) return // already installed and mounted
  } catch {
    // probe failed; proceed with install anyway
  }
  log('app', 'auto-installing the dsh-blue-whale plugin')
  const result = await installPlugin(settings.profile, settings.command)
  lastPluginOutput = result.output
  if (!result.ok) {
    log('app', `plugin install failed: ${result.output.slice(-500)}`)
    showNotification({ title: '蓝鲸鱼', body: '桌面桥接插件安装失败，请在设置中重试' })
  } else {
    log('app', 'plugin installed; restarting the harness to mount it')
    showNotification({ title: '蓝鲸鱼', body: '桌面桥接插件已安装，正在重启服务…' })
    await restartHarness()
  }
}

// ---------------------------------------------------------------------------
// IPC
// ---------------------------------------------------------------------------

function registerIpc(): void {
  ipcMain.handle('settings:get', () => loadSettings())
  ipcMain.handle('settings:set', (_event, patch: Partial<AppSettings>) => {
    const next = saveSettings(patch)
    if (patch.openAtLogin !== undefined) applyLoginItem(next)
    return next
  })
  ipcMain.handle('service:status', () => currentSnapshot())
  ipcMain.handle('service:start', async () => {
    if (service !== null && service.state !== 'stopped') return currentSnapshot()
    await startHarness()
    return currentSnapshot()
  })
  ipcMain.handle('service:stop', async () => {
    bridge?.disconnect()
    await service?.stop()
    showOfflineView()
    return currentSnapshot()
  })
  ipcMain.handle('service:restart', async () => {
    await restartHarness()
    return currentSnapshot()
  })
  ipcMain.handle('logs:get', () => recentLogs())
  ipcMain.handle('logs:open', () => shell.openPath(logFilePath()))
  ipcMain.handle('plugin:install', async () => {
    const settings = loadSettings()
    lastPluginOutput = ''
    const result = await installPlugin(settings.profile, settings.command)
    lastPluginOutput = result.output
    return { ok: result.ok, output: result.output }
  })
  ipcMain.handle('plugin:status', async () => {
    const url = service?.url
    if (url !== null && url !== undefined) {
      await refreshPluginStatus(url)
    }
    return {
      installed: pluginInstalled,
      version: pluginVersion,
      bundled: pluginTarballBundled(),
      lastOutput: lastPluginOutput,
    }
  })
  ipcMain.handle('app:open-in-browser', () => {
    openInBrowser(currentSnapshot())
  })
  ipcMain.handle('app:open-external', (_event, url: string) => {
    if (typeof url === 'string' && /^https?:\/\//.test(url)) {
      void shell.openExternal(url)
    }
  })
  ipcMain.handle('app:quit', () => {
    quitting = true
    void shutdown().then(() => app.exit(0))
  })

  ipcMain.on('desktop:notify', (_event, payload: { title?: string; body?: string }) => {
    if (payload !== null && typeof payload === 'object' && typeof payload.title === 'string') {
      showNotification({ title: payload.title, body: payload.body })
    }
  })
  ipcMain.on('desktop:set-badge', (_event, count: number) => {
    try {
      app.setBadgeCount(typeof count === 'number' && count > 0 ? Math.floor(count) : 0)
    } catch {
      // unsupported platform
    }
  })
  ipcMain.on('desktop:flash-frame', () => {
    mainWindow?.flashFrame(true)
  })
  ipcMain.on('desktop:show-window', () => {
    showMainWindow()
  })
}

function applyLoginItem(settings: AppSettings): void {
  try {
    app.setLoginItemSettings({
      openAtLogin: settings.openAtLogin,
      openAsHidden: settings.startMinimized,
    })
  } catch (error) {
    log('app', `setLoginItemSettings failed: ${String(error)}`)
  }
}
