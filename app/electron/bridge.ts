/**
 * 蓝鲸鱼 bridge: the WebSocket client the shell opens toward the
 * dsh-blue-whale host half (/blue-whale/ws). Carries plugin facts and host
 * events (session completion, shell connects) into the shell.
 */
import { EventEmitter } from 'node:events'
import { log } from './logger'

export interface BridgeEvent {
  kind: string
  [key: string]: unknown
}

export class BridgeClient extends EventEmitter {
  private socket: WebSocket | null = null
  private url: string | null = null
  private closed = false
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null
  pluginVersion: string | null = null

  /** Connect to a running harness URL (http base). */
  connect(baseUrl: string): void {
    this.disconnect()
    this.closed = false
    this.url = wsUrlOf(baseUrl)
    this.open()
  }

  disconnect(): void {
    this.closed = true
    this.clearReconnect()
    this.clearHeartbeat()
    if (this.socket !== null) {
      try {
        this.socket.close()
      } catch {
        // ignore
      }
      this.socket = null
    }
    this.pluginVersion = null
  }

  get connected(): boolean {
    return this.socket !== null && this.socket.readyState === WebSocket.OPEN
  }

  private open(): void {
    if (this.url === null || this.closed) return
    log('bridge', `connecting ${this.url}`)
    let socket: WebSocket
    try {
      socket = new WebSocket(this.url)
    } catch (error) {
      log('bridge', `WebSocket constructor failed: ${String(error)}`)
      this.scheduleReconnect()
      return
    }
    this.socket = socket
    socket.addEventListener('open', () => {
      log('bridge', 'connected')
      this.emit('connected')
      this.send({ type: 'hello', client: 'blue-whale-shell', version: '0.1.0' })
      this.clearHeartbeat()
      this.heartbeatTimer = setInterval(() => {
        this.send({ type: 'ping' })
      }, 15000)
    })
    socket.addEventListener('message', (event) => {
      let message: { type?: string; event?: BridgeEvent; plugin?: string; version?: string }
      try {
        message = JSON.parse(String(event.data)) as typeof message
      } catch {
        return
      }
      if (message.type === 'welcome') {
        this.pluginVersion = message.version ?? null
        log('bridge', `plugin welcome: ${message.plugin}@${message.version ?? '?'}`)
        this.emit('plugin', { plugin: message.plugin, version: message.version })
      } else if (message.type === 'event' && message.event !== undefined) {
        this.emit('event', message.event)
      }
    })
    socket.addEventListener('close', () => {
      if (this.socket === socket) this.socket = null
      this.clearHeartbeat()
      this.emit('disconnected')
      log('bridge', 'disconnected')
      this.scheduleReconnect()
    })
    socket.addEventListener('error', () => {
      // close event follows
    })
  }

  private send(message: unknown): void {
    if (this.socket !== null && this.socket.readyState === WebSocket.OPEN) {
      try {
        this.socket.send(JSON.stringify(message))
      } catch {
        // ignore
      }
    }
  }

  private scheduleReconnect(): void {
    if (this.closed || this.reconnectTimer !== null) return
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.open()
    }, 5000)
  }

  private clearReconnect(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
  }

  private clearHeartbeat(): void {
    if (this.heartbeatTimer !== null) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
  }
}

function wsUrlOf(baseUrl: string): string {
  return `${baseUrl.replace(/^http/, 'ws')}/blue-whale/ws`
}
