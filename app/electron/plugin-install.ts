/**
 * 蓝鲸鱼 plugin installer: installs (or refreshes) the bundled
 * dsh-blue-whale tarball into the target profile via the official
 * `dsh plugin --profile <name> add <tarball>` channel.
 */
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import { log } from './logger'

export interface PluginInstallResult {
  ok: boolean
  output: string
  profile: string
}

/** Absolute path of the bundled plugin tarball (extraResources). */
export function bundledPluginTarball(): string {
  return join(process.resourcesPath, 'plugin', 'dsh-blue-whale.tgz')
}

export function pluginTarballBundled(): boolean {
  return existsSync(bundledPluginTarball())
}

/** Run `dsh plugin --profile <profile> add <tarball>` and capture its output. */
export function installPlugin(profile: string, command = 'dsh'): Promise<PluginInstallResult> {
  const tarball = bundledPluginTarball()
  return new Promise<PluginInstallResult>((resolve) => {
    if (!pluginTarballBundled()) {
      resolve({ ok: false, output: 'bundled plugin tarball missing (dev build?)', profile })
      return
    }
    const args = ['plugin', '--profile', profile, 'add', tarball]
    log('plugin', `install: ${command} ${args.join(' ')}`)
    const child = spawn(command, args, {
      cwd: app.getPath('home'),
      shell: process.platform === 'win32',
      env: { ...process.env },
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let output = ''
    const collect = (chunk: Buffer): void => {
      output += chunk.toString('utf8')
    }
    child.stdout?.on('data', collect)
    child.stderr?.on('data', collect)
    const timer = setTimeout(() => {
      try {
        child.kill()
      } catch {
        // ignore
      }
      resolve({ ok: false, output: `${output}\n[timed out after 10 minutes]`, profile })
    }, 10 * 60 * 1000)
    child.on('error', (error) => {
      clearTimeout(timer)
      resolve({ ok: false, output: `${output}\n${error.message}`, profile })
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      const ok = code === 0
      log('plugin', `install ${ok ? 'ok' : `failed (${code ?? 'null'})`}`)
      resolve({ ok, output, profile })
    })
  })
}
