import { useLayoutEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import { ExperienceCanvas } from './components/ExperienceCanvas'
import { HeroOverlay } from './components/HeroOverlay'
import { ControlDock } from './components/ControlDock'
import { FeedbackLayer } from './components/FeedbackLayer'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import { hasWebGL, prefersReducedMotion } from './lib/device'

function NoWebGL() {
  return (
    <div className="no-webgl" role="alert">
      <h2>WebGL is unavailable.</h2>
      <p>
        GRAVITY.exe simulates real rigid bodies in 3D and needs WebGL. Try enabling hardware acceleration or opening
        the page in a recent version of Chrome, Safari, Firefox or Edge.
      </p>
    </div>
  )
}

export default function App() {
  const rootRef = useRef<HTMLDivElement>(null)
  const [webgl] = useState(hasWebGL)
  useKeyboardShortcuts()

  // Editorial entrance: headline lines rise out of their masks, UI fades up.
  useLayoutEffect(() => {
    const root = rootRef.current
    if (!root) return
    const ctx = gsap.context(() => {
      if (prefersReducedMotion()) {
        gsap.from('[data-animate], .dock', { opacity: 0, duration: 0.4, clearProps: 'opacity' })
        return
      }
      const tl = gsap.timeline({ defaults: { ease: 'expo.out' } })
      tl.from('.experience-canvas', { opacity: 0, duration: 1.6, ease: 'power2.out' }, 0)
        .from('[data-animate="rise"]', { yPercent: 110, rotate: 2, duration: 1.3, stagger: 0.12 }, 0.35)
        .from('[data-animate="fade"]', { opacity: 0, y: 14, duration: 1, stagger: 0.07, clearProps: 'opacity,transform' }, 0.75)
        .from('.dock', { opacity: 0, y: 40, duration: 1.1, clearProps: 'transform' }, 1.1)
    }, root)
    return () => ctx.revert()
  }, [])

  return (
    <div className="app" ref={rootRef}>
      <div className="stage">{webgl ? <ExperienceCanvas /> : <NoWebGL />}</div>
      <HeroOverlay />
      <FeedbackLayer />
      {webgl && <ControlDock />}
    </div>
  )
}
