/**
 * Fixed-capacity ring buffer of rigid-body snapshots.
 *
 * Every physics step writes one frame. A frame stores, for every live body:
 *   id, position (3), rotation quaternion (4), linear velocity (3), angular velocity (3)
 *
 * Storage is fully preallocated (typed arrays), so recording never allocates
 * and old frames are overwritten in place once the buffer is full.
 */

export const FLOATS_PER_BODY = 13

export interface BodyStateSource {
  id: number
  translation(): { x: number; y: number; z: number }
  rotation(): { x: number; y: number; z: number; w: number }
  linvel(): { x: number; y: number; z: number }
  angvel(): { x: number; y: number; z: number }
}

export interface BodySnapshot {
  px: number; py: number; pz: number
  qx: number; qy: number; qz: number; qw: number
  vx: number; vy: number; vz: number
  wx: number; wy: number; wz: number
}

export class PhysicsHistory {
  readonly capacity: number
  readonly maxBodies: number
  private readonly data: Float32Array
  private readonly ids: Int32Array
  private readonly counts: Uint16Array
  private readonly frames: Uint32Array
  /** Gravity vector + selected mode per frame, so a rewind restores the laws of physics too. */
  private readonly gravity: Float32Array
  private readonly modes: Uint8Array
  /** Physical slot of the oldest frame. */
  private start = 0
  /** Number of valid frames. */
  private length = 0

  constructor(capacity: number, maxBodies: number) {
    this.capacity = capacity
    this.maxBodies = maxBodies
    this.data = new Float32Array(capacity * maxBodies * FLOATS_PER_BODY)
    this.ids = new Int32Array(capacity * maxBodies)
    this.counts = new Uint16Array(capacity)
    this.frames = new Uint32Array(capacity)
    this.gravity = new Float32Array(capacity * 3)
    this.modes = new Uint8Array(capacity)
  }

  get size() {
    return this.length
  }

  clear() {
    this.start = 0
    this.length = 0
  }

  /** Physical slot for a logical index (0 = oldest, size - 1 = newest). */
  private slot(index: number) {
    return (this.start + index) % this.capacity
  }

  record(
    frame: number,
    bodies: Iterable<BodyStateSource>,
    gravity: { x: number; y: number; z: number },
    mode: number,
  ) {
    let slot: number
    if (this.length < this.capacity) {
      slot = this.slot(this.length)
      this.length++
    } else {
      // Buffer full: overwrite the oldest frame and advance the window.
      slot = this.start
      this.start = (this.start + 1) % this.capacity
    }

    const base = slot * this.maxBodies
    let count = 0
    for (const body of bodies) {
      if (count >= this.maxBodies) break
      const t = body.translation()
      const r = body.rotation()
      const v = body.linvel()
      const w = body.angvel()
      const o = (base + count) * FLOATS_PER_BODY
      const d = this.data
      d[o] = t.x; d[o + 1] = t.y; d[o + 2] = t.z
      d[o + 3] = r.x; d[o + 4] = r.y; d[o + 5] = r.z; d[o + 6] = r.w
      d[o + 7] = v.x; d[o + 8] = v.y; d[o + 9] = v.z
      d[o + 10] = w.x; d[o + 11] = w.y; d[o + 12] = w.z
      this.ids[base + count] = body.id
      count++
    }
    this.counts[slot] = count
    this.frames[slot] = frame
    this.gravity[slot * 3] = gravity.x
    this.gravity[slot * 3 + 1] = gravity.y
    this.gravity[slot * 3 + 2] = gravity.z
    this.modes[slot] = mode
  }

  gravityAt(index: number, out: { set(x: number, y: number, z: number): unknown }) {
    const slot = this.slot(index)
    out.set(this.gravity[slot * 3], this.gravity[slot * 3 + 1], this.gravity[slot * 3 + 2])
  }

  modeAt(index: number) {
    return this.modes[this.slot(index)]
  }

  frameAt(index: number) {
    return this.frames[this.slot(index)]
  }

  /** Reads the snapshot for `id` at logical `index` into `out`. Returns false if absent. */
  read(index: number, id: number, out: BodySnapshot): boolean {
    if (index < 0 || index >= this.length) return false
    const slot = this.slot(index)
    const base = slot * this.maxBodies
    const count = this.counts[slot]
    for (let i = 0; i < count; i++) {
      if (this.ids[base + i] !== id) continue
      const o = (base + i) * FLOATS_PER_BODY
      const d = this.data
      out.px = d[o]; out.py = d[o + 1]; out.pz = d[o + 2]
      out.qx = d[o + 3]; out.qy = d[o + 4]; out.qz = d[o + 5]; out.qw = d[o + 6]
      out.vx = d[o + 7]; out.vy = d[o + 8]; out.vz = d[o + 9]
      out.wx = d[o + 10]; out.wy = d[o + 11]; out.wz = d[o + 12]
      return true
    }
    return false
  }

  /** Ids of all bodies present at logical `index`. */
  idsAt(index: number): number[] {
    const slot = this.slot(index)
    const base = slot * this.maxBodies
    const result: number[] = []
    for (let i = 0; i < this.counts[slot]; i++) result.push(this.ids[base + i])
    return result
  }

  /** Discards every frame newer than logical `index` (the future we rewound away from). */
  truncateAfter(index: number) {
    this.length = Math.max(0, Math.min(this.length, index + 1))
  }
}

export function createSnapshot(): BodySnapshot {
  return { px: 0, py: 0, pz: 0, qx: 0, qy: 0, qz: 0, qw: 1, vx: 0, vy: 0, vz: 0, wx: 0, wy: 0, wz: 0 }
}
