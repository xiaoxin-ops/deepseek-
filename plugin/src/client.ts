/**
 * Client half of dsh-blue-whale: runs inside the official Web UI.
 *
 * - When the page carries `window.dshDesktop` (injected by the 蓝鲸鱼 shell's
 *   preload), it provides the `dshDesktop` service for other plugins and
 *   fires native desktop notifications when a session's turn settles.
 * - In a plain browser (no bridge) it stays completely inert, so the plugin
 *   is safe to keep installed everywhere.
 */
import type { DshDesktopBridge } from './shared.ts'

export const name = 'dsh-blue-whale'

/** Client-side cordis services required before mounting. */
export const inject = ['sessions']

declare global {
  interface Window {
    dshDesktop?: DshDesktopBridge
  }
}

/** The service shape provided to sibling plugins under `dshDesktop`. */
export interface DshDesktopService {
  present: true
  platform: string
  notify(payload: { title: string; body?: string }): void
  setBadge(count: number): void
  flashFrame(): void
  showWindow(): void
}

interface SessionsListLike {
  getSnapshot(): unknown
  subscribe(listener: () => void): () => void
}

interface CtxLike {
  sessions?: { list?: SessionsListLike }
  provide(service: string, value: unknown): void
  effect(fn: () => (() => void) | void, label?: string): void
}

function doneTitle(): string {
  try {
    return navigator.language.toLowerCase().startsWith('zh') ? '会话完成' : 'Turn complete'
  } catch {
    return 'Turn complete'
  }
}

export function apply(ctx: CtxLike): void {
  const bridge = window.dshDesktop
  if (bridge === undefined || bridge.present !== true) return

  const service: DshDesktopService = {
    present: true,
    platform: bridge.platform,
    notify: (payload) => {
      try {
        bridge.notify(payload)
      } catch {
        // bridge went away mid-flight; the next call re-checks
      }
    },
    setBadge: (count) => {
      try {
        bridge.setBadge(count)
      } catch {
        // ignore
      }
    },
    flashFrame: () => {
      try {
        bridge.flashFrame()
      } catch {
        // ignore
      }
    },
    showWindow: () => {
      try {
        bridge.showWindow()
      } catch {
        // ignore
      }
    },
  }
  ctx.provide('dshDesktop', service)

  const list = ctx.sessions?.list
  if (list === undefined || typeof list.subscribe !== 'function' || typeof list.getSnapshot !== 'function') return

  // Diff the sessions list on the running bit: a true -> false edge means a
  // turn just settled. First observation only records the bit (the official
  // manager applies the same rule to its own "done" reminder). The list
  // snapshot is `{ ids, byId, current }` (SessionListState).
  const seen = new Map<string, boolean>()
  const scan = (): void => {
    let snapshot: unknown
    try {
      snapshot = list.getSnapshot()
    } catch {
      return
    }
    const record = snapshot as { ids?: string[]; byId?: Record<string, Record<string, unknown>> }
    const ids = Array.isArray(record.ids) ? record.ids : []
    const byId = record.byId ?? {}
    for (const id of ids) {
      const row = byId[id]
      if (row === null || typeof row !== 'object') continue
      const running = row.running === true
      const was = seen.get(id)
      seen.set(id, running)
      if (was === true && !running) {
        const title = typeof row.title === 'string' && row.title !== '' ? row.title : undefined
        const displayTitle = typeof row.displayTitle === 'string' && row.displayTitle !== '' ? row.displayTitle : undefined
        service.notify({ title: doneTitle(), body: title ?? displayTitle ?? id })
      }
    }
    for (const id of [...seen.keys()]) {
      if (!ids.includes(id)) seen.delete(id)
    }
  }

  const unsubscribe = list.subscribe(() => {
    try {
      scan()
    } catch {
      // never let a notification bug break the runtime loop
    }
  })
  ctx.effect(() => unsubscribe, 'dsh-blue-whale: session completion notifications')
  scan()
}
