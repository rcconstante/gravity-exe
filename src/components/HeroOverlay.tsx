import { useEffect, useState } from 'react'
import { Hand } from 'lucide-react'
import { DEVELOPER_CREDIT, GRAVITY_PRESETS, MAX_BODIES } from '../lib/physicsConfig'
import { physicsController } from '../lib/physicsController'
import { useUI } from '../lib/store'

/** Live lab readout in the top bar (sim time, gravity vector, body count). Updated ~8×/s. */
function LiveReadout() {
  const [text, setText] = useState({ t: '0.00', g: '0.00, −9.81, 0.00' })
  const count = useUI((s) => s.bodies.length)
  useEffect(() => {
    const id = window.setInterval(() => {
      const g = physicsController.gravity
      const f = (n: number) => (Math.abs(n) < 0.005 ? '0.00' : n.toFixed(2)).replace('-', '−')
      setText({ t: ((physicsController.frame / 60) % 10000).toFixed(2), g: `${f(g.x)}, ${f(g.y)}, ${f(g.z)}` })
    }, 125)
    return () => window.clearInterval(id)
  }, [])
  return (
    <dl className="readouts">
      <div>
        <dt>t</dt>
        <dd>{text.t}s</dd>
      </div>
      <div className="readouts__g">
        <dt>g</dt>
        <dd>({text.g})</dd>
      </div>
      <div>
        <dt>n</dt>
        <dd>
          {count}/{MAX_BODIES}
        </dd>
      </div>
    </dl>
  )
}

function StatusIndicator() {
  const paused = useUI((s) => s.paused)
  const slowMo = useUI((s) => s.slowMo)
  const timeMode = useUI((s) => s.timeMode)
  const gravity = useUI((s) => s.gravity)
  let label = 'PHYSICS ACTIVE'
  let state = 'active'
  if (timeMode === 'rewind') {
    label = 'REWINDING'
    state = 'time'
  } else if (timeMode === 'scrub') {
    label = 'TIME FROZEN'
    state = 'time'
  } else if (paused) {
    label = 'SIMULATION PAUSED'
    state = 'paused'
  } else if (slowMo) {
    label = 'PHYSICS ACTIVE · ×0.3'
  }
  return (
    <div className="status" data-state={state} role="status" aria-live="polite">
      <span className="status__dot" aria-hidden="true" />
      <span className="status__wave" aria-hidden="true">
        {Array.from({ length: 5 }, (_, i) => (
          <i key={i} style={{ animationDelay: `${i * 0.11}s` }} />
        ))}
      </span>
      <span className="status__label">{label}</span>
      <span className="status__mode">{GRAVITY_PRESETS[gravity].short}</span>
    </div>
  )
}

export function HeroOverlay() {
  const hasInteracted = useUI((s) => s.hasInteracted)

  return (
    <div className="overlay">
      <header className="topbar" data-animate="fade">
        <div className="brand">
          <img className="brand__mark" src="/brand/gravity-mark.png" width={36} height={36} alt="" />
          <span className="brand__word">
            GRAVITY<span>.exe</span>
          </span>
          <span className="brand__tag">EXPERIMENT 001</span>
        </div>
        <div className="topbar__right">
          <LiveReadout />
          <StatusIndicator />
        </div>
      </header>

      <section className="hero" aria-labelledby="headline">
        <p className="hero__eyebrow" data-animate="fade">
          <span>Nº 001</span> Interactive rigid-body laboratory
        </p>
        <h1 id="headline" className="headline" aria-label="Gravity is optional.">
          <span className="headline__line" aria-hidden="true">
            <span data-animate="rise">GRAVITY</span>
          </span>
          <span className="headline__line" aria-hidden="true">
            <span data-animate="rise">
              IS
            </span>
          </span>
          <span className="headline__line" aria-hidden="true">
            <span data-animate="rise">
              <em>OPTIONAL</em><i className="headline__dot">.</i>
            </span>
          </span>
        </h1>
        <p className="hero__subtitle" data-animate="fade">
          A tiny experimental universe where you make the rules.
        </p>
        <p className="hero__description" data-animate="fade">
          Every bounce, spin and collision here is solved in real time by a rigid-body engine — chrome is heavy, rubber
          is springy, acrylic is light. Nothing is pre-animated.
        </p>
        <p className={`hero__hint ${hasInteracted ? 'is-dimmed' : ''}`} data-animate="fade">
          <Hand size={15} strokeWidth={1.75} aria-hidden="true" />
          Grab something. Throw it. Change the rules.
        </p>
      </section>

      <footer className="credit" data-animate="fade">
        <span>
          Designed &amp; engineered by <strong>{DEVELOPER_CREDIT}</strong>
        </span>
        <span className="credit__keys">1–5 gravity · Space pause · R rewind · C chaos · M magnet · N spawn · X reset</span>
      </footer>
    </div>
  )
}
