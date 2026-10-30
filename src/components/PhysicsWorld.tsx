import { Physics } from '@react-three/rapier'
import { useUI } from '../lib/store'
import { TIMESTEP } from '../lib/physicsConfig'
import { usePhysicsHistory } from '../hooks/usePhysicsHistory'
import { useObjectDrag } from '../hooks/useObjectDrag'
import { useMagneticField } from '../hooks/useMagneticField'
import { PhysicsObject } from './PhysicsObject'
import { LabRoom } from './LabRoom'
import { MagnetField } from './MagnetField'
import { ImpactEffects } from './ImpactEffects'

/** Mounts the hooks that need to live inside the Rapier context. */
function SimulationDriver() {
  usePhysicsHistory()
  useObjectDrag()
  useMagneticField()
  return null
}

function Bodies() {
  const bodies = useUI((s) => s.bodies)
  const resetKey = useUI((s) => s.resetKey)
  const quality = useUI((s) => s.quality)
  return (
    <group key={resetKey}>
      {bodies.map((b) => (
        <PhysicsObject key={b.id} descriptor={b} quality={quality} />
      ))}
    </group>
  )
}

/**
 * The Rapier world. It is mounted `paused`: the SimulationDriver advances time
 * itself with a fixed timestep so pause, slow motion and rewind stay exact.
 */
export function PhysicsWorld() {
  const room = useUI((s) => s.room)
  return (
    <Physics paused interpolate={false} timeStep={TIMESTEP} gravity={[0, -9.81, 0]} numSolverIterations={6}>
      <SimulationDriver />
      <LabRoom room={room} />
      <Bodies />
      <MagnetField />
      <ImpactEffects />
    </Physics>
  )
}
