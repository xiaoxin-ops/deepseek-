/**
 * 蓝鲸鱼 preload — loaded into BOTH windows:
 * - the main window hosting the official Web UI (remote http origin)
 * - the local settings/about renderer
 *
 * Exposes two bridge surfaces:
 * - `window.dshDesktop`  — the dsh-blue-whale client half consumes this
 * - `window.blueWhale`   — the settings renderer consumes this
 */
import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('dshDesktop', {
  present: true,
  platform: process.platform,
  notify: (payload: { title: string; body?: string }) => {
    ipcRenderer.send('desktop:notify', payload)
  },
  setBadge: (count: number) => {
    ipcRenderer.send('desktop:set-badge', count)
  },
  flashFrame: () => {
    ipcRenderer.send('desktop:flash-frame')
  },
  showWindow: () => {
    ipcRenderer.send('desktop:show-window')
  },
})

contextBridge.exposeInMainWorld('blueWhale', {
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (patch: unknown) => ipcRenderer.invoke('settings:set', patch),
  getStatus: () => ipcRenderer.invoke('service:status'),
  startService: () => ipcRenderer.invoke('service:start'),
  stopService: () => ipcRenderer.invoke('service:stop'),
  restartService: () => ipcRenderer.invoke('service:restart'),
  getLogs: () => ipcRenderer.invoke('logs:get'),
  openLogs: () => ipcRenderer.invoke('logs:open'),
  installPlugin: () => ipcRenderer.invoke('plugin:install'),
  pluginStatus: () => ipcRenderer.invoke('plugin:status'),
  openInBrowser: () => ipcRenderer.invoke('app:open-in-browser'),
  openExternal: (url: string) => ipcRenderer.invoke('app:open-external', url),
  quit: () => ipcRenderer.invoke('app:quit'),
  onStatus: (listener: (status: unknown) => void) => {
    const handler = (_event: unknown, status: unknown): void => listener(status)
    ipcRenderer.on('status:changed', handler)
    return () => {
      ipcRenderer.removeListener('status:changed', handler)
    }
  },
  onLogLine: (listener: (line: string) => void) => {
    const handler = (_event: unknown, line: string): void => listener(line)
    ipcRenderer.on('log:line', handler)
    return () => {
      ipcRenderer.removeListener('log:line', handler)
    }
  },
})
