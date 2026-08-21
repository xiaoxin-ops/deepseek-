/**
 * 蓝鲸鱼 native notifications: Electron Notification wrapper honoring the
 * user's enable switch; click focuses the main window.
 */
import { Notification } from 'electron'
import { loadSettings } from './settings'
import { log } from './logger'

type FocusMain = () => void

let focusMain: FocusMain = () => {}

export function setNotificationFocusHandler(handler: FocusMain): void {
  focusMain = handler
}

export function showNotification(payload: { title: string; body?: string }): void {
  if (!loadSettings().notificationsEnabled) return
  if (!Notification.isSupported()) return
  try {
    const notification = new Notification({
      title: payload.title,
      body: payload.body ?? '',
    })
    notification.on('click', () => {
      focusMain()
    })
    notification.show()
  } catch (error) {
    log('notify', `notification failed: ${String(error)}`)
  }
}
