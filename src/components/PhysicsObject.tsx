import { memo, useEffect, useMemo, useRef, type RefObject } from 'react'
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { Trail } from '@react-three/drei'
import {
  BallCollider,
  CapsuleCollider,
  CoefficientCombineRule,
  CuboidCollider,
  CylinderCollider,
  RigidBody,
  RoundCuboidCollider,
  type CollisionEnterPayload,
  type RapierRigidBody,
} from '@react-three/rapier'
import { Quaternion, Vector3, type BufferGeometry, type Group, type Mesh, type Object3D } from 'three'
import { ACCENT_HEX, OBJECT_SPECS, PHYSICAL_MATERIALS, type BodyDescriptor } from '../lib/physicsConfig'
import { getColliders, getGeometry, getMaterial, type ColliderShape, type Quality } from '../lib/objectFactory'
import { physicsController } from '../lib/physicsController'
import { uiStore } from '../lib/store'
import { prefersReducedMotion } from '../lib/device'

interface PhysicsObjectProps {
  descriptor: BodyDescriptor
  quality: Quality
}

interface ColliderMaterialProps {
  density: number
  friction: number
  restitution: number
  restitutionCombineRule?: CoefficientCombineRule
}

function Collider({ shape, material }: { shape: ColliderShape; material: ColliderMaterialProps }) {
  switch (shape.type) {
    case 'ball':
      return <BallCollider args={[shape.radius]} position={shape.position} {...material} />
    case 'cuboid':
      return <CuboidCollider args={shape.half} {...material} />
    case 'roundCuboid':
      return <RoundCuboidCollider args={[...shape.half, shape.radius]} {...material} />
    case 'capsule':
      return <CapsuleCollider args={[shape.halfHeight, shape.radius]} {...material} />
    case 'cylinder':
      return <CylinderCollider args={[shape.halfHeight, shape.radius]} {...material} />
  }
}

const tmpNormal = new Vector3()
const tmpRel = new Vector3()
const tmpPoint = new Vector3()
const tmpQuat = new Quaternion()
const tmpLocal = new Vector3()

/**
 * One physically simulated object: a Rapier rigid body with hand-authored
 * colliders, a shared procedural mesh, spring-based visual squash (rubber only),
 * and a speed-driven motion trail.
 */
export const PhysicsObject = memo(function PhysicsObject({ descriptor, quality }: PhysicsObjectProps) {
  const { id, kind, tint } = descriptor
  const spec = OBJECT_SPECS[kind]
  const physical = PHYSICAL_MATERIALS[spec.material]
  const isRubber = spec.material === 'rubber'

  const bodyRef = useRef<RapierRigidBody>(null)
  const visualRef = useRef<Group>(null)
  const squashRef = useRef<Group>(null)
  /** drei's Trail forwards its ref to the MeshLine geometry; we locate the owning mesh once. */
  const trailGeometryRef = useRef<BufferGeometry>(null)
  const trailMaterial = useRef<{ opacity: number; transparent: boolean; depthWrite: boolean } | null>(null)
  const scene = useThree((s) => s.scene)

  const geometry = getGeometry(kind)
  const material = getMaterial(kind, quality, tint)
  const colliders = useMemo(() => getColliders(kind), [kind])
  const colliderMaterial = useMemo<ColliderMaterialProps>(
    () => ({
      density: physical.density,
      friction: physical.friction,
      restitution: physical.restitution,
      restitutionCombineRule: physical.bouncy ? CoefficientCombineRule.Max : undefined,
    }),
    [physical],
  )

  /** Squash spring state: displacement along `axis` (0 = rest). */
  const squash = useRef({ x: 0, v: 0, axis: 1 })
  /** Pop-in progress for spawned bodies (1 = fully grown). */
  const appear = useRef(descriptor.spawned ? 0 : 1)
  /** Frames to keep the trail hidden (after mount or a time jump). */
  const trailCooldown = useRef(60)
  const lastTimeMode = useRef(uiStore.get().timeMode)

  useEffect(() => {
    const body = bodyRef.current
    const visual = visualRef.current
    if (!body || !visual) return
    if (descriptor.velocity) {
      const [x, y, z] = descriptor.velocity
      body.setLinvel({ x, y, z }, true)
      body.setAngvel({ x: Math.random() * 2 - 1, y: Math.random() * 2 - 1, z: Math.random() * 2 - 1 }, true)
    }
    const onImpact = isRubber
      ? (strength: number, worldNormal: Vector3) => {
          // Express the contact normal in the body's local frame and squash along its dominant axis.
          const r = body.rotation()
          tmpQuat.set(r.x, r.y, r.z, r.w).invert()
          tmpLocal.copy(worldNormal).applyQuaternion(tmpQuat)
          const ax = Math.abs(tmpLocal.x)
          const ay = Math.abs(tmpLocal.y)
          const az = Math.abs(tmpLocal.z)
          const s = squash.current
          s.axis = ax > ay && ax > az ? 0 : ay > az ? 1 : 2
          const amount = Math.min(prefersReducedMotion() ? 0.08 : 0.3, strength * 0.034)
          s.x = Math.max(s.x, amount)
          s.v = 0
        }
      : undefined
    const entry = physicsController.createEntry(id, kind, body, visual, onImpact)
    physicsController.register(entry)
    return () => physicsController.unregister(id, body)
    // The body is created once per mount; descriptor fields are immutable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const onCollisionEnter = (payload: CollisionEnterPayload) => {
    const entry = physicsController.bodies.get(id)
    if (!entry) return
    const n = payload.manifold.normal()
    tmpNormal.set(n.x, n.y, n.z)
    if (tmpNormal.lengthSq() < 1e-6) return
    tmpNormal.normalize()
    const otherId = (payload.other.rigidBody?.userData as { bodyId?: number } | undefined)?.bodyId
    const other = otherId !== undefined ? physicsController.bodies.get(otherId) : undefined
    tmpRel.copy(entry.preVel)
    if (other) tmpRel.sub(other.preVel)
    const strength = Math.abs(tmpRel.dot(tmpNormal))
    if (strength < 0.4) return
    entry.onImpact?.(strength, tmpNormal)
    if (payload.manifold.numSolverContacts() > 0) {
      const p = payload.manifold.solverContactPoint(0)
      tmpPoint.set(p.x, p.y, p.z)
    } else {
      const t = entry.body.translation()
      tmpPoint.set(t.x, t.y, t.z)
    }
    // Both bodies receive the event; only one of the pair makes a sound.
    const audible = !other || id > other.id
    physicsController.emitImpact(spec.material, strength, tmpPoint, tmpNormal, audible)
  }

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 1 / 30)

    // Squash & stretch: a damped spring, volume-preserving.
    const g = squashRef.current
    const s = squash.current
    if (g && (s.x !== 0 || s.v !== 0)) {
      s.v += (-280 * s.x - 13 * s.v) * dt
      s.x += s.v * dt
      if (Math.abs(s.x) < 1e-4 && Math.abs(s.v) < 1e-3) {
        s.x = 0
        s.v = 0
      }
      const along = 1 - s.x
      const across = 1 / Math.sqrt(Math.max(0.2, along))
      g.scale.set(s.axis === 0 ? along : across, s.axis === 1 ? along : across, s.axis === 2 ? along : across)
    }

    // Pop-in for freshly spawned bodies.
    if (appear.current < 1 && visualRef.current) {
      appear.current = Math.min(1, appear.current + dt * 3.2)
      const t = appear.current
      const eased = 1 + 2.2 * Math.pow(t - 1, 3) + 1.2 * Math.pow(t - 1, 2)
      visualRef.current.scale.setScalar(Math.max(0.001, eased))
    }

    // Trail opacity follows speed; hidden while time is frozen or right after a jump.
    const body = bodyRef.current
    if (!trailMaterial.current && trailGeometryRef.current) {
      const geometry = trailGeometryRef.current
      scene.traverse((o) => {
        if ((o as Mesh).geometry === geometry) {
          const m = (o as Mesh).material as unknown as { opacity: number; transparent: boolean; depthWrite: boolean }
          m.transparent = true
          m.depthWrite = false
          m.opacity = 0
          trailMaterial.current = m
        }
      })
    }
    const mat = trailMaterial.current
    if (!mat || !body) return
    const mode = uiStore.get().timeMode
    if (mode !== lastTimeMode.current) {
      lastTimeMode.current = mode
      trailCooldown.current = 40
    }
    if (trailCooldown.current > 0 || mode !== 'live' || !visualRef.current?.visible) {
      if (mode === 'live') trailCooldown.current--
      mat.opacity = 0
      return
    }
    const v = body.linvel()
    const speed = Math.hypot(v.x, v.y, v.z)
    const target = Math.min(1, Math.max(0, (speed - 3.5) / 7)) * 0.5
    mat.opacity += (target - mat.opacity) * 0.25
  })

  const onPointerDown = (e: ThreeEvent<PointerEvent>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    e.stopPropagation()
    const forward = e.camera.getWorldDirection(new Vector3())
    if (physicsController.startDrag(id, e.point.clone(), forward)) {
      document.body.dataset.cursor = 'grabbing'
    }
  }

  const onPointerOver = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    if (!uiStore.get().dragging) document.body.dataset.cursor = 'grab'
  }

  const onPointerOut = () => {
    if (!uiStore.get().dragging) delete document.body.dataset.cursor
  }

  return (
    <>
      <RigidBody
        ref={bodyRef}
        colliders={false}
        position={descriptor.position}
        rotation={descriptor.rotation}
        linearDamping={physical.linearDamping}
        angularDamping={physical.angularDamping}
        ccd
        canSleep
        userData={{ bodyId: id }}
        onCollisionEnter={onCollisionEnter}
      >
        {colliders.map((shape, i) => (
          <Collider key={i} shape={shape} material={colliderMaterial} />
        ))}
        <group ref={visualRef}>
          <group ref={squashRef}>
            <mesh
              geometry={geometry}
              material={material}
              castShadow
              receiveShadow
              onPointerDown={onPointerDown}
              onPointerOver={onPointerOver}
              onPointerOut={onPointerOut}
            />
          </group>
        </group>
      </RigidBody>
      <Trail
        ref={trailGeometryRef as never}
        target={visualRef as unknown as RefObject<Object3D>}
        width={spec.radius * 5}
        length={3}
        decay={1}
        color={ACCENT_HEX[spec.kind === 'block' && tint ? tint : spec.trail]}
        attenuation={(t) => t * t}
      />
    </>
  )
})
