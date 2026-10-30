import { useEffect } from 'react'
import { useThree } from '@react-three/fiber'
import { Raycaster, Vector2, Vector3 } from 'three'
import { physicsController } from '../lib/physicsController'
import { uiStore } from '../lib/store'

interface ControlsLike {
  enabled: boolean
}

const ndc = new Vector2()
const hit = new Vector3()
const raycaster = new Raycaster()

/**
 * Drives drag-and-throw.
 *
 * A drag starts on a mesh's pointerdown (see PhysicsObject). From then on this hook
 * follows the pointer *anywhere* on the page: it casts a ray from the camera,
 * intersects the camera-facing drag plane, and feeds the point to the controller,
 * which steers the rigid body with a velocity-based spring every physics step.
 * Releasing the pointer throws the body using the recent pointer velocity.
 * Orbit controls are disabled for the duration of the drag.
 */
export function useObjectDrag() {
  const camera = useThree((s) => s.camera)
  const gl = useThree((s) => s.gl)
  const controls = useThree((s) => s.controls) as unknown as ControlsLike | null

  useEffect(() => {
    const el = gl.domElement

    const onMove = (e: PointerEvent) => {
      const drag = physicsController.drag
      if (!drag) return
      const rect = el.getBoundingClientRect()
      ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1)
      raycaster.setFromCamera(ndc, camera)
      if (raycaster.ray.intersectPlane(drag.plane, hit)) physicsController.updateDragTarget(hit)
    }

    const onUp = () => {
      if (!physicsController.drag) return
      physicsController.endDrag(true)
      delete document.body.dataset.cursor
    }

    window.addEventListener('pointermove', onMove, { passive: true })
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    window.addEventListener('blur', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      window.removeEventListener('blur', onUp)
    }
  }, [camera, gl])

  // Camera orbiting is suspended while an object is held.
  useEffect(() => {
    if (!controls) return
    const sync = () => {
      const s = uiStore.get()
      controls.enabled = !s.dragging && s.ready
    }
    sync()
    return uiStore.subscribe(sync)
  }, [controls])
}
