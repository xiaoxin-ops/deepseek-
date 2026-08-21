/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<Record<string, never>, Record<string, never>, unknown>
  export default component
}

interface DshDesktopBridge {
  present: true
  platform: string
  notify(payload: { title: string; body?: string }): void
  setBadge(count: number): void
  flashFrame(): void
  showWindow(): void
}

interface ServiceStatus {
  state: 'stopped' | 'starting' | 'running' | 'stopping'
  url: string | null
  pid: number | null
  profile: string
  port: number
  command: string
}

interface AppSettingsShape {
  profile: string
  port: number
  command: string
  workspace: string
  closeToTray: boolean
  startMinimized: boolean
  notificationsEnabled: boolean
  autoInstallPlugin: boolean
  autoRestart: boolean
  openAtLogin: boolean
  devtools: boolean
}

interface PluginStatusShape {
  installed: boolean | null
  version: string | null
  bundled: boolean
  lastOutput: string
}

interface BlueWhaleApi {
  getSettings(): Promise<AppSettingsShape>
  setSettings(patch: Partial<AppSettingsShape>): Promise<AppSettingsShape>
  getStatus(): Promise<ServiceStatus>
  startService(): Promise<ServiceStatus>
  stopService(): Promise<ServiceStatus>
  restartService(): Promise<ServiceStatus>
  getLogs(): Promise<string[]>
  openLogs(): Promise<unknown>
  installPlugin(): Promise<{ ok: boolean; output: string }>
  pluginStatus(): Promise<PluginStatusShape>
  openInBrowser(): Promise<unknown>
  openExternal(url: string): Promise<unknown>
  quit(): Promise<unknown>
  onStatus(listener: (status: ServiceStatus) => void): () => void
  onLogLine(listener: (line: string) => void): () => void
}

interface Window {
  dshDesktop?: DshDesktopBridge
  blueWhale?: BlueWhaleApi
}
