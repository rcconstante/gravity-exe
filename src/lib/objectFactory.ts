import {
  CanvasTexture,
  CapsuleGeometry,
  Color,
  CylinderGeometry,
  MeshPhysicalMaterial,
  RepeatWrapping,
  SRGBColorSpace,
  SphereGeometry,
  TorusGeometry,
  type BufferGeometry,
  type Material,
} from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import type { AccentName, ObjectKind, Vec3 } from './physicsConfig'

/**
 * Procedural geometry + art-directed materials for every object in the lab.
 * Geometries and materials are cached and shared between instances so spawning
 * twenty spheres costs one geometry and one material. `disposeFactory` frees them.
 */

export type Quality = 'high' | 'low'

/* ------------------------------------------------------------------ */
/* Collider descriptions                                               */
/* ------------------------------------------------------------------ */

export type ColliderShape =
  | { type: 'ball'; radius: number; position?: Vec3 }
  | { type: 'cuboid'; half: Vec3 }
  | { type: 'roundCuboid'; half: Vec3; radius: number }
  | { type: 'capsule'; halfHeight: number; radius: number }
  | { type: 'cylinder'; halfHeight: number; radius: number }

const TORUS_RADIUS = 0.62
const TORUS_TUBE = 0.17
const TORUS_SEGMENTS = 16

export function getColliders(kind: ObjectKind): ColliderShape[] {
  switch (kind) {
    case 'chromeSphere':
      return [{ type: 'ball', radius: 0.62 }]
    case 'glassSphere':
      return [{ type: 'ball', radius: 0.5 }]
    case 'rubberCube':
      return [{ type: 'roundCuboid', half: [0.36, 0.36, 0.36], radius: 0.19 }]
    case 'chromeTorus':
      // Rapier has no torus primitive: approximate the tube with a ring of spheres.
      return Array.from({ length: TORUS_SEGMENTS }, (_, i) => {
        const a = (i / TORUS_SEGMENTS) * Math.PI * 2
        return { type: 'ball' as const, radius: TORUS_TUBE, position: [Math.cos(a) * TORUS_RADIUS, Math.sin(a) * TORUS_RADIUS, 0] as Vec3 }
      })
    case 'acrylicCapsule':
      return [{ type: 'capsule', halfHeight: 0.5, radius: 0.32 }]
    case 'plinth':
      return [{ type: 'cuboid', half: [0.7, 0.25, 0.5] }]
    case 'pillar':
      return [{ type: 'cuboid', half: [0.25, 0.75, 0.25] }]
    case 'block':
      return [{ type: 'cuboid', half: [0.225, 0.225, 0.225] }]
    case 'aluminumCube':
      return [{ type: 'cuboid', half: [0.25, 0.25, 0.25] }]
    case 'aluminumDisc':
      return [{ type: 'cylinder', halfHeight: 0.11, radius: 0.38 }]
  }
}

/* ------------------------------------------------------------------ */
/* Geometry                                                            */
/* ------------------------------------------------------------------ */

const geometryCache = new Map<ObjectKind, BufferGeometry>()

function buildGeometry(kind: ObjectKind): BufferGeometry {
  switch (kind) {
    case 'chromeSphere':
      return new SphereGeometry(0.62, 72, 48)
    case 'glassSphere':
      return new SphereGeometry(0.5, 72, 48)
    case 'rubberCube':
      return new RoundedBoxGeometry(1.1, 1.1, 1.1, 8, 0.2)
    case 'chromeTorus':
      return new TorusGeometry(TORUS_RADIUS, TORUS_TUBE, 40, 120)
    case 'acrylicCapsule':
      return new CapsuleGeometry(0.32, 1.0, 16, 40)
    case 'plinth':
      return new RoundedBoxGeometry(1.4, 0.5, 1.0, 4, 0.045)
    case 'pillar':
      return new RoundedBoxGeometry(0.5, 1.5, 0.5, 4, 0.045)
    case 'block':
      return new RoundedBoxGeometry(0.45, 0.45, 0.45, 4, 0.04)
    case 'aluminumCube':
      return new RoundedBoxGeometry(0.5, 0.5, 0.5, 4, 0.03)
    case 'aluminumDisc':
      return new CylinderGeometry(0.38, 0.38, 0.22, 72, 1)
  }
}

export function getGeometry(kind: ObjectKind): BufferGeometry {
  let geometry = geometryCache.get(kind)
  if (!geometry) {
    geometry = buildGeometry(kind)
    geometryCache.set(kind, geometry)
  }
  return geometry
}

/* ------------------------------------------------------------------ */
/* Materials                                                           */
/* ------------------------------------------------------------------ */

const LACQUER: Record<AccentName, string> = {
  coral: '#ff9a7e',
  blue: '#93b8f2',
  lemon: '#f3de72',
  violet: '#b3a2f5',
  ink: '#2a2a2a',
}

let brushedTexture: CanvasTexture | null = null

/** A generated brushed-metal roughness texture (horizontal micro-streaks). */
function getBrushedTexture() {
  if (brushedTexture) return brushedTexture
  const size = 256
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#9a9a9a'
  ctx.fillRect(0, 0, size, size)
  for (let i = 0; i < 1400; i++) {
    const y = Math.random() * size
    const v = 120 + Math.floor(Math.random() * 110)
    ctx.strokeStyle = `rgba(${v},${v},${v},${0.15 + Math.random() * 0.35})`
    ctx.lineWidth = Math.random() * 1.2 + 0.2
    ctx.beginPath()
    const x = Math.random() * size
    ctx.moveTo(x - 80 - Math.random() * 160, y)
    ctx.lineTo(x + 80 + Math.random() * 160, y + (Math.random() - 0.5) * 0.6)
    ctx.stroke()
  }
  brushedTexture = new CanvasTexture(canvas)
  brushedTexture.wrapS = brushedTexture.wrapT = RepeatWrapping
  brushedTexture.repeat.set(2, 2)
  return brushedTexture
}

const materialCache = new Map<string, Material>()

function buildMaterial(key: string, quality: Quality): Material {
  const high = quality === 'high'
  switch (key) {
    case 'chrome':
      return new MeshPhysicalMaterial({
        color: '#f4f4f6',
        metalness: 1,
        roughness: 0.035,
        envMapIntensity: 1.35,
        clearcoat: 0.4,
        clearcoatRoughness: 0.04,
      })
    case 'aluminum': {
      const tex = getBrushedTexture()
      return new MeshPhysicalMaterial({
        color: '#d6dade',
        metalness: 1,
        roughness: 0.38,
        roughnessMap: tex,
        anisotropy: high ? 0.85 : 0,
        envMapIntensity: 1.1,
      })
    }
    case 'glass':
      return high
        ? new MeshPhysicalMaterial({
            color: '#ffffff',
            metalness: 0,
            roughness: 0.02,
            transmission: 1,
            thickness: 0.95,
            ior: 1.52,
            specularIntensity: 1,
            clearcoat: 1,
            clearcoatRoughness: 0.02,
            attenuationColor: new Color('#d3e6ff'),
            attenuationDistance: 2.6,
            iridescence: 0.22,
            iridescenceIOR: 1.3,
            envMapIntensity: 1.3,
          })
        : new MeshPhysicalMaterial({
            color: '#e9f2ff',
            metalness: 0.1,
            roughness: 0.04,
            transparent: true,
            opacity: 0.42,
            clearcoat: 1,
            envMapIntensity: 1.5,
          })
    case 'acrylic':
      return high
        ? new MeshPhysicalMaterial({
            color: '#cbbcff',
            metalness: 0,
            roughness: 0.16,
            transmission: 0.94,
            thickness: 0.75,
            ior: 1.49,
            attenuationColor: new Color('#8e6cff'),
            attenuationDistance: 0.85,
            clearcoat: 0.7,
            clearcoatRoughness: 0.12,
            sheen: 0.4,
            sheenColor: new Color('#ffd9f2'),
          })
        : new MeshPhysicalMaterial({
            color: '#b4a0ff',
            roughness: 0.2,
            transparent: true,
            opacity: 0.68,
            clearcoat: 0.6,
          })
    case 'rubber':
      return new MeshPhysicalMaterial({
        color: '#ff8a6c',
        roughness: 0.64,
        metalness: 0,
        sheen: 0.8,
        sheenRoughness: 0.45,
        sheenColor: new Color('#ffd3c4'),
        clearcoat: 0.12,
        clearcoatRoughness: 0.6,
      })
    default: {
      // lacquer:<accent>
      const accent = key.split(':')[1] as AccentName
      return new MeshPhysicalMaterial({
        color: LACQUER[accent] ?? LACQUER.blue,
        roughness: 0.32,
        metalness: 0,
        clearcoat: 0.85,
        clearcoatRoughness: 0.14,
      })
    }
  }
}

function materialKey(kind: ObjectKind, tint?: AccentName): string {
  switch (kind) {
    case 'chromeSphere':
    case 'chromeTorus':
      return 'chrome'
    case 'aluminumCube':
    case 'aluminumDisc':
      return 'aluminum'
    case 'glassSphere':
      return 'glass'
    case 'acrylicCapsule':
      return 'acrylic'
    case 'rubberCube':
      return 'rubber'
    case 'plinth':
      return 'lacquer:lemon'
    case 'pillar':
      return 'lacquer:blue'
    case 'block':
      return `lacquer:${tint ?? 'coral'}`
  }
}

export function getMaterial(kind: ObjectKind, quality: Quality, tint?: AccentName): Material {
  const key = materialKey(kind, tint)
  const cacheKey = `${key}|${quality}`
  let material = materialCache.get(cacheKey)
  if (!material) {
    material = buildMaterial(key, quality)
    materialCache.set(cacheKey, material)
  }
  return material
}

export function disposeFactory() {
  geometryCache.forEach((g) => g.dispose())
  geometryCache.clear()
  materialCache.forEach((m) => m.dispose())
  materialCache.clear()
  brushedTexture?.dispose()
  brushedTexture = null
}

/** Generates a soft radial sprite texture (used by the magnet glow and halos). */
export function createRadialTexture(inner: string, outer: string, size = 128) {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  g.addColorStop(0, inner)
  g.addColorStop(1, outer)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  return texture
}
