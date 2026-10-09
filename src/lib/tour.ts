// Step-by-step guides (driver.js). Each component owns its guide: it defines its steps next to its
// markup (`data-tour` attributes) and registers them with `registerTour`, so changing the component
// updates the guide. This file is only the engine. The user can skip all guides and replay the
// one on screen any time with F1.
import { driver, type Driver, type DriveStep, type PopoverDOM } from 'driver.js'
import 'driver.js/dist/driver.css'
import { prefKey } from '@/lib/store'

const SKIP_KEY = prefKey('tour-skip')

export const tourSkipped = () => {
  try {
    return localStorage.getItem(SKIP_KEY) === '1'
  } catch {
    return true
  }
}

export const skipTours = () => {
  try {
    localStorage.setItem(SKIP_KEY, '1')
  } catch {
    // ignore
  }
}

let active: Driver | null = null
export const isTourActive = () => active !== null

export const tourEl = (sel: string) => document.querySelector(sel)
export const tourSel = (name: string) => `[data-tour="${name}"]`

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
  // Continue with another guide once this one ends.
  chainTo: (def: TourDef) => void
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
  let next: TourDef | undefined
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
    if (next) startTour(next, onEnd, opts)
    else onEnd()
  })
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
