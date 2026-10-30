import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { MeshBasicMaterial, RingGeometry, Vector3, type Group, type Mesh } from 'three'
import { PALETTE } from '../lib/physicsConfig'
import { physicsController } from '../lib/physicsController'
import { uiStore } from '../lib/store'
import { prefersReducedMotion } from '../lib/device'

const POOL = 12

interface Ripple {
  age: number
  life: number
  size: number
}

const lookTarget = new Vector3()

/**
 * Collision feedback: thin ink ripples that bloom at strong contact points,
 * plus a floor shockwave whenever CHAOS fires. Meshes are pooled.
 */
export function ImpactEffects() {
  const group = useRef<Group>(null)
  const shock = useRef<Mesh>(null)
  const shockAge = useRef(Infinity)
  const ripples = useRef<Ripple[]>(Array.from({ length: POOL }, () => ({ age: Infinity, life: 0.6, size: 1 })))
  const cursor = useRef(0)

  const geometry = useMemo(() => new RingGeometry(0.94, 1, 64), [])
  const materials = useMemo(
    () =>
      Array.from(
        { length: POOL },
        () => new MeshBasicMaterial({ color: PALETTE.ink, transparent: true, opacity: 0, depthWrite: false }),
      ),
    [],
  )
  const shockMaterial = useMemo(
    () => new MeshBasicMaterial({ color: PALETTE.coral, transparent: true, opacity: 0, depthWrite: false }),
    [],
  )

  useEffect(() => {
    let last = uiStore.get().chaosTick
    return uiStore.subscribe(() => {
      const tick = uiStore.get().chaosTick
      if (tick !== last) {
        last = tick
        shockAge.current = 0
      }
    })
  }, [])

  useEffect(
    () => () => {
      geometry.dispose()
      materials.forEach((m) => m.dispose())
      shockMaterial.dispose()
    },
    [geometry, materials, shockMaterial],
  )

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 1 / 30)
    const g = group.current
    if (!g) return
    const reduced = prefersReducedMotion()

    // Consume queued impacts.
    while (physicsController.impacts.length) {
      const impact = physicsController.impacts.shift()!
      if (reduced) continue
      const i = cursor.current
      cursor.current = (cursor.current + 1) % POOL
      const mesh = g.children[i] as Mesh
      mesh.position.copy(impact.point).addScaledVector(impact.normal, 0.02)
      lookTarget.copy(mesh.position).add(impact.normal)
      mesh.lookAt(lookTarget)
      const r = ripples.current[i]
      r.age = 0
      r.size = Math.min(1.4, 0.25 + impact.strength * 0.07)
      r.life = 0.55
    }

    ripples.current.forEach((r, i) => {
      const mesh = g.children[i] as Mesh
      const mat = materials[i]
      if (r.age >= r.life) {
        mesh.visible = false
        return
      }
      r.age += dt
      const t = Math.min(1, r.age / r.life)
      const eased = 1 - Math.pow(1 - t, 3)
      mesh.visible = true
      mesh.scale.setScalar(0.05 + eased * r.size)
      mat.opacity = (1 - t) * 0.45
    })

    // Chaos shockwave on the floor.
    const s = shock.current
    if (s) {
      if (shockAge.current < 0.9) {
        shockAge.current += dt
        const t = Math.min(1, shockAge.current / 0.9)
        s.visible = true
        s.scale.setScalar(0.3 + (1 - Math.pow(1 - t, 3)) * 9)
        shockMaterial.opacity = (1 - t) * 0.55
      } else {
        s.visible = false
      }
    }
  })

  return (
    <>
      <group ref={group}>
        {materials.map((m, i) => (
          <mesh key={i} geometry={geometry} material={m} visible={false} renderOrder={3} />
        ))}
      </group>
      <mesh ref={shock} geometry={geometry} material={shockMaterial} rotation-x={-Math.PI / 2} position={[0, 0.01, 0]} visible={false} />
    </>
  )
}
