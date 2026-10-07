import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { initAutostart } from '@/lib/autostart'
import { watchInstall } from '@/lib/install'
import { startSingleInstance } from '@/lib/single-instance'
import { registerPwa } from '@/lib/update'

startSingleInstance()
watchInstall()
registerPwa()
void initAutostart()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
