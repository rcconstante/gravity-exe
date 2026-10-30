import { useEffect } from 'react'
import { GRAVITY_ORDER } from '../lib/physicsConfig'
import { physicsController } from '../lib/physicsController'
import { uiStore } from '../lib/store'
import { triggerChaos } from '../components/ExperimentControls'

/**
 * 1–5 gravity · Space pause · R (hold) rewind · Enter/Esc resume · C chaos
 * M magnet · N spawn · X reset. Ignored while typing in form fields.
 */
export function useKeyboardShortcuts() {
  useEffect(() => {
    const isTyping = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      if (!el) return false
      if (el.tagName === 'INPUT' && (el as HTMLInputElement).type === 'range') return false
      return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable
    }

    const onDown = (e: KeyboardEvent) => {
      if (isTyping(e) || e.metaKey || e.ctrlKey || e.altKey) return
      const ui = uiStore.get()
      const key = e.key.toLowerCase()
      const index = Number(e.key) - 1
      if (index >= 0 && index < GRAVITY_ORDER.length && !e.repeat) {
        if (ui.timeMode === 'live') physicsController.setGravity(GRAVITY_ORDER[index])
        return
      }
      // Don't hijack Space/Enter when a button has focus — let it click.
      const onButton = (e.target as HTMLElement | null)?.tagName === 'BUTTON'
      switch (key) {
        case ' ':
          if (onButton) return
          e.preventDefault()
          if (ui.timeMode !== 'live') physicsController.resume()
          else uiStore.set({ paused: !ui.paused, hasInteracted: true })
          break
        case 'r':
          if (!e.repeat) physicsController.startRewind()
          break
        case 'enter':
        case 'escape':
          if (onButton && key === 'enter') return
          if (ui.timeMode !== 'live') physicsController.resume()
          break
        case 'c':
          if (!e.repeat) triggerChaos(document.querySelector<HTMLElement>('.module--tools .chaos-btn'))
          break
        case 'm':
          uiStore.set({ magnet: !ui.magnet, hasInteracted: true })
          break
        case 'n':
          physicsController.spawn(ui.spawnKind)
          break
        case 'x':
          if (!e.repeat) physicsController.reset()
          break
      }
    }

    const onUp = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'r') physicsController.stopRewind()
    }

    window.addEventListener('keydown', onDown)
    window.addEventListener('keyup', onUp)
    return () => {
      window.removeEventListener('keydown', onDown)
      window.removeEventListener('keyup', onUp)
    }
  }, [])
}
