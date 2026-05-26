import { useEffect, useRef } from 'react'
import { useStore } from '../store'

// Generates a classic phone ringback tone (425 Hz on 1s / off 4s cadence)
export function useRingbackTone() {
  const status = useStore(s => s.status)
  const ctxRef  = useRef<AudioContext | null>(null)
  const timers  = useRef<ReturnType<typeof setTimeout>[]>([])
  const active  = useRef(false)

  const stop = () => {
    active.current = false
    timers.current.forEach(clearTimeout)
    timers.current = []
    try { ctxRef.current?.close() } catch { /* ok */ }
    ctxRef.current = null
  }

  const playBeep = (ctx: AudioContext, startAt: number) => {
    const osc  = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain); gain.connect(ctx.destination)

    osc.type = 'sine'
    osc.frequency.value = 425

    gain.gain.setValueAtTime(0, startAt)
    gain.gain.linearRampToValueAtTime(0.18, startAt + 0.02)
    gain.gain.setValueAtTime(0.18, startAt + 0.98)
    gain.gain.linearRampToValueAtTime(0, startAt + 1.0)

    osc.start(startAt)
    osc.stop(startAt + 1.05)
  }

  const startRingback = () => {
    if (active.current) return
    active.current = true
    ctxRef.current = new AudioContext()
    const ctx = ctxRef.current

    // Schedule repeating beeps: 1s tone, 4s silence → 5s cycle
    const schedule = () => {
      if (!active.current) return
      const now = ctx.currentTime
      playBeep(ctx, now)
      // next beep in 5 seconds
      const t = setTimeout(() => { if (active.current) schedule() }, 5000)
      timers.current.push(t)
    }
    schedule()
  }

  useEffect(() => {
    if (status === 'calling') {
      startRingback()
    } else {
      stop()
    }
    return stop
  }, [status])
}
