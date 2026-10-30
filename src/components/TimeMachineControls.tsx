import type { CSSProperties, KeyboardEvent } from 'react'
import { Pause, Play, Rewind, Snail, StepForward } from 'lucide-react'
import { HISTORY_SECONDS, TIMESTEP } from '../lib/physicsConfig'
import { physicsController } from '../lib/physicsController'
import { uiStore, useUI } from '../lib/store'
import { IconButton, ModuleLabel } from './ui'

/**
 * Pause / slow-motion / rewind, plus the timeline scrubber.
 * Scrubbing freezes the simulation and displays recorded snapshots; "Resume"
 * restores the displayed snapshot's transforms *and velocities* and continues.
 */
export function TimeMachineControls() {
  const paused = useUI((s) => s.paused)
  const slowMo = useUI((s) => s.slowMo)
  const timeMode = useUI((s) => s.timeMode)
  const available = useUI((s) => s.historyAvailable)
  const offset = useUI((s) => s.scrubOffset)

  const live = timeMode === 'live'
  const max = Math.max(available, 0.01)
  const value = live ? max : Math.max(0, max - offset)
  const fill = (value / max) * 100
  const canRewind = available > 0.1

  const startRewind = () => canRewind && physicsController.startRewind()
  const stopRewind = () => physicsController.stopRewind()

  const onRewindKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key !== 'Enter' && e.key !== ' ') return
    e.preventDefault()
    if (e.type === 'keydown' && !e.repeat) startRewind()
    if (e.type === 'keyup') stopRewind()
  }

  return (
    <div className={`module module--time ${!live ? 'is-scrubbing' : ''}`} role="group" aria-label="Time machine">
      <div className="module__head">
        <ModuleLabel index="02">Time machine</ModuleLabel>
        <span className="readout" aria-live="polite">
          {live ? `${available.toFixed(1)}s / ${HISTORY_SECONDS}s buffer` : `−${offset.toFixed(2)}s`}
        </span>
      </div>
      <div className="time-row">
        <IconButton
          label={live ? (paused ? 'Play (Space)' : 'Pause (Space)') : 'Resume from here (Enter)'}
          onClick={() => (live ? uiStore.set({ paused: !paused, hasInteracted: true }) : physicsController.resume())}
          active={paused && live}
        >
          {live && !paused ? <Pause size={16} strokeWidth={1.75} /> : <Play size={16} strokeWidth={1.75} />}
        </IconButton>
        <IconButton
          label={`Slow motion ×0.3 (${slowMo ? 'on' : 'off'})`}
          active={slowMo}
          disabled={!live}
          onClick={() => uiStore.set({ slowMo: !slowMo, hasInteracted: true })}
        >
          <Snail size={16} strokeWidth={1.75} />
        </IconButton>
        <IconButton
          label="Hold to rewind (R)"
          active={timeMode === 'rewind'}
          disabled={!canRewind}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId)
            startRewind()
          }}
          onPointerUp={stopRewind}
          onPointerCancel={stopRewind}
          onKeyDown={onRewindKey}
          onKeyUp={onRewindKey}
        >
          <Rewind size={16} strokeWidth={1.75} />
        </IconButton>

        <div className="timeline" style={{ '--progress': `${fill}%` } as CSSProperties}>
          <input
            type="range"
            className="timeline__input"
            min={0}
            max={max}
            step={TIMESTEP}
            value={value}
            disabled={!canRewind}
            aria-label="Timeline: drag left to travel back in time"
            aria-valuetext={live ? 'Now' : `${offset.toFixed(2)} seconds ago`}
            onChange={(e) => physicsController.scrubTo(max - Number(e.target.value))}
          />
          <div className="timeline__ticks" aria-hidden="true">
            {Array.from({ length: 9 }, (_, i) => (
              <span key={i} />
            ))}
          </div>
        </div>

        <button
          type="button"
          className={`resume-btn ${!live ? 'is-visible' : ''}`}
          onClick={() => physicsController.resume()}
          tabIndex={live ? -1 : 0}
          aria-hidden={live}
        >
          <StepForward size={14} strokeWidth={2} aria-hidden="true" />
          Resume
        </button>
      </div>
    </div>
  )
}
