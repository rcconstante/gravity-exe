import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import gsap from 'gsap'
import { MathUtils, Vector3, type PerspectiveCamera } from 'three'
import { uiStore, useUI } from '../lib/store'
import { prefersReducedMotion } from '../lib/device'

const ELEVATION = MathUtils.degToRad(13)

interface Layout {
  distance: number
  target: Vector3
  offsetX: number
  offsetY: number
}

/**
 * Frames the laboratory for any viewport, shifts it off-centre on wide screens
 * (leaving room for the editorial headline), and plays the opening camera move.
 */
export function CameraRig() {
  const camera = useThree((s) => s.camera) as PerspectiveCamera
  const size = useThree((s) => s.size)
  const room = useUI((s) => s.room)
  const controlsRef = useRef<{ target: Vector3; update: () => void; minDistance: number; maxDistance: number } | null>(null)
  const intro = useRef({ progress: prefersReducedMotion() ? 1 : 0, done: prefersReducedMotion() })

  const layout = useMemo<Layout>(() => {
    const { width: w, height: h } = size
    const aspect = w / h
    const wide = w > 900 || (w > 760 && h <= 520)
    const vFov = MathUtils.degToRad(camera.fov)
    // Pixels reserved for the editorial overlay and the control dock, per breakpoint.
    const left = wide ? Math.min(w * 0.36, 560) : 0
    const right = wide ? 24 : 0
    const top = w <= 760 ? 240 : wide ? 90 : 350
    const bottom = h <= 520 && w > 760 ? 140 : w <= 760 ? 180 : w <= 1320 ? 170 : 120
    const bandW = Math.max(w * 0.4, w - left - right)
    const bandH = Math.max(h * 0.35, h - top - bottom)
    // Fit the room inside the free band, then slide the projection so it is centred there.
    const needW = (room.width * 1.06) / (bandW / w)
    const needH = (room.height * 1.1) / (bandH / h)
    const tanHalf = Math.tan(vFov / 2)
    const distance = Math.max(needH / 2 / tanHalf, needW / 2 / (tanHalf * aspect)) + room.depth * 0.5
    const centerX = left + bandW / 2
    const centerY = top + bandH / 2
    return {
      distance,
      target: new Vector3(0, room.height * 0.46, 0),
      offsetX: -(centerX - w / 2) / w,
      offsetY: -(centerY - h / 2) / h,
    }
  }, [size, room, camera.fov])

  // Asymmetric framing via the camera's view offset.
  useLayoutEffect(() => {
    camera.setViewOffset(
      size.width,
      size.height,
      layout.offsetX * size.width,
      layout.offsetY * size.height,
      size.width,
      size.height,
    )
    camera.updateProjectionMatrix()
    return () => camera.clearViewOffset()
  }, [camera, size.width, size.height, layout.offsetX, layout.offsetY])

  // Keep distance limits and current zoom consistent with the new framing.
  useEffect(() => {
    const controls = controlsRef.current
    if (!controls) return
    controls.minDistance = layout.distance * 0.62
    controls.maxDistance = layout.distance * 1.3
    controls.target.copy(layout.target)
    if (intro.current.done) {
      const dir = camera.position.clone().sub(layout.target).normalize()
      camera.position.copy(layout.target).addScaledVector(dir, layout.distance)
      controls.update()
    }
  }, [layout, camera])

  // Opening move: a slow descending arc into place.
  useEffect(() => {
    if (intro.current.done) {
      uiStore.set({ ready: true })
      return
    }
    const tween = gsap.to(intro.current, {
      progress: 1,
      duration: 2.8,
      delay: 0.15,
      ease: 'power3.inOut',
      onComplete: () => {
        intro.current.done = true
        uiStore.set({ ready: true })
      },
    })
    return () => {
      tween.kill()
    }
  }, [])

  useFrame(() => {
    const state = intro.current
    if (state.done && state.progress >= 1 && camera.userData.introApplied) return
    const p = state.progress
    const distance = layout.distance * MathUtils.lerp(1.75, 1, p)
    const elevation = MathUtils.lerp(MathUtils.degToRad(42), ELEVATION, p)
    const azimuth = MathUtils.lerp(-0.55, 0, p)
    camera.position.set(
      layout.target.x + Math.sin(azimuth) * Math.cos(elevation) * distance,
      layout.target.y + Math.sin(elevation) * distance,
      layout.target.z + Math.cos(azimuth) * Math.cos(elevation) * distance,
    )
    camera.lookAt(layout.target)
    controlsRef.current?.target.copy(layout.target)
    if (p >= 1) {
      camera.userData.introApplied = true
      controlsRef.current?.update()
    }
  })

  return (
    <OrbitControls
      ref={controlsRef as never}
      makeDefault
      enablePan={false}
      enableDamping
      dampingFactor={0.08}
      rotateSpeed={0.55}
      zoomSpeed={0.6}
      minPolarAngle={Math.PI / 2 - 0.75}
      maxPolarAngle={Math.PI / 2 - 0.02}
      minAzimuthAngle={-0.85}
      maxAzimuthAngle={0.85}
      enabled={false}
    />
  )
}
