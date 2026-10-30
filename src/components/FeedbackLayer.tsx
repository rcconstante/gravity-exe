import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import { Rewind } from 'lucide-react'
import { GRAVITY_PRESETS } from '../lib/physicsConfig'
import { useUI } from '../lib/store'
import { isCoarsePointer, prefersReducedMotion } from '../lib/device'

/** Large typographic flash whenever the gravity law changes. */
function ModeFlash() {
  const gravity = useUI((s) => s.gravity)
  const ref = useRef<HTMLDivElement>(null)
  const first = useRef(true)

  useLayoutEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    const el = ref.current
    if (!el) return
    const reduced = prefersReducedMotion()
    const tl = gsap.timeline()
    tl.fromTo(
      el,
      { opacity: 0, y: reduced ? 0 : 24, letterSpacing: reduced ? '-0.04em' : '0.06em' },
      { opacity: 1, y: 0, letterSpacing: '-0.04em', duration: 0.55, ease: 'expo.out' },
    ).to(el, { opacity: 0, y: reduced ? 0 : -16, duration: 0.6, ease: 'power2.in', delay: 0.55 })
    return () => {
      tl.kill()
    }
  }, [gravity])

  const preset = GRAVITY_PRESETS[gravity]
  return (
    <div className="mode-flash" ref={ref} aria-hidden="true">
      <span className="mode-flash__name">{preset.short}</span>
      <span className="mode-flash__meta">
        g = {preset.magnitude} — {preset.description}
      </span>
    </div>
  )
}

/** Badge shown while time is frozen, and a stamp when a rewind is committed. */
function TimeBadge() {
  const timeMode = useUI((s) => s.timeMode)
  const offset = useUI((s) => s.scrubOffset)
  const rewindTick = useUI((s) => s.rewindTick)
  const seconds = useUI((s) => s.lastRewindSeconds)
  const stampRef = useRef<HTMLDivElement>(null)
  const firstTick = useRef(rewindTick)

  useEffect(() => {
    if (rewindTick === firstTick.current) return
    const el = stampRef.current
    if (!el) return
    const reduced = prefersReducedMotion()
    const tl = gsap.timeline()
    tl.fromTo(
      el,
      { opacity: 0, scale: reduced ? 1 : 1.6, rotate: reduced ? -4 : -14 },
      { opacity: 1, scale: 1, rotate: -4, duration: 0.42, ease: 'back.out(2.2)' },
    ).to(el, { opacity: 0, y: reduced ? 0 : -18, duration: 0.5, delay: 1.1, ease: 'power2.in' })
    return () => {
      tl.kill()
      gsap.set(el, { opacity: 0, y: 0 })
    }
  }, [rewindTick])

  return (
    <>
      <div className={`time-badge ${timeMode !== 'live' ? 'is-visible' : ''}`} aria-hidden={timeMode === 'live'}>
        <Rewind size={14} strokeWidth={2} aria-hidden="true" />
        <span>{timeMode === 'rewind' ? 'REWINDING' : 'TIME FROZEN'}</span>
        <span className="time-badge__offset">−{offset.toFixed(2)}s</span>
      </div>
      <div className="rewound-stamp" ref={stampRef} aria-live="polite">
        <span className="rewound-stamp__title">TIME REWOUND</span>
        <span className="rewound-stamp__meta">−{seconds.toFixed(2)} s · history rewritten</span>
      </div>
    </>
  )
}

/** Short contextual hints that appear when relevant and fade away. */
function Hints() {
  const ready = useUI((s) => s.ready)
  const hasInteracted = useUI((s) => s.hasInteracted)
  const magnet = useUI((s) => s.magnet)
  const timeMode = useUI((s) => s.timeMode)
  const [introHint, setIntroHint] = useState(true)
  const [magnetSeen, setMagnetSeen] = useState(false)
  const coarse = isCoarsePointer()

  useEffect(() => {
    if (!ready) return
    const id = window.setTimeout(() => setIntroHint(false), 9000)
    return () => window.clearTimeout(id)
  }, [ready])

  useEffect(() => {
    if (!magnet || magnetSeen) return
    const id = window.setTimeout(() => setMagnetSeen(true), 4500)
    return () => window.clearTimeout(id)
  }, [magnet, magnetSeen])

  let hint: string | null = null
  if (timeMode !== 'live') hint = 'Drag the timeline to travel · Resume continues from this exact moment'
  else if (magnet && !magnetSeen)
    hint = coarse ? 'Touch & hold to pull metal objects' : 'Metal objects follow your cursor · hold Shift to repel'
  else if (ready && introHint && !hasInteracted)
    hint = coarse ? 'Drag an object to throw it · two fingers to zoom' : 'Drag an object to throw it · drag empty space to orbit'

  return (
    <div className={`hint-chip ${hint ? 'is-visible' : ''}`} role="note">
      {hint}
    </div>
  )
}

export function FeedbackLayer() {
  const timeMode = useUI((s) => s.timeMode)
  const chaosTick = useUI((s) => s.chaosTick)
  const magnet = useUI((s) => s.magnet)
  const flashRef = useRef<HTMLDivElement>(null)

  // A soft whole-screen bloom on chaos.
  useEffect(() => {
    if (chaosTick === 0 || prefersReducedMotion()) return
    const el = flashRef.current
    if (!el) return
    gsap.fromTo(el, { opacity: 0.5 }, { opacity: 0, duration: 0.8, ease: 'power2.out' })
  }, [chaosTick])

  // Expose state for CSS (stage tint while scrubbing, magnet cursor).
  useEffect(() => {
    document.body.dataset.time = timeMode
  }, [timeMode])
  useEffect(() => {
    document.body.dataset.magnet = magnet ? 'on' : 'off'
  }, [magnet])

  return (
    <div className="feedback" aria-hidden={false}>
      <div className="scrub-veil" aria-hidden="true" />
      <div className="chaos-flash" ref={flashRef} aria-hidden="true" />
      <ModeFlash />
      <TimeBadge />
      <Hints />
    </div>
  )
}
