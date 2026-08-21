/**
 * dsh-blue-whale wire vocabulary, shared by both halves and mirrored by the
 * desktop shell (Electron main). JSON-serializable only.
 * @module dsh-blue-whale/shared
 */

/** One event the plugin pushes toward the desktop shell (host WS channel). */
export interface BlueWhaleEvent {
  kind: string
  [key: string]: unknown
}

/** Messages the shell may send over the host WS channel. */
export type ShellToHostMessage =
  | { type: 'hello'; client: string; version: string }
  | { type: 'ping' }

/** Messages the host WS channel sends to the shell. */
export type HostToShellMessage =
  | { type: 'welcome'; plugin: string; version: string; profile: string }
  | { type: 'pong' }
  | { type: 'event'; event: BlueWhaleEvent }

/**
 * The bridge object the Electron preload exposes as `window.dshDesktop`.
 * The client half treats its absence as plain-browser mode and stays inert.
 */
export interface DshDesktopBridge {
  readonly present: true
  readonly platform: string
  /** Show a native desktop notification (no-op when disabled in the shell). */
  notify(payload: { title: string; body?: string }): void
  /** Set the dock/taskbar badge count (0 clears). */
  setBadge(count: number): void
  /** Flash the window frame to draw the user's attention. */
  flashFrame(): void
  /** Focus the main window. */
  showWindow(): void
}

/** HTTP status payload served by the host half at /blue-whale/api/status. */
export interface BlueWhaleStatus {
  ok: true
  plugin: string
  version: string
  profile: string
  shellConnected: boolean
}
