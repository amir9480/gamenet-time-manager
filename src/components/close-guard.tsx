import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { readSessions } from '@/lib/db'
import { isTauri } from '@/lib/platform'

// Asks before the window/tab is closed while a session is running. Web tab and installed PWA use
// the browser's own `beforeunload` prompt (pages can't show their own); the desktop app
// intercepts the close request and shows a dialog.
export function CloseGuard() {
  const running = useLiveQuery(
    async () => (await readSessions()).some((s) => s.status === 'running'),
  )
  const runningRef = useRef(false)
  runningRef.current = !!running
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (isTauri()) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!runningRef.current) return
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [])

  useEffect(() => {
    if (!isTauri()) return
    let unlisten: (() => void) | undefined
    let disposed = false
    import('@tauri-apps/api/window').then(({ getCurrentWindow }) =>
      getCurrentWindow()
        .onCloseRequested((event) => {
          if (!runningRef.current) return
          event.preventDefault()
          setOpen(true)
        })
        .then((fn) => (disposed ? fn() : (unlisten = fn))),
    )
    return () => {
      disposed = true
      unlisten?.()
    }
  }, [])

  if (!isTauri()) return null
  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogContent raised>
        <AlertDialogHeader>
          <AlertDialogTitle>بستن برنامه</AlertDialogTitle>
          <AlertDialogDescription>
            هنوز تایم در حال اجرا وجود دارد. با بستن برنامه، تایم‌ها حفظ می‌شوند ولی هشدار
            محدودیت زمانی تا باز شدن دوباره برنامه کار نمی‌کند. می‌خواهید برنامه بسته شود؟
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>ماندن در برنامه</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={() =>
              import('@tauri-apps/api/window').then(({ getCurrentWindow }) =>
                getCurrentWindow().destroy(),
              )
            }
          >
            بستن برنامه
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
