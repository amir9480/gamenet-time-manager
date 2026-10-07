import { useEffect } from 'react'
import { lockNow, useSecurity } from '@/lib/security'

const EVENTS = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart'] as const
const CHECK_MS = 5000

// Locks the app after `timeoutMin` minutes without any input (when a PIN is set).
export function useIdleLock() {
  const { record, locked } = useSecurity()
  const timeoutMin = record?.timeoutMin ?? 0
  const active = record !== null && !locked && timeoutMin > 0

  useEffect(() => {
    if (!active) return
    let last = Date.now()
    const touch = () => {
      last = Date.now()
    }
    EVENTS.forEach((e) => window.addEventListener(e, touch, { passive: true }))
    // Polling (instead of one long timeout) also behaves after the PC sleeps.
    const id = setInterval(() => {
      if (Date.now() - last >= timeoutMin * 60_000) lockNow()
    }, CHECK_MS)
    return () => {
      EVENTS.forEach((e) => window.removeEventListener(e, touch))
      clearInterval(id)
    }
  }, [active, timeoutMin])
}
