// Where the app runs: the Tauri desktop shell, an installed PWA, or a plain browser tab.
export const REPO = 'amir9480/gamenet-time-manager'
export const REPO_URL = `https://github.com/${REPO}`
export const APP_VERSION = __APP_VERSION__

export const isTauri = () => '__TAURI_INTERNALS__' in window

export const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true
