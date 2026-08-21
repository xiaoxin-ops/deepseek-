/**
 * 蓝鲸鱼 renderer build (no vite): the settings/loading renderer is one Vue
 * SFC plus one static stylesheet, so a micro-pipeline suffices:
 *
 *   1. compile App.vue with @vue/compiler-sfc (in-process, inline template)
 *      into src/App.generated.js — a self-contained ES module.
 *   2. bundle main.js with the platform esbuild binary (direct spawn,
 *      stdio inherit — works inside piped-stdio sandboxes too).
 *   3. emit index.html + style.css into app/dist.
 */
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { mkdir, readFile, writeFile, copyFile, rm } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const appDir = resolve(root, 'app')
const srcDir = resolve(appDir, 'renderer', 'src')
const distDir = resolve(appDir, 'dist')

function esbuildBinary() {
  const platform = process.platform
  const arch = process.arch
  const pkg = platform === 'win32'
    ? '@esbuild/win32-x64'
    : platform === 'darwin'
      ? (arch === 'arm64' ? '@esbuild/darwin-arm64' : '@esbuild/darwin-x64')
      : (arch === 'arm64' ? '@esbuild/linux-arm64' : '@esbuild/linux-x64')
  // Resolve through the package's own package.json (exports-map agnostic).
  return join(dirname(require.resolve(`${pkg}/package.json`)), platform === 'win32' ? 'esbuild.exe' : 'esbuild')
}

await rm(distDir, { recursive: true, force: true })
await mkdir(resolve(distDir, 'assets'), { recursive: true })

// 1) SFC -> self-contained module
const { parse, compileScript } = require('@vue/compiler-sfc')
const vueSource = await readFile(resolve(srcDir, 'App.vue'), 'utf8')
const parsed = parse(vueSource, { filename: 'App.vue' })
if (parsed.errors.length > 0) {
  throw new Error(`App.vue parse error: ${parsed.errors.map((e) => e.message ?? String(e)).join('; ')}`)
}
const script = compileScript(parsed.descriptor, {
  id: 'app',
  inlineTemplate: true,
  templateOptions: {
    compilerOptions: { comments: false },
  },
})
await writeFile(resolve(srcDir, 'App.generated.js'), script.content, 'utf8')

// 2) bundle
const bin = esbuildBinary()
const bundle = spawnSync(bin, [
  '--bundle',
  '--platform=browser',
  '--format=iife',
  '--target=es2020',
  '--minify',
  `--outfile=${resolve(distDir, 'assets', 'app.js')}`,
  resolve(srcDir, 'main.js'),
], { stdio: 'inherit', cwd: srcDir })
if (bundle.status !== 0) {
  throw new Error(`renderer bundle failed with exit code ${bundle.status ?? 'null'}`)
}

// 3) static shell
const html = `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>蓝鲸鱼</title>
    <link rel="stylesheet" href="./style.css" />
  </head>
  <body>
    <div id="app"></div>
    <script src="./assets/app.js"></script>
  </body>
</html>
`
await writeFile(resolve(distDir, 'index.html'), html, 'utf8')
await copyFile(resolve(srcDir, 'style.css'), resolve(distDir, 'style.css'))
await rm(resolve(srcDir, 'App.generated.js'), { force: true })

console.log('renderer built: app/dist/index.html + assets/app.js + style.css')
