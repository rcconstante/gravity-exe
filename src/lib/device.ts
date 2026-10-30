/** Lightweight device / preference detection used to pick sensible defaults. */

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
}

export function isCoarsePointer(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches === true
}

export function hasWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas')
    return !!(canvas.getContext('webgl2') || canvas.getContext('webgl'))
  } catch {
    return false
  }
}

/**
 * Initial quality guess. Phones and low-core devices start on the "low" tier
 * (no transmission, smaller shadow maps); the PerformanceMonitor can still
 * downgrade a desktop that turns out to struggle.
 */
export function initialQuality(): 'high' | 'low' {
  if (typeof navigator === 'undefined') return 'high'
  const cores = navigator.hardwareConcurrency ?? 8
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8
  if (isCoarsePointer() && Math.min(window.innerWidth, window.innerHeight) < 600) return 'low'
  if (cores <= 4 || memory <= 4) return 'low'
  return 'high'
}

export function maxDpr(quality: 'high' | 'low'): number {
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio : 1
  return Math.min(dpr, quality === 'high' ? 2 : 1.5)
}
