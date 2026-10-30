import { useSyncExternalStore } from 'react'
import type { BodyDescriptor, GravityMode, ObjectKind, RoomDimensions } from './physicsConfig'

/**
 * A tiny external store for *presentation* state: which mode is selected,
 * which panels are open, which bodies exist in the scene graph.
 *
 * Per-frame physics data (transforms, velocities, history) never lives here —
 * that is owned by the imperative `physicsController` so React never re-renders
 * at simulation rate.
 */

export type Polarity = 'attract' | 'repel'
export type TimeMode = 'live' | 'scrub' | 'rewind'

export interface UIState {
  ready: boolean
  gravity: GravityMode
  paused: boolean
  slowMo: boolean
  timeMode: TimeMode
  /** Seconds behind "now" that the scrubber currently points at (>= 0). */
  scrubOffset: number
  /** Seconds of history currently available. */
  historyAvailable: number
  magnet: boolean
  polarity: Polarity
  /** True while Shift is held (temporary polarity flip). */
  shiftHeld: boolean
  sound: boolean
  bodies: BodyDescriptor[]
  room: RoomDimensions
  /** Increments on reset so every body remounts with its original transform. */
  resetKey: number
  /** Increments whenever chaos fires; UI uses it to trigger the pulse. */
  chaosTick: number
  /** Increments when a rewind is committed; UI uses it for the "TIME REWOUND" stamp. */
  rewindTick: number
  lastRewindSeconds: number
  dragging: boolean
  hasInteracted: boolean
  quality: 'high' | 'low'
  spawnKind: ObjectKind | 'random'
}

type Listener = () => void

function createStore<T extends object>(initial: T) {
  let state = initial
  const listeners = new Set<Listener>()
  return {
    get: () => state,
    set(partial: Partial<T> | ((s: T) => Partial<T>)) {
      const next = typeof partial === 'function' ? partial(state) : partial
      let changed = false
      for (const key in next) {
        if (!Object.is(next[key], state[key as keyof T])) {
          changed = true
          break
        }
      }
      if (!changed) return
      state = { ...state, ...next }
      listeners.forEach((l) => l())
    },
    subscribe(listener: Listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}

export const uiStore = createStore<UIState>({
  ready: false,
  gravity: 'earth',
  paused: false,
  slowMo: false,
  timeMode: 'live',
  scrubOffset: 0,
  historyAvailable: 0,
  magnet: false,
  polarity: 'attract',
  shiftHeld: false,
  sound: false,
  bodies: [],
  room: { width: 12, height: 7, depth: 7 },
  resetKey: 0,
  chaosTick: 0,
  rewindTick: 0,
  lastRewindSeconds: 0,
  dragging: false,
  hasInteracted: false,
  quality: 'high',
  spawnKind: 'random',
})

export function useUI<T>(selector: (s: UIState) => T): T {
  return useSyncExternalStore(
    uiStore.subscribe,
    () => selector(uiStore.get()),
    () => selector(uiStore.get()),
  )
}

/** Effective magnet polarity (Shift temporarily flips it). */
export function effectivePolarity(s: Pick<UIState, 'polarity' | 'shiftHeld'>): Polarity {
  if (!s.shiftHeld) return s.polarity
  return s.polarity === 'attract' ? 'repel' : 'attract'
}
