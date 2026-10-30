import type { MaterialClass } from './physicsConfig'

/**
 * Small synthesized collision voices built with the Web Audio API.
 * No samples are loaded — every sound is generated on demand, and the
 * AudioContext is only created after the visitor enables sound.
 */

interface Voice {
  /** Base frequency in Hz. */
  freq: number
  /** Partial ratios layered on top of the base frequency. */
  partials: number[]
  type: OscillatorType
  decay: number
  /** Amount of filtered noise mixed in for a "body" transient. */
  noise: number
  /** Pitch drop factor over the decay (rubber thuds sag). */
  bend: number
}

const VOICES: Record<MaterialClass, Voice> = {
  metal: { freq: 820, partials: [1, 2.76, 5.4], type: 'sine', decay: 0.55, noise: 0.08, bend: 1 },
  glass: { freq: 1760, partials: [1, 2.32, 4.25], type: 'sine', decay: 0.32, noise: 0.05, bend: 1 },
  rubber: { freq: 150, partials: [1, 1.5], type: 'sine', decay: 0.16, noise: 0.25, bend: 0.55 },
  acrylic: { freq: 620, partials: [1, 2.1], type: 'triangle', decay: 0.12, noise: 0.18, bend: 0.92 },
  lacquer: { freq: 330, partials: [1, 2.9], type: 'triangle', decay: 0.09, noise: 0.35, bend: 0.85 },
}

class CollisionAudio {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private noiseBuffer: AudioBuffer | null = null
  private recent: number[] = []
  enabled = false

  private ensure() {
    if (this.ctx) return this.ctx
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return null
    const ctx = new Ctor()
    const master = ctx.createGain()
    master.gain.value = 0.5
    const compressor = ctx.createDynamicsCompressor()
    compressor.threshold.value = -18
    compressor.ratio.value = 6
    master.connect(compressor).connect(ctx.destination)

    const buffer = ctx.createBuffer(1, ctx.sampleRate * 0.25, ctx.sampleRate)
    const channel = buffer.getChannelData(0)
    for (let i = 0; i < channel.length; i++) channel[i] = Math.random() * 2 - 1

    this.ctx = ctx
    this.master = master
    this.noiseBuffer = buffer
    return ctx
  }

  setEnabled(on: boolean) {
    this.enabled = on
    if (on) {
      const ctx = this.ensure()
      void ctx?.resume()
      // A soft confirmation chime so the toggle feels alive.
      this.play('glass', 0.35)
    } else {
      void this.ctx?.suspend()
    }
  }

  /** `intensity` is 0..1. */
  play(material: MaterialClass, intensity: number) {
    if (!this.enabled) return
    const ctx = this.ensure()
    if (!ctx || !this.master || !this.noiseBuffer) return

    const now = ctx.currentTime
    // Voice limiting: at most 8 voices in any 120 ms window.
    this.recent = this.recent.filter((t) => now - t < 0.12)
    if (this.recent.length >= 8) return
    this.recent.push(now)

    const voice = VOICES[material]
    const gainValue = Math.min(1, Math.max(0.04, intensity)) * 0.32
    const detune = 1 + (Math.random() - 0.5) * 0.06
    const out = ctx.createGain()
    out.gain.setValueAtTime(0.0001, now)
    out.gain.exponentialRampToValueAtTime(gainValue, now + 0.004)
    out.gain.exponentialRampToValueAtTime(0.0001, now + voice.decay)
    out.connect(this.master)

    voice.partials.forEach((ratio, i) => {
      const osc = ctx.createOscillator()
      const g = ctx.createGain()
      osc.type = voice.type
      const f = voice.freq * ratio * detune
      osc.frequency.setValueAtTime(f, now)
      osc.frequency.exponentialRampToValueAtTime(f * voice.bend, now + voice.decay)
      g.gain.value = 1 / (i * 1.8 + 1)
      osc.connect(g).connect(out)
      osc.start(now)
      osc.stop(now + voice.decay + 0.05)
    })

    if (voice.noise > 0) {
      const src = ctx.createBufferSource()
      src.buffer = this.noiseBuffer
      const filter = ctx.createBiquadFilter()
      filter.type = 'bandpass'
      filter.frequency.value = voice.freq * 2
      filter.Q.value = 1.4
      const g = ctx.createGain()
      g.gain.setValueAtTime(voice.noise * gainValue * 2, now)
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.05)
      src.connect(filter).connect(g).connect(this.master)
      src.start(now)
      src.stop(now + 0.06)
    }
  }

  /** A low whoosh used for chaos and rewinds. */
  sweep(up: boolean) {
    if (!this.enabled) return
    const ctx = this.ensure()
    if (!ctx || !this.master) return
    const now = ctx.currentTime
    const osc = ctx.createOscillator()
    const g = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(up ? 120 : 520, now)
    osc.frequency.exponentialRampToValueAtTime(up ? 520 : 90, now + 0.35)
    g.gain.setValueAtTime(0.0001, now)
    g.gain.exponentialRampToValueAtTime(0.12, now + 0.03)
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.4)
    osc.connect(g).connect(this.master)
    osc.start(now)
    osc.stop(now + 0.45)
  }

  dispose() {
    void this.ctx?.close()
    this.ctx = null
    this.master = null
  }
}

export const collisionAudio = new CollisionAudio()
