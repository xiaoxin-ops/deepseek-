/**
 * Pack the dsh-blue-whale plugin tarball into <repo>/dist (creating the
 * directory first). Used by both local builds and CI — npm pack's
 * --pack-destination fails when the target directory does not exist.
 */
import { spawnSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const dist = resolve(root, 'dist')
mkdirSync(dist, { recursive: true })

const result = spawnSync(
  'npm',
  ['pack', '--workspaces=false', '--pack-destination', dist],
  { cwd: resolve(root, 'plugin'), stdio: 'inherit', shell: process.platform === 'win32' },
)
process.exit(result.status ?? 1)
