import { useEffect, useState } from 'react'
import { updateSessionRow } from '@/lib/db'
import { nextOverrideBoundary, splitByOverrides, type Session, type Settings } from '@/lib/store'

// Keeps live sessions cut at price-override edges: whenever sessions/settings change, and again
// exactly when the next override starts or ends, every session whose segments are out of date is
// re-split/joined (`splitByOverrides`) and written back. So a running line closes at the edge and
// a new one opens at the new price. Writes only on change, so it never loops.
export function useOverrideSplitter(settings: Settings | undefined, sessions: Session[] | undefined) {
  const [tick, setTick] = useState(0)

  useEffect(() => {
    if (!settings || !sessions) return
    const now = Date.now()
    for (const s of sessions) {
      if (splitByOverrides(s, settings, now) !== s) {
        updateSessionRow(s.id, (cur) => splitByOverrides(cur, settings, Date.now()))
      }
    }
  }, [settings, sessions, tick])

  const overrides = settings?.priceOverrides
  const running = sessions?.some((s) => s.status === 'running') ?? false
  useEffect(() => {
    if (!running || !overrides?.length) return
    const at = nextOverrideBoundary(overrides, Date.now())
    if (at === undefined) return
    const t = setTimeout(() => setTick((n) => n + 1), at - Date.now() + 250)
    return () => clearTimeout(t)
  }, [running, overrides, tick])
}
