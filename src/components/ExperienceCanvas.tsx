import { Suspense, useEffect, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { Environment, Lightformer, PerformanceMonitor } from '@react-three/drei'
import { NeutralToneMapping } from 'three'
import { PALETTE } from '../lib/physicsConfig'
import { uiStore, useUI } from '../lib/store'
import { maxDpr } from '../lib/device'
import { disposeFactory } from '../lib/objectFactory'
import { PhysicsWorld } from './PhysicsWorld'
import { CameraRig } from './CameraRig'

/**
 * Procedural studio environment: soft overhead box, side strips, and faint
 * pastel bounce cards so chrome and glass pick up the accent palette. Rendered
 * once into a cube map — no HDR files are downloaded.
 */
function StudioEnvironment() {
  return (
    <Environment resolution={256} frames={1} environmentIntensity={0.95}>
      <color attach="background" args={['#cfccc6']} />
      <Lightformer form="rect" intensity={3.2} position={[0, 7, 0]} rotation-x={Math.PI / 2} scale={[12, 8, 1]} />
      <Lightformer form="rect" intensity={2.4} position={[-7, 3, 2]} rotation-y={Math.PI / 2} scale={[10, 3, 1]} />
      <Lightformer form="rect" intensity={1.6} position={[7, 2.5, 0]} rotation-y={-Math.PI / 2} scale={[8, 1.4, 1]} color={PALETTE.coral} />
      <Lightformer form="rect" intensity={1.3} position={[0, 2, -8]} scale={[12, 1.2, 1]} color={PALETTE.blue} />
      <Lightformer form="ring" intensity={1.4} position={[3, 4, 8]} scale={2.5} color={PALETTE.violet} />
      <Lightformer form="rect" intensity={2} position={[0, 1.5, 9]} rotation-y={Math.PI} scale={[14, 2.5, 1]} />
      {/* Dark ground plane gives chrome a grounded horizon line */}
      <mesh position={[0, -3, 0]} rotation-x={-Math.PI / 2} scale={40}>
        <planeGeometry />
        <meshBasicMaterial color="#6d6862" />
      </mesh>
    </Environment>
  )
}

function Lights() {
  const quality = useUI((s) => s.quality)
  const mapSize = quality === 'high' ? 2048 : 1024
  return (
    <>
      <hemisphereLight args={['#ffffff', '#e8dfd6', 0.55]} />
      <directionalLight
        position={[-5.5, 12, 7]}
        intensity={2.1}
        castShadow
        shadow-mapSize={[mapSize, mapSize]}
        shadow-camera-left={-10}
        shadow-camera-right={10}
        shadow-camera-top={10}
        shadow-camera-bottom={-10}
        shadow-camera-near={1}
        shadow-camera-far={34}
        shadow-bias={-0.0004}
        shadow-normalBias={0.025}
        shadow-radius={7}
      />
      <directionalLight position={[8, 5, -4]} intensity={0.55} color="#fff1e6" />
    </>
  )
}

export function ExperienceCanvas() {
  const quality = useUI((s) => s.quality)
  const [dpr, setDpr] = useState(() => maxDpr(quality))

  useEffect(() => () => disposeFactory(), [])

  return (
    <Canvas
      className="experience-canvas"
      shadows="percentage"
      dpr={dpr}
      camera={{ fov: 30, near: 0.1, far: 120, position: [0, 6, 30] }}
      gl={{ antialias: true, powerPreference: 'high-performance', toneMapping: NeutralToneMapping, toneMappingExposure: 1.02 }}
      onCreated={(state) => {
        state.gl.transmissionResolutionScale = quality === 'high' ? 1 : 0.5
        if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__r3f = state
      }}
    >
      <color attach="background" args={[PALETTE.background]} />
      <PerformanceMonitor
        onDecline={() => {
          setDpr((d) => Math.max(1, d - 0.5))
          if (uiStore.get().quality === 'high') uiStore.set({ quality: 'low' })
        }}
        flipflops={2}
      />
      <Lights />
      <StudioEnvironment />
      <CameraRig />
      <Suspense fallback={null}>
        <PhysicsWorld />
      </Suspense>
    </Canvas>
  )
}
