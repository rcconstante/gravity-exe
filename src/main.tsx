import { createRoot } from 'react-dom/client'
import App from './App'
import { createInitialComposition, getRoomDimensions } from './lib/physicsConfig'
import { uiStore } from './lib/store'
import { initialQuality } from './lib/device'
import '@fontsource/public-sans/latin-400.css'
import '@fontsource/public-sans/latin-500.css'
import '@fontsource/public-sans/latin-600.css'
import '@fontsource/public-sans/latin-700.css'
import '@fontsource/public-sans/latin-800.css'
import '@fontsource/barlow-condensed/latin-800.css'
import './styles/global.css'

// Choose the room size and quality tier once, before the first render.
const room = getRoomDimensions(window.innerWidth / window.innerHeight)
uiStore.set({ room, bodies: createInitialComposition(room), quality: initialQuality() })

// StrictMode is intentionally omitted: its double-mounting would create and free the
// Rapier WASM world twice in development, which adds nothing for this app.
createRoot(document.getElementById('root')!).render(<App />)

// Development-only handle for debugging the simulation from the console.
if (import.meta.env.DEV) {
  void import('./lib/physicsController').then(({ physicsController }) => {
    ;(window as unknown as Record<string, unknown>).__gravity = { physicsController, uiStore }
  })
}
