import { useEffect, useMemo } from 'react'
import { CuboidCollider, RigidBody } from '@react-three/rapier'
import {
  BoxGeometry,
  BufferGeometry,
  Color,
  EdgesGeometry,
  Float32BufferAttribute,
  ShaderMaterial,
} from 'three'
import type { RoomDimensions } from '../lib/physicsConfig'
import { PALETTE } from '../lib/physicsConfig'

/**
 * The laboratory: an invisible box of static colliders, a shadow-catching floor
 * that melts into the porcelain background, a shader-drawn dot grid, and hairline
 * boundary lines that read like a technical drawing.
 */

const WALL = 1 // collider thickness

const dotGridVertex = /* glsl */ `
  varying vec2 vWorld;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`

const dotGridFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform vec2 uHalf;
  uniform float uSpacing;
  varying vec2 vWorld;
  void main() {
    vec2 cell = vWorld / uSpacing;
    vec2 g = abs(fract(cell - 0.5) - 0.5) * uSpacing;
    float d = length(g);
    float aa = fwidth(d) * 1.2;
    float dotMask = 1.0 - smoothstep(0.018 - aa, 0.018 + aa, d);
    // Major crosses every 4 cells for a drafting-table feel.
    vec2 major = abs(fract(vWorld / (uSpacing * 4.0) - 0.5) - 0.5) * uSpacing * 4.0;
    float crossMask = (1.0 - smoothstep(0.0, fwidth(major.x) * 1.5, major.x)) * step(major.y, 0.07)
                    + (1.0 - smoothstep(0.0, fwidth(major.y) * 1.5, major.y)) * step(major.x, 0.07);
    // Fade toward the room edges.
    vec2 edge = 1.0 - smoothstep(uHalf - 1.4, uHalf, abs(vWorld));
    float fade = edge.x * edge.y;
    float alpha = max(dotMask * 0.32, min(crossMask, 1.0) * 0.4) * fade;
    if (alpha < 0.004) discard;
    gl_FragColor = vec4(uColor, alpha);
  }
`

function useBoundaryGeometry(room: RoomDimensions) {
  return useMemo(() => {
    const box = new BoxGeometry(room.width, room.height, room.depth)
    box.translate(0, room.height / 2, 0)
    const edges = new EdgesGeometry(box)
    box.dispose()
    return edges
  }, [room.width, room.height, room.depth])
}

/** Small L-shaped registration marks at the floor corners + ruler ticks on the front edge. */
function useMarksGeometry(room: RoomDimensions) {
  return useMemo(() => {
    const w = room.width / 2
    const d = room.depth / 2
    const y = 0.004
    const l = 0.45
    const pts: number[] = []
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const x = sx * w
        const z = sz * d
        pts.push(x, y, z, x - sx * l, y, z)
        pts.push(x, y, z, x, y, z - sz * l)
      }
    }
    // Ruler ticks along the front edge, every 0.5 m, longer every metre.
    for (let x = -w; x <= w + 1e-6; x += 0.5) {
      const major = Math.abs(x % 1) < 1e-6
      pts.push(x, y, d + 0.12, x, y, d + (major ? 0.36 : 0.22))
    }
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new Float32BufferAttribute(pts, 3))
    return geometry
  }, [room.width, room.depth])
}

export function LabRoom({ room }: { room: RoomDimensions }) {
  const { width: w, height: h, depth: d } = room
  const edges = useBoundaryGeometry(room)
  const marks = useMarksGeometry(room)
  const gridMaterial = useMemo(
    () =>
      new ShaderMaterial({
        uniforms: {
          uColor: { value: new Color(PALETTE.ink) },
          uHalf: { value: [w / 2, d / 2] },
          uSpacing: { value: 0.5 },
        },
        vertexShader: dotGridVertex,
        fragmentShader: dotGridFragment,
        transparent: true,
        depthWrite: false,
      }),
    [w, d],
  )

  useEffect(
    () => () => {
      edges.dispose()
      marks.dispose()
      gridMaterial.dispose()
    },
    [edges, marks, gridMaterial],
  )

  return (
    <group>
      {/* Static collision boundaries */}
      <RigidBody type="fixed" colliders={false} friction={0.7} restitution={0.25}>
        <CuboidCollider args={[w / 2 + WALL, WALL / 2, d / 2 + WALL]} position={[0, -WALL / 2, 0]} friction={0.75} restitution={0.25} />
        <CuboidCollider args={[w / 2 + WALL, WALL / 2, d / 2 + WALL]} position={[0, h + WALL / 2, 0]} friction={0.5} restitution={0.25} />
        <CuboidCollider args={[WALL / 2, h / 2 + WALL, d / 2 + WALL]} position={[-w / 2 - WALL / 2, h / 2, 0]} friction={0.5} restitution={0.3} />
        <CuboidCollider args={[WALL / 2, h / 2 + WALL, d / 2 + WALL]} position={[w / 2 + WALL / 2, h / 2, 0]} friction={0.5} restitution={0.3} />
        <CuboidCollider args={[w / 2 + WALL, h / 2 + WALL, WALL / 2]} position={[0, h / 2, -d / 2 - WALL / 2]} friction={0.5} restitution={0.3} />
        <CuboidCollider args={[w / 2 + WALL, h / 2 + WALL, WALL / 2]} position={[0, h / 2, d / 2 + WALL / 2]} friction={0.5} restitution={0.3} />
      </RigidBody>

      {/* Shadow catcher: invisible floor that only shows soft shadows */}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[80, 80]} />
        <shadowMaterial transparent opacity={0.2} color="#3b2f2a" />
      </mesh>

      {/* Dot grid */}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.002, 0]} material={gridMaterial} renderOrder={1}>
        <planeGeometry args={[w, d]} />
      </mesh>

      {/* Hairline boundary drawing */}
      <lineSegments geometry={edges}>
        <lineBasicMaterial color={PALETTE.ink} transparent opacity={0.13} depthWrite={false} />
      </lineSegments>
      <lineSegments geometry={marks}>
        <lineBasicMaterial color={PALETTE.ink} transparent opacity={0.45} depthWrite={false} />
      </lineSegments>
    </group>
  )
}
