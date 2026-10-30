import gsap from 'gsap'
import { Plane, Quaternion, Vector3, type Object3D } from 'three'
import type { RapierRigidBody } from '@react-three/rapier'
import { collisionAudio } from './audio'
import { PhysicsHistory, createSnapshot, type BodyStateSource } from './physicsHistory'
import {
  BLOCK_COLORS,
  GRAVITY_ORDER,
  GRAVITY_PRESETS,
  GRAVITY_TRANSITION,
  HISTORY_FRAMES,
  MAGNET,
  MAX_BODIES,
  MAX_THROW_SPEED,
  OBJECT_SPECS,
  PHYSICAL_MATERIALS,
  SPAWNABLE,
  TIMESTEP,
  createInitialComposition,
  type BodyDescriptor,
  type GravityMode,
  type MaterialClass,
  type ObjectKind,
  type Vec3,
} from './physicsConfig'
import { effectivePolarity, uiStore } from './store'

/**
 * The imperative heart of the experience.
 *
 * React components *register* their rigid bodies here; everything that runs at
 * simulation rate (dragging, magnetism, gravity blending, history recording,
 * rewind playback) operates on this registry directly, without touching React state.
 */

export interface BodyEntry extends BodyStateSource {
  id: number
  kind: ObjectKind
  material: MaterialClass
  magnetic: boolean
  radius: number
  body: RapierRigidBody
  /** The visual group inside the rigid body (hidden when rewound out of existence). */
  visual: Object3D
  /** Linear velocity captured right before the current step (impact strength). */
  preVel: Vector3
  /** 0..1, how strongly the magnet is pulling this body (for visuals). */
  magnetInfluence: number
  /** Visual squash callback (rubber). */
  onImpact?: (strength: number, worldNormal: Vector3) => void
}

export interface ImpactEvent {
  point: Vector3
  normal: Vector3
  strength: number
}

interface DragSample {
  t: number
  p: Vector3
}

interface DragState {
  id: number
  offset: Vector3
  target: Vector3
  plane: Plane
  samples: DragSample[]
}

/** Minimal surface of the Rapier world we need (keeps us decoupled from the wasm types). */
export interface WorldLike {
  gravity: { x: number; y: number; z: number }
}

const tmpV = new Vector3()
const tmpV2 = new Vector3()
const tmpQ = new Quaternion()
const snapshot = createSnapshot()

function randomUnit(out: Vector3) {
  const u = Math.random() * 2 - 1
  const theta = Math.random() * Math.PI * 2
  const s = Math.sqrt(1 - u * u)
  return out.set(s * Math.cos(theta), u, s * Math.sin(theta))
}

class PhysicsController {
  readonly bodies = new Map<number, BodyEntry>()
  readonly history = new PhysicsHistory(HISTORY_FRAMES, MAX_BODIES)
  /** Number of fixed steps simulated since the last reset. */
  frame = 0
  /** Current (possibly mid-transition) gravity vector. */
  readonly gravity = new Vector3(0, -9.81, 0)
  private appliedGravity = new Vector3(Infinity, 0, 0)
  private gravityTween: gsap.core.Tween | null = null

  /** Re-syncs meshes with bodies without advancing time (provided by the physics world). */
  syncMeshes: (() => void) | null = null

  drag: DragState | null = null
  readonly magnet = {
    /** Pointer is over the scene (or a finger is down) so the field is live. */
    active: false,
    point: new Vector3(0, 3, 0),
    /** Smoothed 0..1 visual intensity. */
    level: 0,
  }

  /** Logical history index currently displayed while scrubbing. */
  scrubIndex = -1
  private nextId = 1000
  readonly impacts: ImpactEvent[] = []

  /* -------------------------------------------------------------- */
  /* Registry                                                        */
  /* -------------------------------------------------------------- */

  register(entry: BodyEntry) {
    this.bodies.set(entry.id, entry)
  }

  unregister(id: number, body: RapierRigidBody) {
    const entry = this.bodies.get(id)
    // Guard against a remount having already registered a fresh body under this id.
    if (entry && entry.body === body) this.bodies.delete(id)
    if (this.drag?.id === id) this.drag = null
  }

  createEntry(
    id: number,
    kind: ObjectKind,
    body: RapierRigidBody,
    visual: Object3D,
    onImpact?: BodyEntry['onImpact'],
  ): BodyEntry {
    const spec = OBJECT_SPECS[kind]
    return {
      id,
      kind,
      material: spec.material,
      magnetic: PHYSICAL_MATERIALS[spec.material].magnetic,
      radius: spec.radius,
      body,
      visual,
      preVel: new Vector3(),
      magnetInfluence: 0,
      onImpact,
      translation: () => body.translation(),
      rotation: () => body.rotation(),
      linvel: () => body.linvel(),
      angvel: () => body.angvel(),
    }
  }

  private wakeAll() {
    this.bodies.forEach((e) => e.body.wakeUp())
  }

  /* -------------------------------------------------------------- */
  /* Per-step hooks (called by the physics world)                    */
  /* -------------------------------------------------------------- */

  beforeStep(world: WorldLike) {
    if (!this.appliedGravity.equals(this.gravity)) {
      world.gravity = { x: this.gravity.x, y: this.gravity.y, z: this.gravity.z }
      this.appliedGravity.copy(this.gravity)
      this.wakeAll()
    }
    this.bodies.forEach((e) => {
      const v = e.body.linvel()
      e.preVel.set(v.x, v.y, v.z)
    })
    this.stepDrag()
    this.stepMagnet()
  }

  afterStep() {
    this.frame++
    this.history.record(this.frame, this.bodies.values(), this.gravity, GRAVITY_ORDER.indexOf(uiStore.get().gravity))
  }

  /* -------------------------------------------------------------- */
  /* Gravity                                                         */
  /* -------------------------------------------------------------- */

  setGravity(mode: GravityMode, immediate = false) {
    const [x, y, z] = GRAVITY_PRESETS[mode].vector
    this.gravityTween?.kill()
    if (immediate) {
      this.gravity.set(x, y, z)
    } else {
      this.gravityTween = gsap.to(this.gravity, {
        x,
        y,
        z,
        duration: GRAVITY_TRANSITION,
        ease: 'power2.inOut',
      })
    }
    this.wakeAll()
    uiStore.set({ gravity: mode, hasInteracted: true })
  }

  /** Unit vector pointing "up" relative to the current gravity (world up in zero-G). */
  upVector(out: Vector3) {
    if (this.gravity.lengthSq() < 0.05) return out.set(0, 1, 0)
    return out.copy(this.gravity).normalize().negate()
  }

  /* -------------------------------------------------------------- */
  /* Drag & throw                                                    */
  /* -------------------------------------------------------------- */

  startDrag(id: number, grabPoint: Vector3, cameraForward: Vector3): boolean {
    const ui = uiStore.get()
    if (ui.timeMode !== 'live' || ui.paused) return false
    const entry = this.bodies.get(id)
    if (!entry) return false
    const t = entry.body.translation()
    const plane = new Plane().setFromNormalAndCoplanarPoint(tmpV.copy(cameraForward).negate().normalize(), grabPoint)
    this.drag = {
      id,
      offset: grabPoint.clone().sub(tmpV2.set(t.x, t.y, t.z)),
      target: grabPoint.clone(),
      plane,
      samples: [{ t: performance.now(), p: grabPoint.clone() }],
    }
    entry.body.setGravityScale(0, true)
    entry.body.wakeUp()
    uiStore.set({ dragging: true, hasInteracted: true })
    return true
  }

  updateDragTarget(point: Vector3) {
    const d = this.drag
    if (!d) return
    d.target.copy(point)
    const now = performance.now()
    d.samples.push({ t: now, p: point.clone() })
    while (d.samples.length > 2 && now - d.samples[0].t > 120) d.samples.shift()
  }

  endDrag(throwIt = true) {
    const d = this.drag
    if (!d) return
    this.drag = null
    uiStore.set({ dragging: false })
    const entry = this.bodies.get(d.id)
    if (!entry) return
    const body = entry.body
    body.setGravityScale(1, true)
    if (!throwIt) {
      body.setLinvel({ x: 0, y: 0, z: 0 }, true)
      return
    }

    // Throw velocity from the recent pointer path (world units / second).
    const now = performance.now()
    const samples = d.samples
    const last = samples[samples.length - 1]
    const first = samples[0]
    const velocity = new Vector3()
    const dt = (last.t - first.t) / 1000
    // If the pointer rested before release, it's a gentle drop rather than a throw.
    if (dt > 0.008 && now - last.t < 90) velocity.copy(last.p).sub(first.p).divideScalar(dt)
    // Blend in the body's own momentum so the release feels continuous.
    const lv = body.linvel()
    velocity.multiplyScalar(0.85).add(tmpV.set(lv.x, lv.y, lv.z).multiplyScalar(0.15))
    if (velocity.length() > MAX_THROW_SPEED) velocity.setLength(MAX_THROW_SPEED)
    body.setLinvel({ x: velocity.x, y: velocity.y, z: velocity.z }, true)

    // Off-centre grabs impart spin: ω ≈ (r × v) / |r|², softened.
    const r = d.offset
    const r2 = Math.max(r.lengthSq(), 0.15)
    tmpV2.copy(r).cross(velocity).divideScalar(r2).multiplyScalar(0.35).clampLength(0, 14)
    const av = body.angvel()
    body.setAngvel({ x: av.x + tmpV2.x, y: av.y + tmpV2.y, z: av.z + tmpV2.z }, true)
  }

  private stepDrag() {
    const d = this.drag
    if (!d) return
    const entry = this.bodies.get(d.id)
    if (!entry) {
      this.drag = null
      return
    }
    const body = entry.body
    const room = uiStore.get().room
    const r = Math.min(entry.radius, 0.9)
    // Desired centre-of-mass position, kept inside the room.
    const desired = tmpV.copy(d.target).sub(d.offset)
    desired.x = Math.min(room.width / 2 - r, Math.max(-room.width / 2 + r, desired.x))
    desired.y = Math.min(room.height - r, Math.max(r * 0.6, desired.y))
    desired.z = Math.min(room.depth / 2 - r, Math.max(-room.depth / 2 + r, desired.z))

    const p = body.translation()
    const mass = body.mass()
    // Heavier bodies follow with more lag so they feel substantial.
    const heaviness = Math.min(1, mass / 9)
    const gain = 17 - 8 * heaviness
    const blend = 0.6 - 0.3 * heaviness
    const target = desired.set(desired.x - p.x, desired.y - p.y, desired.z - p.z).multiplyScalar(gain)
    if (target.length() > 26) target.setLength(26)
    const lv = body.linvel()
    body.setLinvel(
      {
        x: lv.x + (target.x - lv.x) * blend,
        y: lv.y + (target.y - lv.y) * blend,
        z: lv.z + (target.z - lv.z) * blend,
      },
      true,
    )
    const av = body.angvel()
    body.setAngvel({ x: av.x * 0.9, y: av.y * 0.9, z: av.z * 0.9 }, true)
  }

  /* -------------------------------------------------------------- */
  /* Magnet                                                          */
  /* -------------------------------------------------------------- */

  private stepMagnet() {
    const ui = uiStore.get()
    const live = ui.magnet && this.magnet.active && ui.timeMode === 'live'
    if (!live) {
      this.bodies.forEach((e) => (e.magnetInfluence *= 0.85))
      return
    }
    const sign = effectivePolarity(ui) === 'attract' ? 1 : -1
    const point = this.magnet.point
    this.bodies.forEach((e) => {
      if (!e.magnetic || this.drag?.id === e.id) {
        e.magnetInfluence *= 0.85
        return
      }
      const body = e.body
      const t = body.translation()
      const dir = tmpV.set(point.x - t.x, point.y - t.y, point.z - t.z)
      const dist = dir.length()
      if (dist > MAGNET.range || dist < 1e-4) {
        e.magnetInfluence *= 0.85
        return
      }
      // Smooth inverse-square style falloff: 1 at the core, 0.5 at `falloff`.
      const falloff = 1 / (1 + (dist / MAGNET.falloff) ** 2)
      e.magnetInfluence = falloff
      const accel = Math.min(MAGNET.strength * falloff, MAGNET.maxAccel)
      const mass = body.mass()
      dir.divideScalar(dist).multiplyScalar(accel * mass * TIMESTEP * sign)
      if (sign > 0) {
        // Damping near the core prevents endless orbiting / jitter.
        const lv = body.linvel()
        const damp = 2.4 * falloff * mass * TIMESTEP
        dir.x -= lv.x * damp
        dir.y -= lv.y * damp
        dir.z -= lv.z * damp
      }
      body.applyImpulse({ x: dir.x, y: dir.y, z: dir.z }, true)
    })
  }

  /* -------------------------------------------------------------- */
  /* Spawning, chaos, reset                                          */
  /* -------------------------------------------------------------- */

  spawn(requested: ObjectKind | 'random'): boolean {
    const ui = uiStore.get()
    if (ui.bodies.length >= MAX_BODIES || ui.timeMode !== 'live') return false
    const kind = requested === 'random' ? SPAWNABLE[Math.floor(Math.random() * SPAWNABLE.length)] : requested
    const room = ui.room
    const up = this.upVector(new Vector3())
    const zeroG = this.gravity.lengthSq() < 0.05
    const center = new Vector3(0, room.height / 2, 0)
    const extent = Math.abs(up.x) * room.width * 0.5 + Math.abs(up.y) * room.height * 0.5 + Math.abs(up.z) * room.depth * 0.5
    const radius = OBJECT_SPECS[kind].radius

    // Try a few candidates and keep the one furthest from existing bodies.
    let best = new Vector3()
    let bestScore = -Infinity
    for (let i = 0; i < 8; i++) {
      const candidate = new Vector3()
      if (zeroG) {
        randomUnit(candidate).multiplyScalar(1.6).add(center)
      } else {
        const jitter = randomUnit(new Vector3()).projectOnPlane(up).multiplyScalar(2.2)
        candidate.copy(center).addScaledVector(up, Math.max(0, extent - radius - 0.6)).add(jitter)
      }
      candidate.x = Math.max(-room.width / 2 + radius + 0.1, Math.min(room.width / 2 - radius - 0.1, candidate.x))
      candidate.y = Math.max(radius + 0.1, Math.min(room.height - radius - 0.1, candidate.y))
      candidate.z = Math.max(-room.depth / 2 + radius + 0.1, Math.min(room.depth / 2 - radius - 0.1, candidate.z))
      let nearest = Infinity
      this.bodies.forEach((e) => {
        const t = e.body.translation()
        nearest = Math.min(nearest, candidate.distanceTo(tmpV.set(t.x, t.y, t.z)) - e.radius - radius)
      })
      if (nearest > bestScore) {
        bestScore = nearest
        best = candidate
      }
    }

    const velocity = zeroG
      ? randomUnit(new Vector3()).multiplyScalar(1.8)
      : up.clone().multiplyScalar(-1.5).add(randomUnit(new Vector3()).multiplyScalar(0.8))
    const descriptor: BodyDescriptor = {
      id: this.nextId++,
      kind,
      position: best.toArray() as Vec3,
      rotation: [Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI],
      tint: kind === 'block' ? BLOCK_COLORS[Math.floor(Math.random() * BLOCK_COLORS.length)] : undefined,
      velocity: velocity.toArray() as Vec3,
      spawnFrame: this.frame,
      spawned: true,
    }
    uiStore.set({ bodies: [...ui.bodies, descriptor], hasInteracted: true })
    return true
  }

  chaos() {
    const ui = uiStore.get()
    if (ui.timeMode !== 'live') return
    if (ui.paused) uiStore.set({ paused: false })
    this.endDrag(false)
    const up = this.upVector(new Vector3())
    const zeroG = this.gravity.lengthSq() < 0.05
    const dir = new Vector3()
    this.bodies.forEach((e) => {
      const body = e.body
      if (!body.isEnabled()) return
      randomUnit(dir)
      if (!zeroG) dir.addScaledVector(up, 0.9).normalize()
      const speed = (zeroG ? 3.5 : 5.5) + Math.random() * 4
      const mass = body.mass()
      body.applyImpulse({ x: dir.x * speed * mass, y: dir.y * speed * mass, z: dir.z * speed * mass }, true)
      const lv = body.linvel()
      tmpV.set(lv.x, lv.y, lv.z)
      if (tmpV.length() > MAX_THROW_SPEED) {
        tmpV.setLength(MAX_THROW_SPEED)
        body.setLinvel({ x: tmpV.x, y: tmpV.y, z: tmpV.z }, true)
      }
      randomUnit(tmpV2).multiplyScalar(4 + Math.random() * 5)
      const av = body.angvel()
      body.setAngvel({ x: av.x + tmpV2.x, y: av.y + tmpV2.y, z: av.z + tmpV2.z }, true)
    })
    collisionAudio.sweep(true)
    uiStore.set((s) => ({ chaosTick: s.chaosTick + 1, hasInteracted: true }))
  }

  reset() {
    this.endDrag(false)
    this.gravityTween?.kill()
    this.gravity.set(...GRAVITY_PRESETS.earth.vector)
    this.history.clear()
    this.frame = 0
    this.scrubIndex = -1
    const ui = uiStore.get()
    uiStore.set({
      bodies: createInitialComposition(ui.room),
      resetKey: ui.resetKey + 1,
      gravity: 'earth',
      paused: false,
      slowMo: false,
      timeMode: 'live',
      scrubOffset: 0,
      historyAvailable: 0,
      magnet: false,
      polarity: 'attract',
    })
  }

  /* -------------------------------------------------------------- */
  /* Time machine                                                    */
  /* -------------------------------------------------------------- */

  get historySeconds() {
    return Math.max(0, this.history.size - 1) * TIMESTEP
  }

  private beginScrub(): boolean {
    const ui = uiStore.get()
    if (ui.timeMode !== 'live') return true
    if (this.history.size < 2) return false
    this.endDrag(false)
    this.gravityTween?.kill()
    this.scrubIndex = this.history.size - 1
    uiStore.set({ timeMode: 'scrub', scrubOffset: 0, historyAvailable: this.historySeconds, hasInteracted: true })
    collisionAudio.sweep(false)
    return true
  }

  /** Shows the recorded state `offsetSeconds` before the newest frame. */
  scrubTo(offsetSeconds: number) {
    if (!this.beginScrub()) return
    const newest = this.history.size - 1
    const back = Math.round(offsetSeconds / TIMESTEP)
    const index = Math.max(0, Math.min(newest, newest - back))
    this.applySnapshot(index, false)
    uiStore.set({ scrubOffset: (newest - index) * TIMESTEP })
  }

  /** Plays the recording backwards in real time until stopped or the oldest frame is reached. */
  startRewind() {
    if (!this.beginScrub()) return
    uiStore.set({ timeMode: 'rewind' })
  }

  stopRewind() {
    if (uiStore.get().timeMode === 'rewind') uiStore.set({ timeMode: 'scrub' })
  }

  advanceRewind(dt: number) {
    const ui = uiStore.get()
    const max = this.historySeconds
    const next = Math.min(max, ui.scrubOffset + dt)
    this.scrubTo(next)
    if (next >= max) uiStore.set({ timeMode: 'scrub' })
  }

  /** Continues the simulation from the snapshot currently on display. */
  resume() {
    const ui = uiStore.get()
    if (ui.timeMode === 'live') return
    const index = this.scrubIndex
    if (index < 0 || index >= this.history.size) {
      uiStore.set({ timeMode: 'live', scrubOffset: 0 })
      return
    }
    this.applySnapshot(index, true)
    const present = new Set(this.history.idsAt(index))
    const rewound = ui.scrubOffset
    this.history.truncateAfter(index)
    this.frame = this.history.frameAt(index)
    this.scrubIndex = -1
    uiStore.set((s) => ({
      timeMode: 'live',
      paused: false,
      scrubOffset: 0,
      historyAvailable: this.historySeconds,
      // Bodies spawned after the restored moment never existed — remove them.
      bodies: s.bodies.filter((b) => present.has(b.id)),
      rewindTick: rewound > 0.04 ? s.rewindTick + 1 : s.rewindTick,
      lastRewindSeconds: rewound,
    }))
    if (rewound > 0.04) collisionAudio.sweep(true)
  }

  private applySnapshot(index: number, withVelocity: boolean) {
    this.bodies.forEach((e) => {
      const body = e.body
      if (this.history.read(index, e.id, snapshot)) {
        if (!body.isEnabled()) body.setEnabled(true)
        e.visual.visible = true
        body.setTranslation({ x: snapshot.px, y: snapshot.py, z: snapshot.pz }, true)
        tmpQ.set(snapshot.qx, snapshot.qy, snapshot.qz, snapshot.qw).normalize()
        body.setRotation({ x: tmpQ.x, y: tmpQ.y, z: tmpQ.z, w: tmpQ.w }, true)
        if (withVelocity) {
          body.setLinvel({ x: snapshot.vx, y: snapshot.vy, z: snapshot.vz }, true)
          body.setAngvel({ x: snapshot.wx, y: snapshot.wy, z: snapshot.wz }, true)
        } else {
          body.setLinvel({ x: 0, y: 0, z: 0 }, true)
          body.setAngvel({ x: 0, y: 0, z: 0 }, true)
        }
      } else {
        // This body did not exist yet at that moment in time.
        if (body.isEnabled()) body.setEnabled(false)
        e.visual.visible = false
      }
    })
    // Gravity travels through time with the bodies (the indicator and readouts follow it).
    this.history.gravityAt(index, this.gravity)
    const mode = GRAVITY_ORDER[this.history.modeAt(index)] ?? 'earth'
    if (uiStore.get().gravity !== mode) uiStore.set({ gravity: mode })
    this.scrubIndex = index
    this.syncMeshes?.()
  }

  /* -------------------------------------------------------------- */
  /* Impacts                                                         */
  /* -------------------------------------------------------------- */

  emitImpact(material: MaterialClass, strength: number, point: Vector3, normal: Vector3, audible: boolean) {
    if (audible && strength > 1.1) collisionAudio.play(material, Math.min(1, strength / 11))
    if (strength > 3.2 && this.impacts.length < 16) {
      this.impacts.push({ point: point.clone(), normal: normal.clone(), strength })
    }
  }
}

export const physicsController = new PhysicsController()
