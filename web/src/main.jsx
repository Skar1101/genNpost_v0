import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { setToken } from './lib/api.js'
import './styles/globals.css'

// Pick up ?token=... from a shared link (e.g. https://host/?token=xxxx) and remember it, so sharing
// access to a demo doesn't require anyone to configure request headers by hand — lib/api.js already
// had token storage, it was just never wired to anything.
//
// App.jsx is imported DYNAMICALLY, after this runs, rather than statically at the top of this file:
// lib/tittoDockStore.js opens its WebSocket subscription at MODULE load time (a deliberate singleton
// pattern, see its own comment), and a static `import App from './App.jsx'` would pull that in — and
// therefore connect the WebSocket with no token yet — before this code below it ever ran, since ES
// module imports are always evaluated before the importing file's own statements. Deferring the import
// guarantees the token is stored first no matter what any transitively-imported module does at load time.
const urlParams = new URLSearchParams(window.location.search)
const sharedToken = urlParams.get('token')
if (sharedToken) {
  setToken(sharedToken)
  urlParams.delete('token')
  const rest = urlParams.toString()
  window.history.replaceState({}, '', window.location.pathname + (rest ? `?${rest}` : ''))
}

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false } },
})

import('./App.jsx').then(({ default: App }) => {
  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </QueryClientProvider>
    </React.StrictMode>,
  )
})
