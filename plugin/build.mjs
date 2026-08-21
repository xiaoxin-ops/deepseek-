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
 * also works inside sandboxes that forbid piped child stdio (EPERM). On
 * failure the error plus environment facts are also written to the GitHub
 * Actions step summary when running on CI.
 */
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { mkdir, writeFile } from 'node:fs/promises'
import { chmodSync, existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const root = dirname(fileURLToPath(import.meta.url))

async function main() {
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
  let binary
  try {
    binary = join(dirname(require.resolve(`${pkg}/package.json`)), platform === 'win32' ? 'esbuild.exe' : 'esbuild')
  } catch (error) {
    throw new Error(`cannot resolve esbuild binary for ${platform}/${arch} (package ${pkg}): ${error instanceof Error ? error.message : String(error)}`)
  }
  if (!existsSync(binary)) {
    throw new Error(`esbuild binary missing at ${binary} (platform package ${pkg} present but binary absent)`)
  }
  // Restore the exec bit on POSIX (a store/extraction hiccup must not break the build).
  if (platform !== 'win32') {
    try {
      chmodSync(binary, 0o755)
    } catch {
      // best effort
    }
  }

  const baseArgs = [
    '--bundle',
    '--target=es2022',
    '--log-level=info',
  ]

  const run = (args) => {
    const result = spawnSync(binary, args, { stdio: 'inherit', cwd: root })
    if (result.status !== 0) {
      const detail = result.error !== undefined ? result.error.message : `exit code ${result.status ?? 'null'}`
      throw new Error(`esbuild failed (binary ${binary}): ${detail}`)
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
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error))
  const summary = process.env.GITHUB_STEP_SUMMARY
  if (typeof summary === 'string' && summary !== '') {
    const facts = [
      `### dsh-blue-whale plugin build failed`,
      `- platform: ${process.platform} / ${process.arch}`,
      `- node: ${process.version}`,
      `- cwd: ${process.cwd()}`,
      `- error: ${error instanceof Error ? error.message : String(error)}`,
    ]
    writeFile(summary, `${facts.join('\n')}\n`, { flag: 'a' }).catch(() => {})
  }
  process.exit(1)
})
