import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useAfterPhysicsStep, useBeforePhysicsStep, useRapier } from '@react-three/rapier'
import { physicsController, type WorldLike } from '../lib/physicsController'
import { SLOW_MO_SCALE } from '../lib/physicsConfig'
import { uiStore } from '../lib/store'

/**
 * Owns the simulation clock and the time machine.
 *
 * The <Physics> component is mounted with `paused` so that *we* decide when time
 * advances. Each frame we either:
 *   - advance the fixed-timestep accumulator by `dt × timeScale` (live), or
 *   - play the history ring buffer backwards (rewind), or
 *   - stay frozen (paused / scrubbing) and only re-sync meshes.
 *
 * After every fixed step, every body's position, rotation and velocities are
 * recorded into the ring buffer.
 */
export function usePhysicsHistory() {
  const { step, world } = useRapier()
  const lastUiSync = useRef(0)

  // Let the controller re-sync meshes after it teleports bodies (scrubbing).
  physicsController.syncMeshes = () => step(0)

  useBeforePhysicsStep((w) => physicsController.beforeStep(w as unknown as WorldLike))
  useAfterPhysicsStep(() => physicsController.afterStep())

  useFrame((state, rawDt) => {
    // Clamp long frames (tab switches) so we never simulate a huge catch-up burst.
    const dt = Math.min(rawDt, 1 / 20)
    const ui = uiStore.get()

    if (ui.timeMode === 'rewind') physicsController.advanceRewind(dt)

    if (ui.timeMode === 'live' && !ui.paused) {
      step(dt * (ui.slowMo ? SLOW_MO_SCALE : 1))
    } else {
      // Keep the gravity vector applied even while frozen, then just re-sync meshes.
      step(0)
    }

    // Publish history length to the UI a few times per second (not every frame).
    const now = state.clock.elapsedTime
    if (ui.timeMode === 'live' && now - lastUiSync.current > 0.2) {
      lastUiSync.current = now
      const seconds = Math.round(physicsController.historySeconds * 10) / 10
      uiStore.set({ historyAvailable: seconds })
    }
  }, -1)

  return world
}
