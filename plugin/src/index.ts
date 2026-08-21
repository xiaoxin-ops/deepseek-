/**
 * Host half of dsh-blue-whale: the desktop channel inside the `dsh web`
 * process. Registers
 *   - /blue-whale/api/status      (HTTP: health + plugin facts)
 *   - /blue-whale/ws              (WebSocket: shell <-> host events)
 * behind the same browser-trust fence the official host plugins use, and
 * forwards session-completion events observed on the host sessions store
 * (best effort: the store may be absent in exotic profiles, and the client
 * half already notifies through the direct preload bridge anyway).
 */
import { WebSocketServer, WebSocket, type RawData } from 'ws'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { BlueWhaleStatus, HostToShellMessage, ShellToHostMessage } from './shared.ts'

export const name = 'dsh-blue-whale'

/** Services required before mounting (both provided by the official web surface). */
export const inject = ['webServer', 'webRuntime']

/** Plugin-level switches (env-based; the loader row carries no config). */
const ENABLED = process.env.DSH_BLUE_WHALE_ENABLED !== '0'

const PLUGIN_VERSION = readVersion()

function readVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8')) as {
      version?: string
    }
    return typeof pkg.version === 'string' ? pkg.version : '0.0.0'
  } catch {
    return '0.0.0'
  }
}

// ---------------------------------------------------------------------------
// Browser-trust fence (mirror of the official host plugins' shape)
// ---------------------------------------------------------------------------

interface HeadersLike {
  [key: string]: string | string[] | undefined
}

function header(headers: HeadersLike, name: string): string | undefined {
  const value = headers[name]
  return typeof value === 'string' ? value : undefined
}

function parseAuthority(authority: string): URL | undefined {
  try {
    return new URL(`http://${authority}`)
  } catch {
    return undefined
  }
}

function isLoopbackHostname(hostname: string): boolean {
  if (hostname === 'localhost' || hostname === '[::1]') return true
  const parts = hostname.split('.')
  return parts.length === 4 && parts[0] === '127' && parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255)
}

function canonicalAuthority(entry: string, entryUrl: URL): string {
  const port = entryUrl.port !== '' ? entryUrl.port : new URL(`https://${entry}`).port
  return port === '' ? entryUrl.hostname : `${entryUrl.hostname}:${port}`
}

function isTrustedAuthority(hostUrl: URL, trustedHosts: readonly string[]): boolean {
  return trustedHosts.some((entry) => {
    const entryUrl = parseAuthority(entry)
    if (entryUrl === undefined) return false
    return canonicalAuthority(entry, entryUrl) === entryUrl.hostname
      ? entryUrl.hostname === hostUrl.hostname
      : entryUrl.host === hostUrl.host
  })
}

/**
 * Decide whether a request may reach the plugin routes: the Host header must
 * be ours (loopback or trusted), browser markers must be same-origin. The
 * desktop shell connects from Node (no Origin, no fetch-site headers) and
 * passes, exactly like the official plugins' terminal/agent-list sockets.
 */
function isTrustedRequest(req: { headers: HeadersLike }, trustedHosts: readonly string[]): boolean {
  const host = header(req.headers, 'host')
  if (host === undefined) return false
  const hostUrl = parseAuthority(host)
  if (hostUrl === undefined) return false
  if (!isLoopbackHostname(hostUrl.hostname) && !isTrustedAuthority(hostUrl, trustedHosts)) return false
  if (header(req.headers, 'sec-fetch-site') === 'cross-site') return false
  const origin = header(req.headers, 'origin')
  if (origin === undefined) return true
  try {
    return new URL(origin).host === hostUrl.host
  } catch {
    return false
  }
}

// ---------------------------------------------------------------------------
// Minimal structural typings for the injected services (kept local so the
// build never depends on resolving dsh package types).
// ---------------------------------------------------------------------------

interface WebServerLike {
  register(entry: { kind: 'prefix'; path: string; handler: (req: unknown, res: unknown) => void | Promise<void> }): () => void
  registerUpgrade(entry: { path: string; handler: (req: unknown, socket: unknown, head: unknown) => void }): () => void
}

interface HttpResLike {
  writeHead(status: number, headers?: Record<string, string>): void
  end(body?: string): void
}

interface SessionLike {
  id: string
  header?: { title?: string }
}

interface SessionStoreLike {
  on?(event: string, listener: (...args: unknown[]) => void): () => void
  off?(event: string, listener: (...args: unknown[]) => void): void
}

interface CtxLike {
  webServer: WebServerLike
  webRuntime: { trustedHosts: readonly string[] }
  get?(service: string): unknown
  effect(fn: () => (() => void) | void, label?: string): void
  dispose?(fn: () => void): void
}

// ---------------------------------------------------------------------------
// apply
// ---------------------------------------------------------------------------

export function apply(ctx: CtxLike): void {
  if (!ENABLED) return

  const wss = new WebSocketServer({ noServer: true })
  const clients = new Set<WebSocket>()
  const profile = profileName()

  const sendAll = (message: HostToShellMessage): void => {
    const raw = JSON.stringify(message)
    for (const ws of clients) {
      if (ws.readyState === WebSocket.OPEN) ws.send(raw)
    }
  }

  const broadcastEvent = (event: { kind: string; [key: string]: unknown }): void => {
    sendAll({ type: 'event', event })
  }

  // Best-effort session-completion forwarding from the host sessions store.
  let offSessions: (() => void) | undefined
  try {
    const sessions = ctx.get?.('sessions') as SessionStoreLike | undefined
    if (sessions !== undefined && typeof sessions.on === 'function') {
      const listener = (_session: SessionLike, event: { type?: string }): void => {
        if (event?.type === 'session/end-turn' || event?.type === 'turn/end') {
          broadcastEvent({ kind: 'session.completed', sessionId: _session?.id })
        }
      }
      sessions.on('session/event', listener as (...args: unknown[]) => void)
      offSessions = () => {
        sessions.off?.('session/event', listener as (...args: unknown[]) => void)
      }
    }
  } catch {
    // sessions store absent — client half still notifies via the preload bridge.
  }

  const cleanup = ctx.effect(() => {
    const disposers: (() => void)[] = []

    disposers.push(ctx.webServer.register({
      kind: 'prefix',
      path: '/blue-whale/api',
      handler: (req, res) => {
        const out = res as unknown as HttpResLike
        if (!isTrustedRequest(req as { headers: HeadersLike }, ctx.webRuntime.trustedHosts)) {
          out.writeHead(403)
          out.end('forbidden')
          return
        }
        const pathname = new URL((req as { url?: string }).url ?? '/', 'http://dsh.internal').pathname
        if (pathname === '/blue-whale/api/status' || pathname === '/blue-whale/api') {
          const status: BlueWhaleStatus = {
            ok: true,
            plugin: name,
            version: PLUGIN_VERSION,
            profile,
            shellConnected: clients.size > 0,
          }
          out.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
          out.end(JSON.stringify(status))
          return
        }
        out.writeHead(404, { 'content-type': 'application/json; charset=utf-8' })
        out.end(JSON.stringify({ ok: false, error: { code: 'not-found', message: 'unknown blue-whale API method' } }))
      },
    }))

    disposers.push(ctx.webServer.registerUpgrade({
      path: '/blue-whale/ws',
      handler: (req, socket, head) => {
        if (!isTrustedRequest(req as { headers: HeadersLike }, ctx.webRuntime.trustedHosts)) {
          ;(socket as { destroy(): void }).destroy()
          return
        }
        wss.handleUpgrade(req as never, socket as never, head as never, (ws: WebSocket) => {
          clients.add(ws)
          sendAll({
            type: 'welcome',
            plugin: name,
            version: PLUGIN_VERSION,
            profile,
          })
          ws.on('message', (data: RawData) => {
            let message: ShellToHostMessage | undefined
            try {
              message = JSON.parse(String(data)) as ShellToHostMessage
            } catch {
              return
            }
            if (message?.type === 'ping') {
              if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'pong' } satisfies HostToShellMessage))
            }
            if (message?.type === 'hello') {
              broadcastEvent({ kind: 'shell.connected', client: message.client, version: message.version })
            }
          })
          ws.on('close', () => {
            clients.delete(ws)
            broadcastEvent({ kind: 'shell.disconnected' })
          })
          ws.on('error', () => {
            clients.delete(ws)
          })
        })
      },
    }))

    return () => {
      for (const dispose of disposers) {
        try {
          dispose()
        } catch {
          // already disposed
        }
      }
      wss.close()
      for (const ws of clients) ws.terminate()
      clients.clear()
      offSessions?.()
    }
  }, 'dsh-blue-whale: desktop channel')

  // The effect may be async-disposed in exotic loaders; keep the handle for teardown symmetry.
  void cleanup
}

/** Best-effort profile-name probe for the status payload. */
function profileName(): string {
  try {
    const url = fileURLToPath(import.meta.url)
    const match = /[\\/]profiles[\\/]([^\\/]+)[\\/]/.exec(url)
    return match?.[1] ?? 'unknown'
  } catch {
    return 'unknown'
  }
}
