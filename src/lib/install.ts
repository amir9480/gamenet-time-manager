// "Install the app" state for the web version: the browser's PWA install prompt plus whether the
// app already runs installed. The install dialog auto-opens once (`gn-install-seen`).
import { useSyncExternalStore } from 'react'
import { isStandalone, isTauri } from '@/lib/platform'

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<unknown> }

let deferred: InstallEvent | null = null
let installed = false
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((fn) => fn())
const subscribe = (fn: () => void) => {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

// Called once at startup: captures the install prompt before the UI asks for it.
export const watchInstall = () => {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferred = e as InstallEvent
    emit()
  })
  window.addEventListener('appinstalled', () => {
    installed = true
    deferred = null
    emit()
  })
}

export const promptInstall = async () => {
  if (!deferred) return
  const ev = deferred
  deferred = null
  emit()
  await ev.prompt()
  await ev.userChoice
}

export const useInstall = () => {
  const canPrompt = useSyncExternalStore(subscribe, () => deferred !== null)
  const done = useSyncExternalStore(subscribe, () => installed)
  // Nothing to offer inside the desktop app or an already installed PWA.
  return { canPrompt, offer: !isTauri() && !isStandalone() && !done }
}

const SEEN_KEY = 'gn-install-seen'
export const installSeen = () => {
  try {
    return localStorage.getItem(SEEN_KEY) === '1'
  } catch {
    return true
  }
}
export const markInstallSeen = () => {
  try {
    localStorage.setItem(SEEN_KEY, '1')
  } catch {
    // ignore
  }
}
