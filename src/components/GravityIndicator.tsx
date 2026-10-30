import { useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Quaternion, Vector3, type Group, type Mesh } from 'three'
import { physicsController } from '../lib/physicsController'
import { PALETTE } from '../lib/physicsConfig'

const DOWN = new Vector3(0, -1, 0)
const dir = new Vector3()
const targetQuat = new Quaternion()

/**
 * A tiny instrument: an arrow inside a gimbal that tracks the *live* gravity
 * vector (including mid-transition blends). In zero-G the arrow retracts and a
 * small satellite drifts around the gimbal instead.
 */
function Instrument() {
  const arrow = useRef<Group>(null)
  const gimbal = useRef<Group>(null)
  const satellite = useRef<Mesh>(null)
  const len = useRef(1)

  useFrame((state, dt) => {
    const g = physicsController.gravity
    const magnitude = g.length()
    const t = state.clock.elapsedTime
    if (arrow.current) {
      if (magnitude > 0.05) {
        dir.copy(g).normalize()
        targetQuat.setFromUnitVectors(DOWN, dir)
        arrow.current.quaternion.slerp(targetQuat, Math.min(1, dt * 9))
      }
      // Arrow length scales with |g| (moon is short, zero-G disappears).
      const targetLen = magnitude < 0.05 ? 0.001 : 0.45 + Math.min(1, magnitude / 9.81) * 0.55
      len.current += (targetLen - len.current) * Math.min(1, dt * 8)
      arrow.current.scale.setScalar(len.current)
    }
    if (gimbal.current) {
      gimbal.current.rotation.y = t * 0.6
      gimbal.current.rotation.x = Math.sin(t * 0.7) * 0.25
    }
    if (satellite.current) {
      const zero = 1 - Math.min(1, len.current * 3)
      satellite.current.scale.setScalar(0.001 + zero)
      satellite.current.position.set(Math.cos(t * 1.6) * 0.62, Math.sin(t * 2.3) * 0.3, Math.sin(t * 1.6) * 0.62)
    }
  })

  return (
    <>
      <group ref={gimbal}>
        <mesh>
          <torusGeometry args={[0.82, 0.012, 8, 96]} />
          <meshStandardMaterial color={PALETTE.ink} roughness={0.4} />
        </mesh>
        <mesh rotation-x={Math.PI / 2}>
          <torusGeometry args={[0.82, 0.008, 8, 96]} />
          <meshStandardMaterial color={PALETTE.ink} roughness={0.4} transparent opacity={0.35} />
        </mesh>
      </group>
      <group ref={arrow}>
        <mesh position={[0, -0.18, 0]}>
          <cylinderGeometry args={[0.045, 0.045, 0.62, 24]} />
          <meshStandardMaterial color={PALETTE.ink} roughness={0.3} metalness={0.2} />
        </mesh>
        <mesh position={[0, -0.6, 0]} rotation-x={Math.PI}>
          <coneGeometry args={[0.14, 0.28, 32]} />
          <meshStandardMaterial color={PALETTE.coral} roughness={0.35} />
        </mesh>
        <mesh position={[0, 0.14, 0]}>
          <sphereGeometry args={[0.08, 24, 16]} />
          <meshStandardMaterial color={PALETTE.ink} roughness={0.3} />
        </mesh>
      </group>
      <mesh ref={satellite}>
        <sphereGeometry args={[0.09, 24, 16]} />
        <meshStandardMaterial color={PALETTE.blueDeep} roughness={0.3} />
      </mesh>
    </>
  )
}

export function GravityIndicator() {
  return (
    <div className="gravity-indicator" aria-hidden="true">
      <Canvas
        dpr={[1, 2]}
        camera={{ position: [1.6, 0.9, 2.4], fov: 32 }}
        gl={{ antialias: true, alpha: true, powerPreference: 'low-power' }}
        onCreated={({ camera }) => camera.lookAt(0, -0.05, 0)}
      >
        <ambientLight intensity={1.4} />
        <directionalLight position={[2, 3, 2]} intensity={2.2} />
        <Instrument />
      </Canvas>
    </div>
  )
}
