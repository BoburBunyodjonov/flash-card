import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import './i18n'

// If this code is running under /admin, an outdated service worker hijacked
// the admin panel's URL and served the web app instead. Unregister it and
// reload so the request reaches the server (sessionStorage guards the loop).
if (window.location.pathname.startsWith('/admin') && !sessionStorage.getItem('ws_sw_recovered')) {
  sessionStorage.setItem('ws_sw_recovered', '1')
  navigator.serviceWorker?.getRegistrations().then(async (regs) => {
    await Promise.all(regs.map((r) => r.unregister()))
    window.location.reload()
  })
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
