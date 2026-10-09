// Step-by-step guides (driver.js). Each component owns its guide: it defines its steps next to its
// markup (`data-tour` attributes) and registers them with `registerTour`, so changing the component
// updates the guide. This file is only the engine. The user can skip all guides and replay the
// one on screen any time with F1.
import { driver, type Driver, type DriveStep, type PopoverDOM } from 'driver.js'
import 'driver.js/dist/driver.css'
import { prefKey } from '@/lib/store'

// Every guide flag lives under `<global prefix>tour:<name>` (e.g. `tour:skip`, `tour:paused-seen`).
export const tourKey = (name: string) => prefKey(`tour:${name}`)

// Flags used before the `tour:` namespace existed; moved over on first run.
for (const [from, to] of [
  ['tour-skip', 'skip'],
  ['tour-paused-seen', 'paused-seen'],
]) {
  try {
    const old = localStorage.getItem(prefKey(from))
    if (old !== null) {
      if (localStorage.getItem(tourKey(to)) === null) localStorage.setItem(tourKey(to), old)
      localStorage.removeItem(prefKey(from))
    }
  } catch {
    // ignore
  }
}

// «Seen once» flags for guides that show a single time.
export const tourSeen = (name: string) => {
  try {
    return localStorage.getItem(tourKey(name)) === '1'
  } catch {
    return true
  }
}

export const markTourSeen = (name: string) => {
  try {
    localStorage.setItem(tourKey(name), '1')
  } catch {
    // ignore
  }
}

export const tourSkipped = () => tourSeen('skip')

export const skipTours = () => markTourSeen('skip')

// Forgets every guide flag (seen-once ones and the skip flag) so all guides show again.
export const resetTours = () => {
  try {
    const prefix = tourKey('')
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith(prefix)) localStorage.removeItem(key)
    }
  } catch {
    // ignore
  }
}

let active: Driver | null = null
export const isTourActive = () => active !== null

export const tourEl = (sel: string) => document.querySelector(sel)
export const tourSel = (name: string) => `[data-tour="${name}"]`

// Several elements can share a target (one session card per session): the newest one wins, going by
// their `data-tour-at` timestamp.
export const tourLatest = (name: string): Element | undefined =>
  [...document.querySelectorAll(tourSel(name))].sort(
    (a, b) => Number(b.getAttribute('data-tour-at')) - Number(a.getAttribute('data-tour-at')),
  )[0]

// Adds «رد کردن همه‌ی راهنماها» under every popover.
const addSkipAll = (popover: PopoverDOM, d: Driver) => {
  // The popover is created outside any open dialog; make sure a modal never makes it inert.
  popover.wrapper.removeAttribute('inert')
  popover.wrapper.removeAttribute('aria-hidden')
  if (popover.wrapper.querySelector('.gn-tour-skip')) return
  const btn = document.createElement('button')
  btn.type = 'button'
  btn.className = 'gn-tour-skip'
  btn.textContent = 'رد کردن همه‌ی راهنماها'
  btn.addEventListener('click', () => {
    skipTours()
    d.destroy()
  })
  popover.wrapper.appendChild(btn)
}


export type TourOptions = {
  // The first run makes the user create a customer (a replay only explains it).
  forceCustomer?: boolean
}

// Handed to a guide's `steps` builder.
export type TourContext = TourOptions & {
  // Poll `fn` every `ms` (one watcher at a time); it is stopped when the step ends or the guide closes.
  watch: (fn: () => void, ms: number) => void
  stopWatch: () => void
  // Continue with another guide once this one ends (a registered guide may be named by its id, so
  // a component doesn't have to import the one that owns it).
  chainTo: (def: TourDef | string) => void
}

export type TourDef = {
  id: string
  // Selector present in the DOM while this component is on screen; F1 picks the highest `priority`
  // guide whose target is present.
  present: string
  priority: number
  steps: (ctx: TourContext) => DriveStep[]
}

const registry: TourDef[] = []

// A guide to start once the user's next action completes (e.g. the card guide after the first
// session was created, even if they closed the add-session guide before that).
let followUp: string | null = null
export const setTourFollowUp = (id: string | null) => {
  followUp = id
}
export const takeTourFollowUp = () => {
  const id = followUp
  followUp = null
  return id
}
export const registerTour = (def: TourDef) => {
  if (!registry.some((d) => d.id === def.id)) registry.push(def)
}

// Shared driver setup. `cleanup` runs when the guide ends, then `onEnd`.
function drive(steps: DriveStep[], cleanup: () => void, onEnd: () => void) {
  const d = driver({
    steps,
    animate: true,
    smoothScroll: true,
    allowScroll: true,
    // Arrow keys would move the guide while typing in the dialog's inputs.
    allowKeyboardControl: false,
    overlayClickBehavior: 'none',
    stagePadding: 6,
    stageRadius: 10,
    showProgress: true,
    progressText: 'مرحله‌ی {{current}} از {{total}}',
    nextBtnText: 'بعدی',
    prevBtnText: 'قبلی',
    doneBtnText: 'پایان',
    closeBtnLabel: 'بستن',
    popoverClass: 'gn-tour',
    onPopoverRender: (popover, { driver: dr }) => addSkipAll(popover, dr),
    onDestroyed: () => {
      cleanup()
      window.clearInterval(alive)
      active = null
      onEnd()
    },
  })
  // The guide ends when its target disappears (the dialog was closed or the card removed).
  const alive = window.setInterval(() => {
    const el = d.getActiveElement()
    if (el && !el.isConnected && !d.getActiveStep()?.data?.keepAlive) d.destroy()
  }, 400)
  active = d
  d.drive()
}

export function startTour(def: TourDef, onEnd: () => void, opts: TourOptions = {}) {
  if (active) return
  let watcher: number | undefined
  let next: TourDef | string | undefined
  const stopWatch = () => {
    window.clearInterval(watcher)
    watcher = undefined
  }
  const ctx: TourContext = {
    ...opts,
    watch: (fn, ms) => {
      stopWatch()
      watcher = window.setInterval(fn, ms)
    },
    stopWatch,
    chainTo: (d) => (next = d),
  }
  drive(def.steps(ctx), stopWatch, () => {
    const def = typeof next === 'string' ? registry.find((d) => d.id === next) : next
    if (def) startTour(def, onEnd, opts)
    else onEnd()
  })
}

export function startTourById(id: string, onEnd: () => void, opts: TourOptions = {}) {
  const def = registry.find((d) => d.id === id)
  if (def) startTour(def, onEnd, opts)
  else onEnd()
}

// F1: the guide of whatever is on screen (false when there is none).
export function startGuide(onEnd: () => void, opts: TourOptions = {}) {
  const def = [...registry]
    .sort((a, b) => b.priority - a.priority)
    .find((d) => tourEl(d.present))
  if (!def) return false
  startTour(def, onEnd, opts)
  return true
}

export const stopTour = () => active?.destroy()
