/**
 * dsh-blue-whale build: esbuild the host half (Node ESM) and the client half
 * into lib/. Mirrors the official plugins' layout:
 *   lib/index.js    — node half, served as the loader entry
 *   lib/client.js   — browser half, served by /plugins/<id>/client.js
 *
 * The client half follows the official client-modules contract: the whole
 * bundle body lives inside a `window.__ModuleLoader__.load({ id, factory })`
 * registration (CJS factory form, exactly like the official plugins), so the
 * module system can materialize it lazily.
 *
 * Invokes the platform esbuild binary directly (stdio inherit) so the build
 * also works inside sandboxes that forbid piped child stdio (EPERM).
 */
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { mkdir } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const root = dirname(fileURLToPath(import.meta.url))

await mkdir(resolve(root, 'lib'), { recursive: true })

const platform = process.platform
const arch = process.arch
const pkg = platform === 'win32'
  ? '@esbuild/win32-x64'
  : platform === 'darwin'
    ? (arch === 'arm64' ? '@esbuild/darwin-arm64' : '@esbuild/darwin-x64')
    : (arch === 'arm64' ? '@esbuild/linux-arm64' : '@esbuild/linux-x64')
// Resolve through the package's own package.json so any exports-map shape
// (or its absence) never blocks the binary subpath, then join by hand.
const binary = join(dirname(require.resolve(`${pkg}/package.json`)), platform === 'win32' ? 'esbuild.exe' : 'esbuild')

const baseArgs = [
  '--bundle',
  '--target=es2022',
  '--log-level=info',
]

function run(args) {
  const result = spawnSync(binary, args, { stdio: 'inherit', cwd: root })
  if (result.status !== 0) {
    throw new Error(`esbuild failed with exit code ${result.status ?? 'null'}`)
  }
}

run([
  ...baseArgs,
  '--platform=node',
  '--format=esm',
  '--external:ws',
  'src/index.ts',
  '--outfile=lib/index.js',
])

run([
  ...baseArgs,
  '--platform=browser',
  '--format=cjs',
  '--banner:js=window.__ModuleLoader__.load({ id: "dsh-blue-whale", factory: function (require) { var module = { exports: {} }; var exports = module.exports;',
  '--footer:js=return module.exports; } });',
  'src/client.ts',
  '--outfile=lib/client.js',
])

console.log('dsh-blue-whale: lib/index.js + lib/client.js built')
