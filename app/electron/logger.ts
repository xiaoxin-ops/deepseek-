/**
 * 蓝鲸鱼 logger: a rolling in-memory buffer plus a plain-text log file.
 */
import { app } from 'electron'
import { appendFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'

const RING_LIMIT = 500
const ring: string[] = []
let logPath = ''

export function initLogger(): void {
  logPath = join(app.getPath('userData'), 'logs', 'main.log')
  try {
    mkdirSync(dirname(logPath), { recursive: true })
  } catch {
    // logging must never crash the shell
  }
  write('blue-whale', `session start (electron ${process.versions.electron}, node ${process.versions.node}, ${process.platform})`)
}

export function log(tag: string, message: string): void {
  const line = `${new Date().toISOString()} [${tag}] ${message}`
  ring.push(line)
  if (ring.length > RING_LIMIT) ring.shift()
  write(tag, message)
}

function write(tag: string, message: string): void {
  const line = `${new Date().toISOString()} [${tag}] ${message}\n`
  try {
    if (logPath !== '' && existsSync(dirname(logPath))) appendFileSync(logPath, line, 'utf8')
  } catch {
    // ignore
  }
}

export function recentLogs(): string[] {
  return [...ring]
}

export function logFilePath(): string {
  return logPath
}
