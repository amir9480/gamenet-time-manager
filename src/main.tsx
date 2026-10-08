import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { initAutostart } from '@/lib/autostart'
import { watchInstall } from '@/lib/install'
import { startSingleInstance } from '@/lib/single-instance'
import { registerPwa } from '@/lib/update'

// A lazy chunk of an older build is gone after a deploy: reload once to pick up the new build.
window.addEventListener('vite:preloadError', (e) => {
  try {
    const last = Number(sessionStorage.getItem('gn-chunk-reload') ?? 0)
    if (Date.now() - last < 30_000) return
    sessionStorage.setItem('gn-chunk-reload', String(Date.now()))
  } catch {
    return
  }
  e.preventDefault()
  location.reload()
})

startSingleInstance()
watchInstall()
registerPwa()
void initAutostart()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
