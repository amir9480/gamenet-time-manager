import { useSyncExternalStore } from 'react'

// One shared ticker, aligned to wall-clock seconds, so every subscriber (session cards,
// clocks) updates in the same frame no matter when it mounted.
let now = Date.now()
let timer: ReturnType<typeof setTimeout> | undefined
const listeners = new Set<() => void>()

const schedule = () => {
  timer = setTimeout(() => {
    now = Date.now()
    listeners.forEach((l) => l())
    schedule()
  }, 1000 - (Date.now() % 1000))
}

const subscribe = (listener: () => void) => {
  if (listeners.size === 0) {
    now = Date.now()
    schedule()
  }
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) clearTimeout(timer)
  }
}

const noopSubscribe = () => () => {}
const getSnapshot = () => now

// `active = false` stops re-rendering (e.g. paused sessions).
export const useNow = (active = true) =>
  useSyncExternalStore(active ? subscribe : noopSubscribe, getSnapshot)
