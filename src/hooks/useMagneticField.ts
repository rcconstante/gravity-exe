import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Plane, Raycaster, Vector2, Vector3 } from 'three'
import { physicsController } from '../lib/physicsController'
import { uiStore } from '../lib/store'

const raycaster = new Raycaster()
const ndc = new Vector2()
const hit = new Vector3()
const normal = new Vector3()
const plane = new Plane()

/**
 * Tracks where the magnet is.
 *
 * Mouse: the field is live while the pointer hovers the scene (not the UI).
 * Touch: the field is live while a finger is down on the scene.
 * The pointer ray is projected onto a camera-facing plane through the room's
 * centre and clamped inside the room. The forces themselves are applied by the
 * controller inside the fixed physics step.
 */
export function useMagneticField() {
  const gl = useThree((s) => s.gl)
  const camera = useThree((s) => s.camera)
  const pointer = useRef({ x: 0, y: 0, over: false, touchDown: false, touch: false })

  useEffect(() => {
    const el = gl.domElement
    const onMove = (e: PointerEvent) => {
      const p = pointer.current
      p.x = e.clientX
      p.y = e.clientY
      p.touch = e.pointerType !== 'mouse'
      p.over = e.target === el
    }
    const onDown = (e: PointerEvent) => {
      onMove(e)
      if (e.target === el) pointer.current.touchDown = true
    }
    const onUp = () => {
      pointer.current.touchDown = false
    }
    const onLeave = () => {
      pointer.current.over = false
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Shift') uiStore.set({ shiftHeld: e.type === 'keydown' })
    }
    window.addEventListener('pointermove', onMove, { passive: true })
    window.addEventListener('pointerdown', onDown, { passive: true })
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    document.addEventListener('pointerleave', onLeave)
    window.addEventListener('keydown', onKey)
    window.addEventListener('keyup', onKey)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      document.removeEventListener('pointerleave', onLeave)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('keyup', onKey)
    }
  }, [gl])

  useFrame((_, dt) => {
    const ui = uiStore.get()
    const p = pointer.current
    const magnet = physicsController.magnet
    const live = ui.magnet && ui.timeMode === 'live' && (p.touch ? p.touchDown : p.over)
    magnet.active = live
    magnet.level += ((live ? 1 : 0) - magnet.level) * Math.min(1, dt * 8)
    if (!live) return

    const rect = gl.domElement.getBoundingClientRect()
    ndc.set(((p.x - rect.left) / rect.width) * 2 - 1, -((p.y - rect.top) / rect.height) * 2 + 1)
    raycaster.setFromCamera(ndc, camera)
    const room = ui.room
    camera.getWorldDirection(normal).negate()
    plane.setFromNormalAndCoplanarPoint(normal, hit.set(0, room.height / 2, 0))
    if (!raycaster.ray.intersectPlane(plane, hit)) return
    hit.x = Math.max(-room.width / 2 + 0.3, Math.min(room.width / 2 - 0.3, hit.x))
    hit.y = Math.max(0.3, Math.min(room.height - 0.3, hit.y))
    hit.z = Math.max(-room.depth / 2 + 0.3, Math.min(room.depth / 2 - 0.3, hit.z))
    // Ease the field toward the pointer so it feels like a physical probe.
    magnet.point.lerp(hit, Math.min(1, dt * 18))
  })
}
