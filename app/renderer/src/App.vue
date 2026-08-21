<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'

const api = window.blueWhale

const view = ref('settings')
const status = ref(null)
const logs = ref([])
const plugin = ref(null)
const installing = ref(false)
const installResult = ref(null)
const busy = reactive({ start: false, stop: false, restart: false })
const savedTick = ref(0)

const settings = ref(null)

function route() {
  const hash = window.location.hash.replace(/^#\/?/, '')
  if (hash === 'loading' || hash === 'offline' || hash === 'about' || hash === 'settings') {
    view.value = hash
  } else {
    view.value = 'settings'
  }
}

const stateLabel = computed(() => {
  if (status.value === null) return '未知'
  return {
    stopped: '已停止',
    starting: '启动中…',
    running: '运行中',
    stopping: '停止中…',
  }[status.value.state]
})

async function refresh() {
  if (api === undefined) return
  status.value = await api.getStatus()
  plugin.value = await api.pluginStatus()
}

async function save() {
  if (api === undefined || settings.value === null) return
  settings.value = await api.setSettings(settings.value)
  savedTick.value += 1
  window.setTimeout(() => {
    savedTick.value = Math.max(0, savedTick.value - 1)
  }, 2000)
}

async function start() {
  busy.start = true
  try {
    await api?.startService()
  } finally {
    busy.start = false
  }
}

async function stop() {
  busy.stop = true
  try {
    await api?.stopService()
  } finally {
    busy.stop = false
  }
}

async function restart() {
  busy.restart = true
  try {
    await api?.restartService()
  } finally {
    busy.restart = false
  }
}

async function install() {
  if (api === undefined) return
  installing.value = true
  installResult.value = null
  try {
    installResult.value = await api.installPlugin()
  } finally {
    installing.value = false
    await refresh()
  }
}

let statusOff
let logOff

onMounted(async () => {
  route()
  window.addEventListener('hashchange', route)
  if (api === undefined) return
  statusOff = api.onStatus((next) => {
    status.value = next
  })
  logOff = api.onLogLine((line) => {
    logs.value.push(line)
    if (logs.value.length > 200) logs.value.shift()
  })
  settings.value = await api.getSettings()
  await refresh()
  logs.value = await api.getLogs()
})

onBeforeUnmount(() => {
  window.removeEventListener('hashchange', route)
  statusOff?.()
  logOff?.()
})
</script>

<template>
  <div class="shell">
    <!-- ================= loading / offline ================= -->
    <div v-if="view === 'loading'" class="center-view">
      <div class="whale-mark">🐋</div>
      <h1>蓝鲸鱼</h1>
      <p class="dim">正在启动 Harness 服务…</p>
      <div class="spinner" />
    </div>

    <div v-else-if="view === 'offline'" class="center-view">
      <div class="whale-mark">🐋</div>
      <h1>服务未就绪</h1>
      <p class="dim">
        dsh 服务当前不可用（状态：{{ stateLabel }}）。<br />
        请确认 dsh 已安装并在 PATH 中，或前往设置调整命令路径。
      </p>
      <div class="row gap">
        <button class="btn primary" @click="start">重试启动</button>
        <button class="btn" @click="view = 'settings'">打开设置</button>
      </div>
      <pre v-if="logs.length > 0" class="logbox">{{ logs.slice(-12).join('\n') }}</pre>
    </div>

    <!-- ================= settings ================= -->
    <template v-else-if="view === 'settings'">
      <header class="topbar">
        <div class="brand">
          <span class="whale-mark small">🐋</span>
          <div>
            <div class="brand-name">蓝鲸鱼</div>
            <div class="brand-sub">DeepSeek Harness 桌面客户端</div>
          </div>
        </div>
        <nav>
          <a href="#settings">设置</a>
          <a href="#about">关于</a>
        </nav>
      </header>

      <main v-if="settings !== null" class="content">
        <section class="card">
          <div class="card-title">服务状态</div>
          <div class="status-strip">
            <span class="pill" :class="status?.state">{{ stateLabel }}</span>
            <span v-if="status?.url" class="dim mono">{{ status.url }}</span>
            <span v-else class="dim">尚未获得服务地址</span>
          </div>
          <div class="row gap">
            <button class="btn primary" :disabled="busy.start || status?.state === 'running'" @click="start">启动</button>
            <button class="btn" :disabled="busy.stop || status?.state === 'stopped'" @click="stop">停止</button>
            <button class="btn" :disabled="busy.restart" @click="restart">重启</button>
            <button class="btn" @click="api?.openInBrowser()">在浏览器打开</button>
          </div>
        </section>

        <section class="card">
          <div class="card-title">Harness 服务</div>
          <label class="field">
            <span>dsh 命令</span>
            <input v-model="settings.command" spellcheck="false" placeholder="dsh" />
          </label>
          <label class="field">
            <span>Profile</span>
            <input v-model="settings.profile" spellcheck="false" placeholder="web" />
          </label>
          <label class="field">
            <span>端口（0 = 自动选择）</span>
            <input v-model.number="settings.port" type="number" min="0" max="65535" />
          </label>
          <label class="field">
            <span>工作目录（Harness 默认 workspace）</span>
            <input v-model="settings.workspace" spellcheck="false" />
          </label>
          <div class="check-list">
            <label><input v-model="settings.autoRestart" type="checkbox" /> 意外退出时自动重启</label>
            <label><input v-model="settings.closeToTray" type="checkbox" /> 关闭窗口时隐藏到托盘</label>
            <label><input v-model="settings.startMinimized" type="checkbox" /> 启动时最小化到托盘</label>
            <label><input v-model="settings.openAtLogin" type="checkbox" /> 登录时自动启动</label>
          </div>
          <div class="row gap">
            <button class="btn primary" @click="save">保存设置</button>
            <span v-if="savedTick > 0" class="ok">已保存 ✓</span>
          </div>
        </section>

        <section class="card">
          <div class="card-title">桌面桥接插件（dsh-blue-whale）</div>
          <p class="dim">
            一切皆插件：桌面通知、托盘状态等集成能力全部由安装在 profile 内的
            dsh-blue-whale 插件提供，经官方 <code>dsh plugin</code> 通道安装。
          </p>
          <div class="status-strip">
            <span class="pill" :class="plugin?.installed ? 'running' : 'stopped'">
              {{ plugin?.installed === true ? `已安装${plugin?.version ? ` · v${plugin.version}` : ''}` : plugin?.installed === false ? '未安装' : '未知' }}
            </span>
            <span v-if="plugin?.bundled === false" class="warn">未内置插件包（开发构建）</span>
          </div>
          <label class="check-list"><input v-model="settings.autoInstallPlugin" type="checkbox" /> 启动时自动安装/更新插件</label>
          <div class="row gap">
            <button class="btn primary" :disabled="installing" @click="install">
              {{ installing ? '安装中…' : '安装 / 更新插件' }}
            </button>
            <span class="dim">安装后会重启 Harness 服务以挂载插件</span>
          </div>
          <pre v-if="installResult" class="logbox">{{ installResult.output.slice(-2000) }}</pre>
        </section>

        <section class="card">
          <div class="card-title">通知与开发</div>
          <div class="check-list">
            <label><input v-model="settings.notificationsEnabled" type="checkbox" /> 桌面通知（会话完成等）</label>
            <label><input v-model="settings.devtools" type="checkbox" /> 菜单显示开发者工具</label>
          </div>
          <div class="row gap">
            <button class="btn primary" @click="save">保存设置</button>
          </div>
        </section>

        <section class="card">
          <div class="card-title">日志</div>
          <div class="row gap">
            <button class="btn" @click="api?.openLogs()">打开日志文件</button>
          </div>
          <pre class="logbox">{{ logs.slice(-40).join('\n') }}</pre>
        </section>
      </main>
    </template>

    <!-- ================= about ================= -->
    <template v-else-if="view === 'about'">
      <header class="topbar">
        <div class="brand">
          <span class="whale-mark small">🐋</span>
          <div>
            <div class="brand-name">蓝鲸鱼</div>
            <div class="brand-sub">DeepSeek Harness 桌面客户端</div>
          </div>
        </div>
        <nav>
          <a href="#settings">设置</a>
          <a href="#about">关于</a>
        </nav>
      </header>
      <main class="content">
        <section class="card about">
          <div class="whale-mark">🐋</div>
          <h2>蓝鲸鱼 · DSH Desktop</h2>
          <p class="dim">版本 0.1.0</p>
          <p class="dim">
            自动托管本地 <code>dsh web</code> 服务并把官方 Web UI 嵌入原生窗口；
            系统托盘、桌面通知、自定义菜单由本壳提供，集成能力来自
            dsh-blue-whale 插件（一切皆插件）。
          </p>
          <div class="row gap">
            <button class="btn" @click="api?.openExternal('https://github.com/deepseek-ai/deepseek-harness')">DeepSeek Harness</button>
            <button class="btn" @click="view = 'settings'">返回设置</button>
            <button class="btn danger" @click="api?.quit()">退出 蓝鲸鱼</button>
          </div>
        </section>
      </main>
    </template>
  </div>
</template>
