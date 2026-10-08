// Calls the operator back to the app when a session's limit runs out while it is in the
// background: the desktop app brings its window to the front (and flashes the taskbar); the web
// app cannot focus itself, so it shows a system notification whose click focuses the window.
import { isTauri } from '@/lib/platform'

const notificationsSupported = () => !isTauri() && 'Notification' in window

// Asks once (browsers only allow it from a user gesture): called when a time limit is set.
export const requestNotificationPermission = () => {
  if (!notificationsSupported() || Notification.permission !== 'default') return
  Notification.requestPermission().catch(() => {})
}

const focusDesktopWindow = async () => {
  try {
    const { getCurrentWindow, UserAttentionType } = await import('@tauri-apps/api/window')
    const win = getCurrentWindow()
    await win.unminimize()
    await win.show()
    await win.setFocus()
    // Windows may refuse to steal focus; the flashing taskbar button still asks for attention.
    await win.requestUserAttention(UserAttentionType.Critical)
  } catch {
    // window API unavailable: the alarm dialog and beep remain
  }
}

const notify = async (title: string, body: string, tag: string) => {
  const options: NotificationOptions = {
    body,
    tag,
    lang: 'fa',
    dir: 'rtl',
    icon: `${import.meta.env.BASE_URL}pwa-192.png`,
    requireInteraction: true,
  }
  try {
    const n = new Notification(title, options)
    n.onclick = () => {
      window.focus()
      n.close()
    }
  } catch {
    // Mobile browsers only allow notifications through the service worker
    // (its click handler lives in public/notification-click.js).
    try {
      const reg = await navigator.serviceWorker?.getRegistration()
      await reg?.showNotification(title, options)
    } catch {
      // no notification possible
    }
  }
}

export const alertLimitReached = (deviceName: string, sessionId: string) => {
  if (isTauri()) {
    void focusDesktopWindow()
    return
  }
  if (document.hasFocus() || !notificationsSupported() || Notification.permission !== 'granted') {
    return
  }
  void notify(
    `محدودیت ${deviceName} تمام شد`,
    'برای ادامه، محدودیت را افزایش دهید یا تایم را متوقف کنید.',
    `limit-${sessionId}`,
  )
}
