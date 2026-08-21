/**
 * DshService: owns the local `dsh web` child process.
 *
 * - spawns `dsh web --no-open --port <port>` (or `--profile <name>` variant)
 * - discovers the canonical URL from the web-runtime URL line on stdout
 * - polls the harness until it serves, then reports ready
 * - auto-restarts on unexpected exit with capped backoff
 * - kills the whole process tree on stop (Windows: taskkill /T)
 */
import { EventEmitter } from 'node:events'
import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { createInterface } from 'node:readline'
import { existsSync } from 'node:fs'
import { log } from './logger'

export type ServiceState = 'stopped' | 'starting' | 'running' | 'stopping'

export interface DshServiceOptions {
  command: string
  profile: string
  port: number
  workspace: string
  autoRestart: boolean
  /** Seconds to wait for the harness to serve before failing the start. */
  readyTimeoutMs?: number
}

export interface ServiceSnapshot {
  state: ServiceState
  url: string | null
  pid: number | null
  profile: string
  port: number
  command: string
}

const URL_LINE = /dsh web:\s+(https?:\/\/[^\s]+)/i
const RESTART_DELAYS_MS = [1000, 2000, 5000, 10000]

export class DshService extends EventEmitter {
  private options: DshServiceOptions
  private child: ChildProcess | null = null
  private stateValue: ServiceState = 'stopped'
  private urlValue: string | null = null
  private stopRequested = false
  private restartTimer: ReturnType<typeof setTimeout> | null = null
  private restartAttempts = 0
  private healthTimer: ReturnType<typeof setInterval> | null = null

  constructor(options: DshServiceOptions) {
    super()
    this.options = options
  }

  get state(): ServiceState {
    return this.stateValue
  }

  get url(): string | null {
    return this.urlValue
  }

  snapshot(): ServiceSnapshot {
    return {
      state: this.stateValue,
      url: this.urlValue,
      pid: this.child?.pid ?? null,
      profile: this.options.profile,
      port: this.options.port,
      command: this.options.command,
    }
  }

  updateOptions(patch: Partial<DshServiceOptions>): void {
    this.options = { ...this.options, ...patch }
  }

  /** Start (or restart) the harness. Resolves with the canonical URL once ready. */
  start(): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      if (this.child !== null) {
        reject(new Error('service already running'))
        return
      }
      this.stopRequested = false
      this.restartAttempts = 0
      this.spawnOnce(resolve, reject)
    })
  }

  /** Stop the harness (and cancel pending auto-restarts). */
  async stop(): Promise<void> {
    this.stopRequested = true
    this.clearRestartTimer()
    if (this.child === null) {
      this.setState('stopped')
      return
    }
    this.setState('stopping')
    const child = this.child
    const finished = new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, 5000)
      child.once('exit', () => {
        clearTimeout(timer)
        resolve()
      })
    })
    this.killTree(child)
    await finished
    if (this.child === child) {
      this.child = null
      this.urlValue = null
      this.setState('stopped')
    }
  }

  /** Restart from a running or stopped state. */
  async restart(): Promise<string> {
    await this.stop()
    return this.start()
  }

  private spawnOnce(resolve: (url: string) => void, reject: (error: Error) => void): void {
    const { command, profile, port, workspace } = this.options
    const isWin = process.platform === 'win32'
    const args = profile === 'web'
      ? ['web', '--no-open', '--port', String(port)]
      : ['--profile', profile, '--no-open', '--port', String(port)]

    this.setState('starting')
    log('dsh', `spawn: ${command} ${args.join(' ')} (cwd: ${workspace})`)

    if (!existsSync(workspace)) {
      log('dsh', `workspace does not exist: ${workspace}; falling back to home`)
    }

    let child: ChildProcess
    let pipeMode = true
    try {
      child = spawn(command, args, {
        cwd: existsSync(workspace) ? workspace : undefined,
        shell: isWin,
        env: { ...process.env },
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      })
    } catch (error) {
      // Sandboxed environments can forbid piped stdio between node processes
      // (EPERM on named pipes). Fall back to inherited stdio: the URL line is
      // then unreachable, so require a fixed port and derive the URL directly.
      log('dsh', `piped spawn failed (${error instanceof Error ? error.message : String(error)}); falling back to inherit stdio`)
      pipeMode = false
      child = spawn(command, args, {
        cwd: existsSync(workspace) ? workspace : undefined,
        shell: isWin,
        env: { ...process.env },
        windowsHide: true,
        stdio: 'inherit',
      })
    }
    this.child = child

    let settled = false
    let readyTimer: ReturnType<typeof setTimeout> | null = null

    const fail = (error: Error): void => {
      if (settled) return
      settled = true
      if (readyTimer !== null) clearTimeout(readyTimer)
      if (this.child === child) {
        this.child = null
      }
      this.urlValue = null
      reject(error)
      this.setState('stopped')
      this.scheduleRestart()
    }

    const succeed = (url: string): void => {
      if (settled) return
      settled = true
      if (readyTimer !== null) clearTimeout(readyTimer)
      this.urlValue = url
      this.restartAttempts = 0
      this.setState('running')
      resolve(url)
    }

    if (pipeMode && child.stdout !== null) {
      const lines = createInterface({ input: child.stdout })
      lines.on('line', (line) => {
        log('dsh', line)
        this.emit('line', line)
        const match = URL_LINE.exec(line)
        if (match !== null && this.urlValue === null) {
          log('dsh', `detected url: ${match[1]}`)
          void this.waitUntilServing(match[1], this.options.readyTimeoutMs ?? 60000)
            .then(() => succeed(match[1]))
            .catch((error: Error) => {
              log('dsh', `harness never became ready: ${error.message}`)
              fail(error)
            })
        }
      })
    }
    if (pipeMode && child.stderr !== null) {
      const errLines = createInterface({ input: child.stderr })
      errLines.on('line', (line) => {
        log('dsh', `stderr: ${line}`)
        this.emit('line', `stderr: ${line}`)
      })
    }

    if (!pipeMode) {
      // No stdout access: derive the URL from the fixed port.
      if (port <= 0) {
        fail(new Error('port 0 (auto) needs piped stdout to discover the URL; set a fixed port'))
        return
      }
      const url = `http://127.0.0.1:${port}`
      void this.waitUntilServing(url, this.options.readyTimeoutMs ?? 60000)
        .then(() => succeed(url))
        .catch((error: Error) => fail(error))
    }

    child.on('error', (error) => {
      log('dsh', `spawn error: ${error.message}`)
      fail(error)
    })

    child.on('exit', (code, signal) => {
      log('dsh', `exited code=${code ?? 'null'} signal=${signal ?? 'null'} stopRequested=${this.stopRequested}`)
      const wasUnexpected = !this.stopRequested && !settled
      if (this.child === child) {
        this.child = null
      }
      if (!settled) {
        settled = true
        if (readyTimer !== null) clearTimeout(readyTimer)
        this.urlValue = null
        this.setState('stopped')
        reject(new Error(`dsh exited before ready (code ${code ?? 'null'})`))
      } else if (!this.stopRequested) {
        // crashed while running
        this.urlValue = null
        this.setState('stopped')
        this.emit('crashed', { code, signal })
      }
      if (wasUnexpected) this.scheduleRestart()
    })
  }

  private async waitUntilServing(url: string, timeoutMs: number): Promise<void> {
    const deadline = Date.now() + timeoutMs
    for (;;) {
      try {
        const response = await fetch(url, { signal: AbortSignal.timeout(3000) })
        if (response.ok || response.status < 500) return
      } catch {
        // not up yet
      }
      if (Date.now() > deadline) throw new Error('timeout waiting for the harness to serve')
      await new Promise((resolve) => setTimeout(resolve, 500))
    }
  }

  /** Lazy health probe while running: a vanished port marks a crash that missed the exit event. */
  private scheduleRestart(): void {
    if (this.stopRequested || !this.options.autoRestart || this.restartTimer !== null) return
    const delay = RESTART_DELAYS_MS[Math.min(this.restartAttempts, RESTART_DELAYS_MS.length - 1)] ?? 10000
    this.restartAttempts += 1
    log('dsh', `auto-restart in ${delay}ms (attempt ${this.restartAttempts})`)
    this.restartTimer = setTimeout(() => {
      this.restartTimer = null
      void this.start().catch((error) => {
        log('dsh', `restart failed: ${error.message}`)
      })
    }, delay)
  }

  private clearRestartTimer(): void {
    if (this.restartTimer !== null) {
      clearTimeout(this.restartTimer)
      this.restartTimer = null
    }
  }

  private killTree(child: ChildProcess): void {
    if (child.pid === undefined) return
    try {
      if (process.platform === 'win32') {
        spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true })
      } else {
        child.kill('SIGTERM')
        setTimeout(() => {
          if (child.exitCode === null) child.kill('SIGKILL')
        }, 3000)
      }
    } catch {
      try {
        child.kill()
      } catch {
        // already gone
      }
    }
  }

  private setState(state: ServiceState): void {
    if (this.stateValue === state) return
    this.stateValue = state
    this.emit('state', state)
  }
}
