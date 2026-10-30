/**
 * Central configuration for the GRAVITY.exe laboratory.
 * Everything that defines how the simulated universe behaves lives here,
 * so tuning the "feel" of the experience never requires digging through components.
 */

export type Vec3 = [number, number, number]

/* ------------------------------------------------------------------ */
/* Simulation                                                          */
/* ------------------------------------------------------------------ */

/** Fixed physics timestep (seconds). History frames are recorded at this rate. */
export const TIMESTEP = 1 / 60
/** Seconds of simulation kept in the time-machine ring buffer. */
export const HISTORY_SECONDS = 8
export const HISTORY_FRAMES = Math.round(HISTORY_SECONDS / TIMESTEP)
/** Hard cap on simultaneously simulated bodies (initial + spawned). */
export const MAX_BODIES = 32
/** Time scale used by the slow-motion control. */
export const SLOW_MO_SCALE = 0.3
/** Max speed (m/s) any body may have after a throw or chaos impulse. */
export const MAX_THROW_SPEED = 24

/* ------------------------------------------------------------------ */
/* Room                                                                */
/* ------------------------------------------------------------------ */

export interface RoomDimensions {
  width: number
  height: number
  depth: number
}

/** The room is a little narrower on portrait screens so it reads at phone size. */
export function getRoomDimensions(aspect: number): RoomDimensions {
  if (aspect < 0.85) return { width: 8, height: 7, depth: 6 }
  return { width: 12, height: 7, depth: 7 }
}

/* ------------------------------------------------------------------ */
/* Gravity                                                             */
/* ------------------------------------------------------------------ */

export type GravityMode = 'earth' | 'moon' | 'zero' | 'reverse' | 'sideways'

export interface GravityPreset {
  id: GravityMode
  label: string
  short: string
  vector: Vec3
  /** Human readable magnitude for the readout. */
  magnitude: string
  description: string
  hotkey: string
}

export const GRAVITY_PRESETS: Record<GravityMode, GravityPreset> = {
  earth: {
    id: 'earth',
    label: 'Earth',
    short: 'EARTH',
    vector: [0, -9.81, 0],
    magnitude: '9.81 m/s²',
    description: 'Standard downward pull.',
    hotkey: '1',
  },
  moon: {
    id: 'moon',
    label: 'Moon',
    short: 'MOON',
    vector: [0, -1.62, 0],
    magnitude: '1.62 m/s²',
    description: 'Long, lazy arcs.',
    hotkey: '2',
  },
  zero: {
    id: 'zero',
    label: 'Zero-G',
    short: 'ZERO-G',
    vector: [0, 0, 0],
    magnitude: '0.00 m/s²',
    description: 'Momentum is forever.',
    hotkey: '3',
  },
  reverse: {
    id: 'reverse',
    label: 'Reverse',
    short: 'REVERSE',
    vector: [0, 9.81, 0],
    magnitude: '9.81 m/s² ↑',
    description: 'Everything falls up.',
    hotkey: '4',
  },
  sideways: {
    id: 'sideways',
    label: 'Sideways',
    short: 'SIDEWAYS',
    vector: [9.81, 0, 0],
    magnitude: '9.81 m/s² →',
    description: 'The wall is the floor.',
    hotkey: '5',
  },
}

export const GRAVITY_ORDER: GravityMode[] = ['earth', 'moon', 'zero', 'reverse', 'sideways']

/** Seconds used to blend the gravity vector between modes (keeps the solver calm). */
export const GRAVITY_TRANSITION = 0.65

/* ------------------------------------------------------------------ */
/* Materials (physical behaviour)                                      */
/* ------------------------------------------------------------------ */

export type MaterialClass = 'metal' | 'glass' | 'rubber' | 'acrylic' | 'lacquer'

export interface PhysicalMaterial {
  density: number
  friction: number
  restitution: number
  /** Use Max combine so bouncy materials stay bouncy against a dull floor. */
  bouncy?: boolean
  linearDamping: number
  angularDamping: number
  magnetic: boolean
}

export const PHYSICAL_MATERIALS: Record<MaterialClass, PhysicalMaterial> = {
  metal: { density: 7.8, friction: 0.35, restitution: 0.22, linearDamping: 0.04, angularDamping: 0.25, magnetic: true },
  glass: { density: 2.5, friction: 0.22, restitution: 0.5, linearDamping: 0.03, angularDamping: 0.12, magnetic: false },
  rubber: { density: 1.15, friction: 1.0, restitution: 0.86, bouncy: true, linearDamping: 0.05, angularDamping: 0.3, magnetic: false },
  acrylic: { density: 0.55, friction: 0.32, restitution: 0.42, linearDamping: 0.09, angularDamping: 0.2, magnetic: false },
  lacquer: { density: 0.8, friction: 0.62, restitution: 0.2, linearDamping: 0.05, angularDamping: 0.22, magnetic: false },
}

/* ------------------------------------------------------------------ */
/* Objects                                                             */
/* ------------------------------------------------------------------ */

export type ObjectKind =
  | 'chromeSphere'
  | 'glassSphere'
  | 'rubberCube'
  | 'chromeTorus'
  | 'acrylicCapsule'
  | 'plinth'
  | 'pillar'
  | 'block'
  | 'aluminumCube'
  | 'aluminumDisc'

export type AccentName = 'coral' | 'blue' | 'violet' | 'lemon' | 'ink'

export interface ObjectSpec {
  kind: ObjectKind
  label: string
  material: MaterialClass
  /** Rough bounding radius; used for spawning, trails and hover halos. */
  radius: number
  trail: AccentName
}

export const OBJECT_SPECS: Record<ObjectKind, ObjectSpec> = {
  chromeSphere: { kind: 'chromeSphere', label: 'Chrome sphere', material: 'metal', radius: 0.62, trail: 'ink' },
  glassSphere: { kind: 'glassSphere', label: 'Glass sphere', material: 'glass', radius: 0.5, trail: 'blue' },
  rubberCube: { kind: 'rubberCube', label: 'Rubber cube', material: 'rubber', radius: 0.7, trail: 'coral' },
  chromeTorus: { kind: 'chromeTorus', label: 'Chrome ring', material: 'metal', radius: 0.8, trail: 'ink' },
  acrylicCapsule: { kind: 'acrylicCapsule', label: 'Acrylic capsule', material: 'acrylic', radius: 0.82, trail: 'violet' },
  plinth: { kind: 'plinth', label: 'Lacquer plinth', material: 'lacquer', radius: 0.9, trail: 'lemon' },
  pillar: { kind: 'pillar', label: 'Lacquer pillar', material: 'lacquer', radius: 0.8, trail: 'blue' },
  block: { kind: 'block', label: 'Block', material: 'lacquer', radius: 0.32, trail: 'coral' },
  aluminumCube: { kind: 'aluminumCube', label: 'Aluminium cube', material: 'metal', radius: 0.35, trail: 'ink' },
  aluminumDisc: { kind: 'aluminumDisc', label: 'Aluminium puck', material: 'metal', radius: 0.4, trail: 'ink' },
}

/** Objects offered in the spawn menu. */
export const SPAWNABLE: ObjectKind[] = [
  'chromeSphere',
  'glassSphere',
  'rubberCube',
  'chromeTorus',
  'acrylicCapsule',
  'block',
  'aluminumCube',
  'aluminumDisc',
]

export const BLOCK_COLORS: AccentName[] = ['coral', 'blue', 'lemon', 'violet']

export interface BodyDescriptor {
  /** Numeric id, also used as the key in the history ring buffer. */
  id: number
  kind: ObjectKind
  position: Vec3
  rotation: Vec3
  /** Optional colour variant for blocks. */
  tint?: AccentName
  /** Initial linear velocity (used for spawned objects). */
  velocity?: Vec3
  /** Simulation frame at which this body was created (0 for the original composition). */
  spawnFrame: number
  spawned: boolean
}

/**
 * The sculptural opening composition. Positions are tuned so the scene rests in
 * equilibrium: a glass sphere balanced on a pillar, a chrome sphere cradled by the
 * chrome ring, a little stacked tower, and a few scattered accents.
 */
export function createInitialComposition(room: RoomDimensions): BodyDescriptor[] {
  const narrow = room.width < 10
  const sx = narrow ? 0.62 : 1
  const list: Omit<BodyDescriptor, 'id' | 'spawnFrame' | 'spawned'>[] = [
    { kind: 'plinth', position: [0.7 * sx, 0.25, -0.9], rotation: [0, 0.12, 0] },
    { kind: 'pillar', position: [0.7 * sx, 1.251, -0.9], rotation: [0, 0.12, 0] },
    { kind: 'glassSphere', position: [0.7 * sx, 2.505, -0.9], rotation: [0, 0, 0] },
    { kind: 'chromeTorus', position: [2.9 * sx, 0.172, 0.7], rotation: [Math.PI / 2, 0, 0] },
    { kind: 'chromeSphere', position: [2.9 * sx, 0.72, 0.7], rotation: [0, 0, 0] },
    { kind: 'rubberCube', position: [-1.5 * sx, 0.551, 0.5], rotation: [0, 0.45, 0] },
    { kind: 'acrylicCapsule', position: [0.2 * sx, 0.321, 1.7], rotation: [0, 0.35, Math.PI / 2] },
    { kind: 'block', position: [-3.4 * sx, 0.226, -0.4], rotation: [0, 0.1, 0], tint: 'lemon' },
    { kind: 'block', position: [-3.4 * sx, 0.678, -0.4], rotation: [0, -0.18, 0], tint: 'blue' },
    { kind: 'block', position: [-3.4 * sx, 1.13, -0.4], rotation: [0, 0.32, 0], tint: 'coral' },
    { kind: 'aluminumCube', position: [2.2 * sx, 0.251, -1.9], rotation: [0, 0.6, 0] },
    { kind: 'aluminumDisc', position: [-0.9 * sx, 0.111, -1.6], rotation: [0, 0, 0] },
  ]
  return list.map((entry, index) => ({ ...entry, id: index + 1, spawnFrame: 0, spawned: false }))
}

/* ------------------------------------------------------------------ */
/* Magnet                                                              */
/* ------------------------------------------------------------------ */

export const MAGNET = {
  /** Peak acceleration (m/s²) right at the magnet. */
  strength: 46,
  /** Distance (m) where the field has fallen to half strength. */
  falloff: 1.25,
  /** Beyond this distance the field is ignored. */
  range: 7,
  /** Absolute cap on the acceleration applied in a single step. */
  maxAccel: 34,
}

/* ------------------------------------------------------------------ */
/* Palette                                                             */
/* ------------------------------------------------------------------ */

export const PALETTE = {
  background: '#eeece7',
  ink: '#151515',
  coral: '#ff7a59',
  coralSoft: '#ff9a80',
  blue: '#86b2f0',
  blueDeep: '#4f7fd6',
  violet: '#a18cf2',
  lemon: '#f2dc5d',
} as const

export const ACCENT_HEX: Record<AccentName, string> = {
  coral: PALETTE.coral,
  blue: PALETTE.blue,
  violet: PALETTE.violet,
  lemon: PALETTE.lemon,
  ink: '#3a3a3a',
}

export const DEVELOPER_CREDIT = 'R. Constante'
