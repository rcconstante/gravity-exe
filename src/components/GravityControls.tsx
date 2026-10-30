import { useLayoutEffect, useRef } from 'react'
import gsap from 'gsap'
import { ArrowRightToLine, ArrowUpToLine, Earth, Moon, Orbit, type LucideIcon } from 'lucide-react'
import { GRAVITY_ORDER, GRAVITY_PRESETS, type GravityMode } from '../lib/physicsConfig'
import { physicsController } from '../lib/physicsController'
import { useUI } from '../lib/store'
import { GravityIndicator } from './GravityIndicator'
import { ModuleLabel } from './ui'

const ICONS: Record<GravityMode, LucideIcon> = {
  earth: Earth,
  moon: Moon,
  zero: Orbit,
  reverse: ArrowUpToLine,
  sideways: ArrowRightToLine,
}

/** Five gravity laws as a segmented control with a sliding selection pill. */
export function GravityControls() {
  const gravity = useUI((s) => s.gravity)
  const scrubbing = useUI((s) => s.timeMode !== 'live')
  const listRef = useRef<HTMLDivElement>(null)
  const pillRef = useRef<HTMLSpanElement>(null)
  const first = useRef(true)

  // Slide the pill under the active button.
  useLayoutEffect(() => {
    const list = listRef.current
    const pill = pillRef.current
    if (!list || !pill) return
    const place = (animate: boolean) => {
      const button = list.querySelector<HTMLButtonElement>(`[data-mode="${gravity}"]`)
      if (!button) return
      const props = { x: button.offsetLeft, y: button.offsetTop, width: button.offsetWidth, height: button.offsetHeight }
      if (animate) gsap.to(pill, { ...props, duration: 0.5, ease: 'expo.out' })
      else gsap.set(pill, props)
    }
    place(!first.current)
    first.current = false
    const ro = new ResizeObserver(() => place(false))
    ro.observe(list)
    return () => ro.disconnect()
  }, [gravity])

  const preset = GRAVITY_PRESETS[gravity]

  return (
    <div className="module module--gravity" role="group" aria-label="Gravity">
      <div className="module__head">
        <ModuleLabel index="01">Gravity</ModuleLabel>
        <span className="readout" aria-live="polite">
          {preset.magnitude}
        </span>
      </div>
      <div className="gravity-row">
        <GravityIndicator />
        <div className="segmented" ref={listRef} role="radiogroup" aria-label="Gravity mode">
          <span className="segmented__pill" ref={pillRef} aria-hidden="true" />
          {GRAVITY_ORDER.map((mode) => {
            const Icon = ICONS[mode]
            const p = GRAVITY_PRESETS[mode]
            return (
              <button
                key={mode}
                type="button"
                role="radio"
                aria-checked={gravity === mode}
                tabIndex={gravity === mode ? 0 : -1}
                data-mode={mode}
                disabled={scrubbing}
                className={`segmented__btn ${gravity === mode ? 'is-active' : ''}`}
                onClick={() => physicsController.setGravity(mode)}
                onKeyDown={(event) => {
                  const index = GRAVITY_ORDER.indexOf(mode)
                  let next: number
                  switch (event.key) {
                    case 'ArrowRight':
                    case 'ArrowDown':
                      next = (index + 1) % GRAVITY_ORDER.length
                      break
                    case 'ArrowLeft':
                    case 'ArrowUp':
                      next = (index - 1 + GRAVITY_ORDER.length) % GRAVITY_ORDER.length
                      break
                    case 'Home':
                      next = 0
                      break
                    case 'End':
                      next = GRAVITY_ORDER.length - 1
                      break
                    default:
                      return
                  }
                  event.preventDefault()
                  const nextMode = GRAVITY_ORDER[next]
                  physicsController.setGravity(nextMode)
                  listRef.current?.querySelector<HTMLButtonElement>(`[data-mode="${nextMode}"]`)?.focus()
                }}
                title={`${p.label} — ${p.description} (key ${p.hotkey})`}
              >
                <Icon size={15} strokeWidth={1.75} aria-hidden="true" />
                <span>{p.short}</span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
