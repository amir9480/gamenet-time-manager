// Desktop app only: run on Windows startup by default. It is turned on once, on the first run
// (`gn-autostart-init`, not `gamenet-` so backups don't carry it); after that the Settings switch
// decides and its choice is kept.
import { isTauri } from '@/lib/platform'

const INIT_KEY = 'gn-autostart-init'

export const initAutostart = async () => {
  if (!isTauri()) return
  try {
    if (localStorage.getItem(INIT_KEY)) return
    const m = await import('@tauri-apps/plugin-autostart')
    if (!(await m.isEnabled())) await m.enable()
    localStorage.setItem(INIT_KEY, '1')
  } catch {
    // plugin or storage unavailable: try again on the next run
  }
}
