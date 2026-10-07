// One running app per browser profile (web/PWA; the desktop app uses the Tauri single-instance
// plugin). The window holding the `gamenet-instance` Web Lock is the active one; any other window
// renders only `InstanceScreen` (no alarms, no timers). «استفاده در این پنجره» asks the active
// window over a BroadcastChannel to step aside and then takes the lock. An installed PWA launched
// again focuses its existing window instead (manifest `launch_handler`, Chromium).
import { useSyncExternalStore } from 'react'

export type InstanceState = 'pending' | 'active' | 'other'

const LOCK = 'gamenet-instance'
const supported = typeof navigator !== 'undefined' && 'locks' in navigator

let state: InstanceState = supported ? 'pending' : 'active'
let release: (() => void) | undefined
const listeners = new Set<() => void>()
const channel = supported ? new BroadcastChannel(LOCK) : undefined

const set = (next: InstanceState) => {
  state = next
  listeners.forEach((l) => l())
}

// Holds the lock until `release` is called (or the window closes).
const hold = () =>
  new Promise<void>((resolve) => {
    release = resolve
    set('active')
  })

export const startSingleInstance = () => {
  if (!supported) return
  channel!.onmessage = (e) => {
    if (e.data !== 'takeover' || !release) return
    release()
    release = undefined
    set('other')
  }
  navigator.locks
    .request(LOCK, { ifAvailable: true }, (lock) => (lock ? hold() : set('other')))
    .catch(() => set('active'))
}

export const takeOver = () => {
  if (!supported) return
  set('pending')
  channel!.postMessage('takeover')
  navigator.locks.request(LOCK, hold).catch(() => set('active'))
}

const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}

export const useInstance = () => useSyncExternalStore(subscribe, () => state)
