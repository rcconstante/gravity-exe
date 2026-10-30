import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  type Group,
  type LineSegments,
  type Mesh,
  type Points,
  type Sprite,
  Vector3,
} from 'three'
import { createRadialTexture } from '../lib/objectFactory'
import { MAX_BODIES, PALETTE } from '../lib/physicsConfig'
import { physicsController } from '../lib/physicsController'
import { effectivePolarity, uiStore } from '../lib/store'

const PARTICLES = 150
const CURVE_SEGMENTS = 18

const ATTRACT = new Color(PALETTE.coral)
const REPEL = new Color(PALETTE.blueDeep)

const tmp = new Vector3()
const right = new Vector3()
const up = new Vector3()
const ctrl = new Vector3()
const a = new Vector3()
const p = new Vector3()

/**
 * Visualises the magnet: a glowing probe, a spiral of field particles that flow
 * inward (attract) or outward (repel), and curved field lines to every metal
 * object currently under its influence.
 */
export function MagnetField() {
  const camera = useThree((s) => s.camera)
  const group = useRef<Group>(null)
  const core = useRef<Mesh>(null)
  const ring = useRef<Mesh>(null)
  const halo = useRef<Sprite>(null)
  const points = useRef<Points>(null)
  const lines = useRef<LineSegments>(null)
  const color = useRef(new Color(PALETTE.coral))

  const haloTexture = useMemo(() => createRadialTexture('rgba(255,140,110,0.85)', 'rgba(255,140,110,0)'), [])

  const particleState = useMemo(() => {
    const seeds = new Float32Array(PARTICLES * 3) // angle, radius progress, depth jitter
    for (let i = 0; i < PARTICLES; i++) {
      seeds[i * 3] = Math.random() * Math.PI * 2
      seeds[i * 3 + 1] = Math.random()
      seeds[i * 3 + 2] = (Math.random() - 0.5) * 0.6
    }
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(PARTICLES * 3), 3))
    geometry.setAttribute('color', new BufferAttribute(new Float32Array(PARTICLES * 4), 4))
    return { seeds, geometry }
  }, [])

  const lineGeometry = useMemo(() => {
    const count = MAX_BODIES * CURVE_SEGMENTS * 2
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(count * 3), 3))
    geometry.setAttribute('color', new BufferAttribute(new Float32Array(count * 4), 4))
    geometry.setDrawRange(0, 0)
    return geometry
  }, [])

  useEffect(
    () => () => {
      haloTexture.dispose()
      particleState.geometry.dispose()
      lineGeometry.dispose()
    },
    [haloTexture, particleState, lineGeometry],
  )

  useFrame((state, dt) => {
    const magnet = physicsController.magnet
    const level = magnet.level
    const g = group.current
    if (!g) return
    g.visible = level > 0.01
    if (!g.visible) return

    const ui = uiStore.get()
    const repel = effectivePolarity(ui) === 'repel'
    color.current.lerp(repel ? REPEL : ATTRACT, Math.min(1, dt * 10))
    const c = color.current
    const t = state.clock.elapsedTime

    // Probe
    g.position.copy(magnet.point)
    const pulse = 1 + Math.sin(t * 6) * 0.08
    core.current?.scale.setScalar(level * pulse)
    ;(core.current?.material as { color?: Color } | undefined)?.color?.copy(c)
    if (halo.current) {
      halo.current.scale.setScalar(1.8 * level * (repel ? 1.15 : 1) * pulse)
      halo.current.material.color.copy(c)
      halo.current.material.opacity = 0.55 * level
    }
    if (ring.current) {
      ring.current.quaternion.copy(camera.quaternion)
      ring.current.rotateZ(t * (repel ? -1.4 : 1.4))
      ring.current.scale.setScalar(level * (0.42 + Math.sin(t * 3) * 0.03))
      ;(ring.current.material as unknown as { color: Color }).color.copy(c)
    }

    // Field particles on camera-facing spirals around the probe.
    right.set(1, 0, 0).applyQuaternion(camera.quaternion)
    up.set(0, 1, 0).applyQuaternion(camera.quaternion)
    const fwd = tmp.set(0, 0, 1).applyQuaternion(camera.quaternion)
    const pos = particleState.geometry.attributes.position as BufferAttribute
    const col = particleState.geometry.attributes.color as BufferAttribute
    const seeds = particleState.seeds
    const speed = dt * 0.55
    for (let i = 0; i < PARTICLES; i++) {
      let prog = seeds[i * 3 + 1] + (repel ? speed : -speed)
      if (prog < 0) prog += 1
      if (prog > 1) prog -= 1
      seeds[i * 3 + 1] = prog
      const radius = 0.22 + prog * 2.6
      // Angle twists with radius → curved, galaxy-like field lines.
      const angle = seeds[i * 3] + (repel ? -1 : 1) * (1 - prog) * 2.4
      const x = Math.cos(angle) * radius
      const y = Math.sin(angle) * radius
      const z = seeds[i * 3 + 2] * radius * 0.4
      pos.setXYZ(i, right.x * x + up.x * y + fwd.x * z, right.y * x + up.y * y + fwd.y * z, right.z * x + up.z * y + fwd.z * z)
      const fade = Math.sin(prog * Math.PI) * level * 0.9
      col.setXYZW(i, c.r, c.g, c.b, fade)
    }
    pos.needsUpdate = true
    col.needsUpdate = true

    // Curved field lines to influenced metal objects.
    const lpos = lineGeometry.attributes.position as BufferAttribute
    const lcol = lineGeometry.attributes.color as BufferAttribute
    let v = 0
    physicsController.bodies.forEach((e) => {
      if (!e.magnetic || e.magnetInfluence < 0.04 || !e.visual.visible) return
      if (v + CURVE_SEGMENTS * 2 > lpos.count) return
      const bt = e.body.translation()
      a.set(bt.x, bt.y, bt.z).sub(magnet.point) // local to the group
      // Bow the curve sideways relative to the camera for an elegant arc.
      ctrl.copy(a).multiplyScalar(0.5).addScaledVector(up, a.length() * 0.22).addScaledVector(right, a.length() * 0.12)
      const alpha = Math.min(1, e.magnetInfluence * 1.6) * level * 0.75
      for (let s = 0; s < CURVE_SEGMENTS; s++) {
        for (const k of [s, s + 1]) {
          const u = k / CURVE_SEGMENTS
          const inv = 1 - u
          // Quadratic bezier: origin(0) → ctrl → a
          p.set(0, 0, 0).multiplyScalar(inv * inv).addScaledVector(ctrl, 2 * inv * u).addScaledVector(a, u * u)
          lpos.setXYZ(v, p.x, p.y, p.z)
          // Dashed shimmer travelling along the line.
          const dash = 0.55 + 0.45 * Math.sin(u * 22 + t * (repel ? 9 : -9))
          lcol.setXYZW(v, c.r, c.g, c.b, alpha * dash * Math.sin(u * Math.PI * 0.9 + 0.15))
          v++
        }
      }
    })
    lineGeometry.setDrawRange(0, v)
    lpos.needsUpdate = true
    lcol.needsUpdate = true
  })

  return (
    <group ref={group} visible={false}>
      <sprite ref={halo} renderOrder={5}>
        <spriteMaterial map={haloTexture} transparent depthWrite={false} depthTest={false} />
      </sprite>
      <mesh ref={core} renderOrder={6}>
        <sphereGeometry args={[0.09, 24, 16]} />
        <meshBasicMaterial color={PALETTE.coral} toneMapped={false} />
      </mesh>
      <mesh ref={ring} renderOrder={6}>
        <ringGeometry args={[0.92, 1, 64, 1, 0, Math.PI * 1.6]} />
        <meshBasicMaterial color={PALETTE.coral} transparent opacity={0.85} depthTest={false} toneMapped={false} />
      </mesh>
      <points ref={points} geometry={particleState.geometry} renderOrder={4} frustumCulled={false}>
        <pointsMaterial size={0.045} vertexColors transparent depthWrite={false} sizeAttenuation toneMapped={false} />
      </points>
      <lineSegments ref={lines} geometry={lineGeometry} renderOrder={4} frustumCulled={false}>
        <lineBasicMaterial vertexColors transparent depthWrite={false} toneMapped={false} />
      </lineSegments>
      {/* Faint additive bloom kept tiny: on a light background, normal blending carries the colour */}
      <mesh scale={0.16} renderOrder={6}>
        <sphereGeometry args={[1, 16, 12]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.6} blending={AdditiveBlending} depthWrite={false} />
      </mesh>
    </group>
  )
}
