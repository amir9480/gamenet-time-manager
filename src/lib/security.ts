import Dexie, { type EntityTable } from 'dexie'
import { useSyncExternalStore } from 'react'

// App lock (PIN). Everything lives in its own IndexedDB database, separate from the business
// data, so import / backups / clearing history never touch it. This is client-side only: it
// deters casual access at the PC, it cannot stop someone who opens the browser devtools.

export type SecurityRecord = {
  // 'backup' is a permanent mirror used to restore 'main' if it is deleted (see the guard below).
  key: 'main' | 'backup'
  salt: Uint8Array
  hash: Uint8Array
  iterations: number
  // Idle minutes before the app locks itself; 0 = never.
  timeoutMin: number
  // Consecutive wrong PINs and the end of the current wait.
  failCount: number
  lockedUntil: number
  // When «فراموشی رمز» was started (epoch ms); the PIN can be removed 24 h later.
  forgotAt: number | null
  // Bumped on every legitimate write; lets the guard tell another tab's change from tampering.
  rev?: number
}

class SecurityDB extends Dexie {
  security!: EntityTable<SecurityRecord, 'key'>
  constructor() {
    super('gamenet-security')
    this.version(1).stores({ security: 'key' })
  }
}

const sdb = new SecurityDB()

export const PIN_MIN = 4
export const PIN_MAX = 8
export const FORGOT_WAIT_MS = 24 * 60 * 60 * 1000
export const TIMEOUT_OPTIONS = [0, 1, 5, 10, 30, 60]
export const DEFAULT_TIMEOUT_MIN = 5
const ITERATIONS = 310_000
// Wait after each batch of 3 wrong PINs (the last value repeats).
const FAIL_BATCH = 3
const WAITS_MS = [30_000, 60_000, 300_000, 900_000]

export const isValidPin = (pin: string) => new RegExp(`^\\d{${PIN_MIN},${PIN_MAX}}$`).test(pin)

const hashPin = async (pin: string, salt: Uint8Array, iterations: number) => {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, [
    'deriveBits',
  ])
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations },
    key,
    256,
  )
  return new Uint8Array(bits)
}

const sameBytes = (a: Uint8Array, b: Uint8Array) => {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i]
  return diff === 0
}

// ── Shared state ────────────────────────────────────────────────────────────
type State = {
  ready: boolean
  record: SecurityRecord | null
  // False after every page load; becomes true once the PIN was entered.
  unlocked: boolean
  // Bumped on each lock so the app can reset open dialogs / transient state.
  epoch: number
}

let state: State = { ready: false, record: null, unlocked: false, epoch: 0 }
const listeners = new Set<() => void>()
const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('gamenet-security') : null

const set = (patch: Partial<State>) => {
  state = { ...state, ...patch }
  syncGuard()
  listeners.forEach((l) => l())
}

const BACKUP = 'backup'
const GUARD_MS = 500
// True while a legitimate removal is running (here or in another tab): the guard stands down.
let paused = false

const asMain = (r: SecurityRecord): SecurityRecord => ({ ...r, key: 'main' })
const asBackup = (r: SecurityRecord): SecurityRecord => ({ ...r, key: BACKUP })

const sameRecord = (a: SecurityRecord, b: SecurityRecord) =>
  sameBytes(a.salt, b.salt) &&
  sameBytes(a.hash, b.hash) &&
  a.iterations === b.iterations &&
  a.timeoutMin === b.timeoutMin &&
  a.failCount === b.failCount &&
  a.lockedUntil === b.lockedUntil &&
  a.forgotAt === b.forgotAt &&
  (a.rev ?? 0) === (b.rev ?? 0)

// When the two rows disagree (one was edited), keep the newer one; on a tie the stricter one
// (longer wait, more failures, later forgot deadline, shorter auto-lock), so weakening a
// single row never helps.
const pick = (a: SecurityRecord, b: SecurityRecord) => {
  if ((a.rev ?? 0) !== (b.rev ?? 0)) return (a.rev ?? 0) > (b.rev ?? 0) ? a : b
  if (a.lockedUntil !== b.lockedUntil) return a.lockedUntil > b.lockedUntil ? a : b
  if (a.failCount !== b.failCount) return a.failCount > b.failCount ? a : b
  const forgot = (r: SecurityRecord) => r.forgotAt ?? Infinity
  if (forgot(a) !== forgot(b)) return forgot(a) > forgot(b) ? a : b
  const idle = (r: SecurityRecord) => (r.timeoutMin === 0 ? Infinity : r.timeoutMin)
  return idle(a) <= idle(b) ? a : b
}

const load = async () => {
  let record: SecurityRecord | null = null
  try {
    // Reload within the guard interval after a manual delete: restore from the mirror.
    record = await sdb.transaction('rw', sdb.security, async () => {
      const main = await sdb.security.get('main')
      const backup = await sdb.security.get(BACKUP)
      const rec = main && backup ? pick(main, backup) : (main ?? backup)
      if (!rec) return null
      if (!main || !sameRecord(main, rec)) await sdb.security.put(asMain(rec))
      if (!backup || !sameRecord(backup, rec)) await sdb.security.put(asBackup(rec))
      return asMain(rec)
    })
  } catch {
    // Storage unavailable: behave as "no PIN" rather than locking the user out forever.
  }
  paused = false
  set({ ready: true, record })
}

const write = async (next: SecurityRecord) => {
  const record = { ...next, rev: (state.record?.rev ?? 0) + 1 }
  await sdb.transaction('rw', sdb.security, async () => {
    await sdb.security.put(record)
    await sdb.security.put(asBackup(record))
  })
  set({ record })
  channel?.postMessage('changed')
}

// Legitimate removal (correct PIN, finished forgot wait, factory reset): the only way the
// guard stops. Both rows go in one transaction.
const removeRecord = async () => {
  paused = true
  channel?.postMessage('removing')
  try {
    await sdb.security.clear()
  } finally {
    paused = false
  }
  set({ record: null })
  channel?.postMessage('changed')
}

// Anti-tamper guard: while a PIN exists, every 500 ms restore any deleted or edited row
// (attempt counter, wait, forgot deadline, hash) from the in-memory copy. The mirror row
// is permanent, so even a delete + immediate reload cannot lose the PIN (load() restores it).
let guard: ReturnType<typeof setInterval> | undefined
// Consecutive ticks that saw a row newer than memory (another tab's write is on its way).
let ahead = 0
const tick = async () => {
  const rec = state.record
  if (!rec || paused) return
  try {
    await sdb.transaction('rw', sdb.security, async () => {
      if (paused) return
      const main = await sdb.security.get('main')
      const backup = await sdb.security.get(BACKUP)
      const newer = (r?: SecurityRecord) => !!r && (r.rev ?? 0) > (rec.rev ?? 0)
      // Another tab wrote legitimately: its broadcast reloads us. Only wait a few ticks, so
      // a hand-edited high `rev` can't switch the guard off.
      if ((newer(main) || newer(backup)) && ahead < 3) {
        ahead++
        return
      }
      ahead = 0
      if (!main || !sameRecord(main, rec)) await sdb.security.put(asMain(rec))
      if (!backup || !sameRecord(backup, rec)) await sdb.security.put(asBackup(rec))
    })
  } catch {
    // Retry on the next tick.
  }
}
const syncGuard = () => {
  if (state.record && guard === undefined) guard = setInterval(() => void tick(), GUARD_MS)
  else if (!state.record && guard !== undefined) {
    clearInterval(guard)
    guard = undefined
  }
}

channel?.addEventListener('message', (e) => {
  if (e.data === 'removing') paused = true
  else void load()
})
void load()

const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}
const getState = () => state

export const useSecurity = () => {
  const s = useSyncExternalStore(subscribe, getState)
  return {
    ...s,
    hasPin: s.record !== null,
    locked: !s.ready || (s.record !== null && !s.unlocked),
  }
}

export const lockNow = () => {
  if (state.record) set({ unlocked: false, epoch: state.epoch + 1 })
}

// ── Actions ─────────────────────────────────────────────────────────────────
export type VerifyResult =
  | { ok: true }
  | { ok: false; reason: 'wait'; until: number }
  | { ok: false; reason: 'forgot' }
  | { ok: false; reason: 'wrong'; remaining: number; until: number }

// Checks the PIN and applies the escalating wait after every 3 wrong tries in a row.
export const verifyPin = async (pin: string): Promise<VerifyResult> => {
  const rec = state.record
  if (!rec) return { ok: true }
  if (rec.forgotAt !== null) return { ok: false, reason: 'forgot' }
  const now = Date.now()
  if (rec.lockedUntil > now) return { ok: false, reason: 'wait', until: rec.lockedUntil }
  const hash = await hashPin(pin, rec.salt, rec.iterations)
  if (sameBytes(hash, rec.hash)) {
    if (rec.failCount > 0 || rec.lockedUntil > 0) await write({ ...rec, failCount: 0, lockedUntil: 0 })
    return { ok: true }
  }
  const failCount = rec.failCount + 1
  const batch = Math.floor(failCount / FAIL_BATCH)
  const until =
    failCount % FAIL_BATCH === 0 ? Date.now() + WAITS_MS[Math.min(batch, WAITS_MS.length) - 1] : 0
  await write({ ...rec, failCount, lockedUntil: until })
  return {
    ok: false,
    reason: 'wrong',
    remaining: until ? 0 : FAIL_BATCH - (failCount % FAIL_BATCH),
    until,
  }
}

export const unlock = () => set({ unlocked: true })

export const setPin = async (pin: string) => {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const hash = await hashPin(pin, salt, ITERATIONS)
  await write({
    key: 'main',
    salt,
    hash,
    iterations: ITERATIONS,
    timeoutMin: state.record?.timeoutMin ?? DEFAULT_TIMEOUT_MIN,
    failCount: 0,
    lockedUntil: 0,
    forgotAt: null,
  })
  set({ unlocked: true })
  // Ask the browser not to evict the database under storage pressure.
  void navigator.storage?.persist?.()
}

// Needs the current PIN; this is what stops the guard.
export const removePin = async (pin: string): Promise<VerifyResult> => {
  const res = await verifyPin(pin)
  if (res.ok) await removeRecord()
  return res
}

export const setTimeoutMin = async (timeoutMin: number) => {
  if (state.record) await write({ ...state.record, timeoutMin })
}

export const startForgot = async () => {
  if (state.record && state.record.forgotAt === null) {
    await write({ ...state.record, forgotAt: Date.now() })
  }
}

export const cancelForgot = async () => {
  if (state.record) await write({ ...state.record, forgotAt: null })
}

// Removes the PIN once the 24 h wait is over; the app data stays.
export const completeForgot = async () => {
  const rec = state.record
  if (rec && rec.forgotAt !== null && Date.now() - rec.forgotAt >= FORGOT_WAIT_MS) {
    await removeRecord()
    return true
  }
  return false
}

// Factory reset: forget the PIN too.
export const resetSecurity = () => removeRecord()
