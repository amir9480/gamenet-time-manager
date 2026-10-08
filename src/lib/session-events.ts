// Notifies any open SessionSummaryDialog when its session is updated from elsewhere (currently:
// the limit alarm's extend/pause actions), so a dialog opened before that update doesn't later
// overwrite it with a stale draft on save.
import type { Session } from './store'

const EVENT = 'gn-session-updated'

export const emitSessionUpdated = (session: Session) => {
  window.dispatchEvent(new CustomEvent<Session>(EVENT, { detail: session }))
}

export const onSessionUpdated = (id: string, cb: (session: Session) => void) => {
  const handler = (e: Event) => {
    const session = (e as CustomEvent<Session>).detail
    if (session.id === id) cb(session)
  }
  window.addEventListener(EVENT, handler)
  return () => window.removeEventListener(EVENT, handler)
}
