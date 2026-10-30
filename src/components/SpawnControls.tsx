import { useEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import { ChevronUp, Plus, Shuffle } from 'lucide-react'
import { MAX_BODIES, OBJECT_SPECS, SPAWNABLE, type ObjectKind } from '../lib/physicsConfig'
import { physicsController } from '../lib/physicsController'
import { uiStore, useUI } from '../lib/store'

/** Little CSS swatches that hint at each object's material. */
const SWATCH: Record<ObjectKind, string> = {
  chromeSphere: 'swatch--chrome swatch--round',
  glassSphere: 'swatch--glass swatch--round',
  rubberCube: 'swatch--rubber',
  chromeTorus: 'swatch--chrome swatch--ring',
  acrylicCapsule: 'swatch--acrylic swatch--pill',
  plinth: 'swatch--lemon',
  pillar: 'swatch--blue',
  block: 'swatch--lemon',
  aluminumCube: 'swatch--alu',
  aluminumDisc: 'swatch--alu swatch--round',
}

export function SpawnControls() {
  const count = useUI((s) => s.bodies.length)
  const spawnKind = useUI((s) => s.spawnKind)
  const live = useUI((s) => s.timeMode === 'live')
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const full = count >= MAX_BODIES

  useEffect(() => {
    if (!open) return
    const menu = menuRef.current
    if (menu) gsap.fromTo(menu, { opacity: 0, y: 8, scale: 0.97 }, { opacity: 1, y: 0, scale: 1, duration: 0.28, ease: 'power3.out' })
    const close = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const esc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setOpen(false)
      rootRef.current?.querySelector<HTMLButtonElement>('.spawn__toggle')?.focus()
    }
    window.addEventListener('pointerdown', close)
    window.addEventListener('keydown', esc)
    return () => {
      window.removeEventListener('pointerdown', close)
      window.removeEventListener('keydown', esc)
    }
  }, [open])

  const spawn = (kind: ObjectKind | 'random') => {
    uiStore.set({ spawnKind: kind })
    physicsController.spawn(kind)
  }

  const label = spawnKind === 'random' ? 'Spawn' : `Spawn ${OBJECT_SPECS[spawnKind].label.toLowerCase()}`

  return (
    <div className="spawn" ref={rootRef}>
      <div className="spawn__split">
        <button
          type="button"
          className="spawn__main"
          disabled={full || !live}
          onClick={() => spawn(spawnKind)}
          aria-label={full ? 'Laboratory is full' : `${label} (N)`}
          title={full ? `Maximum of ${MAX_BODIES} bodies — reset to make room` : `${label} (N)`}
        >
          <Plus size={15} strokeWidth={2} aria-hidden="true" />
          <span>{full ? 'Lab full' : 'Spawn'}</span>
          <span className="spawn__count">
            {count}/{MAX_BODIES}
          </span>
        </button>
        <button
          type="button"
          className={`spawn__toggle ${open ? 'is-open' : ''}`}
          aria-label="Choose object to spawn"
          aria-expanded={open}
          aria-controls={open ? 'spawn-options' : undefined}
          onClick={() => setOpen((o) => !o)}
        >
          <ChevronUp size={15} strokeWidth={2} />
        </button>
      </div>
      {open && (
        <div className="spawn__menu" id="spawn-options" ref={menuRef} role="group" aria-label="Objects to spawn">
          <button
            type="button"
            aria-pressed={spawnKind === 'random'}
            className={`spawn__item ${spawnKind === 'random' ? 'is-active' : ''}`}
            disabled={full || !live}
            onClick={() => spawn('random')}
          >
            <Shuffle size={14} strokeWidth={1.75} aria-hidden="true" />
            Surprise me
          </button>
          {SPAWNABLE.map((kind) => (
            <button
              key={kind}
              type="button"
              aria-pressed={spawnKind === kind}
              className={`spawn__item ${spawnKind === kind ? 'is-active' : ''}`}
              disabled={full || !live}
              onClick={() => spawn(kind)}
            >
              <span className={`swatch ${SWATCH[kind]}`} aria-hidden="true" />
              {OBJECT_SPECS[kind].label}
              {OBJECT_SPECS[kind].material === 'metal' && <span className="spawn__tag">magnetic</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
