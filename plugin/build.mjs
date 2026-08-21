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
 * Two esbuild paths:
 *   - prefer the platform binary spawned directly (stdio inherit) so the
 *     build also works inside sandboxes that forbid piped child stdio;
 *   - when the binary file is absent, fall back to the esbuild JS API
 *     (in-process; used on CI runners where the platform package layout
 *     can differ).
 * On failure the error plus environment facts are also written to the GitHub
 * Actions step summary and emitted as ::error:: annotations when on CI.
 */
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { mkdir, writeFile } from 'node:fs/promises'
import { chmodSync, existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const root = dirname(fileURLToPath(import.meta.url))

const CLIENT_REGISTER_HEAD = 'window.__ModuleLoader__.load({ id: "dsh-blue-whale", factory: function (require) { var module = { exports: {} }; var exports = module.exports;'
const CLIENT_REGISTER_FOOT = 'return module.exports; } });'

const builds = [
  {
    entryPoints: ['src/index.ts'],
    outfile: 'lib/index.js',
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'es2022',
    external: ['ws'],
  },
  {
    entryPoints: ['src/client.ts'],
    outfile: 'lib/client.js',
    bundle: true,
    platform: 'browser',
    format: 'cjs',
    target: 'es2022',
    banner: { js: CLIENT_REGISTER_HEAD },
    footer: { js: CLIENT_REGISTER_FOOT },
  },
]

function platformPackage() {
  const platform = process.platform
  const arch = process.arch
  if (platform === 'win32') return '@esbuild/win32-x64'
  if (platform === 'darwin') return arch === 'arm64' ? '@esbuild/darwin-arm64' : '@esbuild/darwin-x64'
  return arch === 'arm64' ? '@esbuild/linux-arm64' : '@esbuild/linux-x64'
}

function resolveBinary() {
  const pkg = platformPackage()
  try {
    const binary = join(dirname(require.resolve(`${pkg}/package.json`)), process.platform === 'win32' ? 'esbuild.exe' : 'esbuild')
    if (!existsSync(binary)) return null
    if (process.platform !== 'win32') {
      try {
        chmodSync(binary, 0o755)
      } catch {
        // best effort
      }
    }
    return binary
  } catch {
    return null
  }
}

function cliArgsOf(build) {
  const args = ['--bundle', `--target=${build.target}`, '--log-level=info', `--platform=${build.platform}`, `--format=${build.format}`]
  if (build.external !== undefined) for (const spec of build.external) args.push(`--external:${spec}`)
  if (build.banner?.js !== undefined) args.push(`--banner:js=${build.banner.js}`)
  if (build.footer?.js !== undefined) args.push(`--footer:js=${build.footer.js}`)
  args.push(...build.entryPoints, `--outfile=${build.outfile}`)
  return args
}

async function buildWithBinary(binary) {
  for (const build of builds) {
    const result = spawnSync(binary, cliArgsOf(build), { stdio: 'inherit', cwd: root })
    if (result.status !== 0) {
      const detail = result.error !== undefined ? result.error.message : `exit code ${result.status ?? 'null'}`
      throw new Error(`esbuild binary failed (${binary}): ${detail}`)
    }
  }
}

async function buildWithJsApi() {
  const esbuild = await import('esbuild')
  for (const build of builds) {
    await esbuild.build({ ...build, entryPoints: build.entryPoints.map((p) => resolve(root, p)), outfile: resolve(root, build.outfile), logLevel: 'info' })
  }
}

async function main() {
  await mkdir(resolve(root, 'lib'), { recursive: true })
  const binary = resolveBinary()
  if (binary !== null) {
    console.log(`dsh-blue-whale: building via platform binary (${binary})`)
    await buildWithBinary(binary)
  } else {
    console.log('dsh-blue-whale: platform esbuild binary not found — falling back to the esbuild JS API')
    await buildWithJsApi()
  }
  console.log('dsh-blue-whale: lib/index.js + lib/client.js built')
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(error instanceof Error ? error.stack ?? error.message : String(error))
  // Workflow-command annotations surface in the check-run annotations API.
  console.log(`::error title=dsh-blue-whale plugin build::${message.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A')}`)
  const summary = process.env.GITHUB_STEP_SUMMARY
  if (typeof summary === 'string' && summary !== '') {
    const facts = [
      `### dsh-blue-whale plugin build failed`,
      `- platform: ${process.platform} / ${process.arch}`,
      `- node: ${process.version}`,
      `- cwd: ${process.cwd()}`,
      `- error: ${message}`,
    ]
    writeFile(summary, `${facts.join('\n')}\n`, { flag: 'a' }).catch(() => {})
  }
  process.exit(1)
})
