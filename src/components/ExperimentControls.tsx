import { useRef } from 'react'
import gsap from 'gsap'
import { Magnet, Minus, Plus, RotateCcw, Volume2, VolumeX, Zap } from 'lucide-react'
import { collisionAudio } from '../lib/audio'
import { physicsController } from '../lib/physicsController'
import { effectivePolarity, uiStore, useUI } from '../lib/store'
import { prefersReducedMotion } from '../lib/device'
import { SpawnControls } from './SpawnControls'
import { IconButton, ModuleLabel } from './ui'

export function triggerChaos(origin?: HTMLElement | null) {
  physicsController.chaos()
  if (prefersReducedMotion()) return
  // A brief ripple leaving the button, plus a tiny jolt of the dock.
  const rect = origin?.getBoundingClientRect()
  const ripple = document.createElement('span')
  ripple.className = 'chaos-ripple'
  ripple.style.left = `${rect ? rect.left + rect.width / 2 : window.innerWidth / 2}px`
  ripple.style.top = `${rect ? rect.top + rect.height / 2 : window.innerHeight / 2}px`
  document.body.appendChild(ripple)
  gsap.fromTo(
    ripple,
    { scale: 0, opacity: 0.55 },
    { scale: 1, opacity: 0, duration: 0.9, ease: 'expo.out', onComplete: () => ripple.remove() },
  )
  gsap.fromTo('.dock', { y: 0 }, { y: -4, duration: 0.07, yoyo: true, repeat: 3, ease: 'power1.inOut', clearProps: 'transform' })
}

export function ExperimentControls() {
  const magnet = useUI((s) => s.magnet)
  const polarity = useUI((s) => effectivePolarity(s))
  const sound = useUI((s) => s.sound)
  const live = useUI((s) => s.timeMode === 'live')
  const chaosRef = useRef<HTMLButtonElement>(null)
  const resetRef = useRef<HTMLButtonElement>(null)

  return (
    <div className="module module--tools" role="group" aria-label="Experiment tools">
      <div className="module__head">
        <ModuleLabel index="03">Experiment</ModuleLabel>
        <span className="readout">{magnet ? (polarity === 'attract' ? 'field: attract' : 'field: repel') : 'field: off'}</span>
      </div>
      <div className="tools-row">
        <SpawnControls />
        <div className="magnet-group">
          <IconButton
            label={magnet ? 'Magnet on (M)' : 'Magnet off (M)'}
            active={magnet}
            onClick={() => uiStore.set({ magnet: !magnet, hasInteracted: true })}
          >
            <Magnet size={16} strokeWidth={1.75} />
          </IconButton>
          <IconButton
            label={polarity === 'attract' ? 'Polarity: attract (hold Shift to flip)' : 'Polarity: repel'}
            className={`polarity ${magnet ? 'is-shown' : ''} ${polarity === 'repel' ? 'is-repel' : ''}`}
            disabled={!magnet}
            tabIndex={magnet ? 0 : -1}
            onClick={() => uiStore.set((s) => ({ polarity: s.polarity === 'attract' ? 'repel' : 'attract' }))}
          >
            {polarity === 'attract' ? <Plus size={14} strokeWidth={2.25} /> : <Minus size={14} strokeWidth={2.25} />}
          </IconButton>
        </div>
        <button
          ref={chaosRef}
          type="button"
          className="chaos-btn"
          disabled={!live}
          onClick={() => triggerChaos(chaosRef.current)}
          aria-label="Chaos: scatter every object (C)"
          title="Scatter every object (C)"
        >
          <Zap size={15} strokeWidth={2} aria-hidden="true" />
          <span>CHAOS</span>
        </button>
        <IconButton
          ref={resetRef}
          label="Reset experiment (X)"
          onClick={() => {
            physicsController.reset()
            if (!prefersReducedMotion()) gsap.fromTo(resetRef.current, { rotate: 0 }, { rotate: -360, duration: 0.7, ease: 'power3.out' })
          }}
        >
          <RotateCcw size={16} strokeWidth={1.75} />
        </IconButton>
        <IconButton
          label={sound ? 'Sound on' : 'Sound off'}
          active={sound}
          onClick={() => {
            const next = !sound
            collisionAudio.setEnabled(next)
            uiStore.set({ sound: next })
          }}
        >
          {sound ? <Volume2 size={16} strokeWidth={1.75} /> : <VolumeX size={16} strokeWidth={1.75} />}
        </IconButton>
      </div>
    </div>
  )
}
