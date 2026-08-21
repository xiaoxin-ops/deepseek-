/**
 * 蓝鲸鱼 settings: persisted user configuration for the desktop shell.
 */
import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { homedir } from 'node:os'

export interface AppSettings {
  /** DSH profile to boot (`web` boots via the `dsh web` alias). */
  profile: string
  /** Listen port for the local harness; 0 lets the OS pick a free one. */
  port: number
  /** The dsh command (name on PATH or absolute path). */
  command: string
  /** Working directory handed to the dsh process (default workspace root). */
  workspace: string
  /** Hide to the tray instead of quitting when the window is closed. */
  closeToTray: boolean
  /** Start with the window hidden (tray only). */
  startMinimized: boolean
  /** Native desktop notifications (session completion, service events). */
  notificationsEnabled: boolean
  /** Auto-install the bundled dsh-blue-whale plugin into the profile. */
  autoInstallPlugin: boolean
  /** Restart the harness automatically when it exits unexpectedly. */
  autoRestart: boolean
  /** Launch 蓝鲸鱼 on login. */
  openAtLogin: boolean
  /** Show developer-tools entries in the menu. */
  devtools: boolean
}

export const DEFAULT_SETTINGS: AppSettings = {
  profile: 'web',
  port: 3080,
  command: 'dsh',
  workspace: homedir(),
  closeToTray: true,
  startMinimized: false,
  notificationsEnabled: true,
  autoInstallPlugin: true,
  autoRestart: true,
  openAtLogin: false,
  devtools: false,
}

let cached: AppSettings | null = null

export function settingsFile(): string {
  return join(app.getPath('userData'), 'settings.json')
}

export function loadSettings(): AppSettings {
  if (cached !== null) return cached
  const file = settingsFile()
  let loaded: Partial<AppSettings> = {}
  try {
    if (existsSync(file)) {
      // strip a UTF-8 BOM if present (Windows editors/tools add them)
      const raw = readFileSync(file, 'utf8').replace(/^\uFEFF/, '')
      loaded = JSON.parse(raw) as Partial<AppSettings>
    }
  } catch {
    // corrupted settings fall back to defaults
  }
  cached = sanitize({ ...DEFAULT_SETTINGS, ...loaded })
  return cached
}

export function saveSettings(patch: Partial<AppSettings>): AppSettings {
  const next = sanitize({ ...loadSettings(), ...patch })
  cached = next
  const file = settingsFile()
  try {
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, JSON.stringify(next, null, 2), 'utf8')
  } catch (error) {
    console.error('[blue-whale] failed to save settings:', error)
  }
  return next
}

function sanitize(settings: AppSettings): AppSettings {
  const port = Number(settings.port)
  return {
    ...settings,
    profile: typeof settings.profile === 'string' && settings.profile.trim() !== '' ? settings.profile.trim() : DEFAULT_SETTINGS.profile,
    port: Number.isFinite(port) && port >= 0 && port <= 65535 ? Math.floor(port) : DEFAULT_SETTINGS.port,
    command: typeof settings.command === 'string' && settings.command.trim() !== '' ? settings.command.trim() : DEFAULT_SETTINGS.command,
    workspace: typeof settings.workspace === 'string' && settings.workspace.trim() !== '' ? settings.workspace.trim() : DEFAULT_SETTINGS.workspace,
    closeToTray: settings.closeToTray !== false,
    startMinimized: settings.startMinimized === true,
    notificationsEnabled: settings.notificationsEnabled !== false,
    autoInstallPlugin: settings.autoInstallPlugin !== false,
    autoRestart: settings.autoRestart !== false,
    openAtLogin: settings.openAtLogin === true,
    devtools: settings.devtools === true,
  }
}
