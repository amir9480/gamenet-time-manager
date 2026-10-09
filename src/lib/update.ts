// Update checks. Desktop (Tauri): compares the running version with the newest GitHub release,
// downloads its installer, starts it detached and closes the app. Web (PWA): the service worker
// reports a waiting new version; the release (when newer) only supplies the version and notes.
// Skipped versions live in localStorage.
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { APP_VERSION, isTauri } from '@/lib/platform'
import { compareVersions, fetchLatestRelease, type ReleaseInfo } from '@/lib/release'
import { prefKey } from '@/lib/store'

const SKIP_KEY = prefKey('skipped-update')
// Update checks run at startup and then every CHECK_EVERY.
const CHECK_EVERY = 10 * 60_000

const skippedVersion = () => {
  try {
    return localStorage.getItem(SKIP_KEY) ?? ''
  } catch {
    return ''
  }
}

// --- PWA service worker state (module level: registration must happen once, at startup) ---
let needRefresh = false
let applySw: ((reload?: boolean) => Promise<void>) | undefined
const listeners = new Set<() => void>()
const subscribe = (fn: () => void) => {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export const registerPwa = () => {
  if (isTauri() || !('serviceWorker' in navigator)) return
  import('virtual:pwa-register').then(({ registerSW }) => {
    applySw = registerSW({
      onNeedRefresh() {
        needRefresh = true
        listeners.forEach((fn) => fn())
      },
      onRegisteredSW(_url, reg) {
        // Registering already checked once at startup.
        if (reg) setInterval(() => void reg.update(), CHECK_EVERY)
      },
    })
  })
}

export type UpdateState = {
  available: boolean
  // Newest release when it is newer than the running version, else null (web: unknown).
  release: ReleaseInfo | null
  busy: boolean
  // 0..1 while the desktop installer downloads; null when unknown.
  progress: number | null
  error: string
  apply: () => Promise<void>
  // Desktop only: on the web a waiting service worker activates anyway once all tabs close.
  skip: () => void
  later: () => void
}

export const useUpdate = (): UpdateState => {
  const desktop = isTauri()
  const swWaiting = useSyncExternalStore(subscribe, () => needRefresh)
  const [release, setRelease] = useState<ReleaseInfo | null>(null)
  // Version dismissed with «بعداً» (web without a known release: 'sw'); a newer one shows again.
  const [dismissed, setDismissed] = useState<string | null>(null)
  const [skipped, setSkipped] = useState(skippedVersion)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<number | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    const check = () =>
      fetchLatestRelease().then((r) => {
        if (alive) setRelease(r && compareVersions(r.version, APP_VERSION) > 0 ? r : null)
      })
    check()
    const t = setInterval(check, CHECK_EVERY)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [])

  const isNew = desktop ? !!release : swWaiting
  const current = release?.version ?? 'sw'
  const available = isNew && dismissed !== current && !(release && release.version === skipped)

  const apply = useCallback(async () => {
    setError('')
    if (!desktop) {
      await applySw?.(true)
      return
    }
    if (!release?.installerUrl) {
      setError('فایل نصب این نسخه در گیت‌هاب پیدا نشد.')
      return
    }
    setBusy(true)
    setProgress(null)
    try {
      const [{ invoke }, { listen }, { getCurrentWindow }] = await Promise.all([
        import('@tauri-apps/api/core'),
        import('@tauri-apps/api/event'),
        import('@tauri-apps/api/window'),
      ])
      const off = await listen<{ downloaded: number; total: number }>('update-progress', (e) =>
        setProgress(e.payload.total ? e.payload.downloaded / e.payload.total : null),
      )
      try {
        const path = await invoke<string>('download_installer', { url: release.installerUrl })
        await invoke('run_installer', { path })
      } finally {
        off()
      }
      // The installer runs in its own process; close this window so it can replace the files.
      await getCurrentWindow().destroy()
    } catch (e) {
      setError(`دانلود یا اجرای نصب‌کننده ناموفق بود (${String(e)}).`)
      setBusy(false)
    }
  }, [desktop, release])

  const skip = useCallback(() => {
    if (release) {
      try {
        localStorage.setItem(SKIP_KEY, release.version)
      } catch {
        // storage unavailable: the prompt simply returns next time
      }
      setSkipped(release.version)
    }
    setDismissed(current)
  }, [release, current])

  const later = useCallback(() => setDismissed(current), [current])

  return { available, release, busy, progress, error, apply, skip, later }
}
