import { useRef, useCallback, useEffect } from 'react'
import { useStore } from '../store'
import { SignalingMessage } from '../../shared/types'
import { registerSignalingHandler } from './useSignaling'

export type TestStatus =
  | 'idle'
  | 'requesting'
  | 'connecting'
  | 'sending'
  | 'receiving'
  | 'done'
  | 'error'

let testStatusCallback: ((s: TestStatus, msg?: string) => void) | null = null

// Persistent audio element — stays alive, not GC'd
let persistentAudio: HTMLAudioElement | null = null
function getAudioEl(): HTMLAudioElement {
  if (!persistentAudio) {
    persistentAudio = document.createElement('audio')
    persistentAudio.autoplay = true
    persistentAudio.volume = 1
    document.body.appendChild(persistentAudio)
  }
  return persistentAudio
}

export function useAudioTest() {
  const store    = useStore()
  const pcRef    = useRef<RTCPeerConnection | null>(null)
  const ctxRef   = useRef<AudioContext | null>(null)
  const oscRef   = useRef<OscillatorNode | null>(null)
  const statusRef = useRef<TestStatus>('idle')

  const setStatus = useCallback((s: TestStatus, msg?: string) => {
    statusRef.current = s
    testStatusCallback?.(s, msg)
  }, [])

  const cleanup = useCallback((notify = false) => {
    // Stop oscillator
    try { oscRef.current?.stop() } catch { /* ok */ }
    oscRef.current = null
    try { ctxRef.current?.close() } catch { /* ok */ }
    ctxRef.current = null

    // Close PC
    pcRef.current?.close()
    pcRef.current = null

    // Stop audio playback
    if (persistentAudio) {
      persistentAudio.srcObject = null
      persistentAudio.pause()
    }

    if (notify) {
      setStatus('idle')
      testStatusCallback = null
      ;(window as any).__setAudioTestIncoming?.(null)
    }
  }, [setStatus])

  // Repeating sweep tone via periodic scheduling
  const scheduleSweep = useCallback((ctx: AudioContext, dst: MediaStreamAudioDestinationNode) => {
    const PERIOD = 2.5 // seconds per sweep cycle

    const schedule = (startTime: number) => {
      if (!oscRef.current && ctxRef.current !== ctx) return // stopped

      const osc  = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      gain.gain.value = 0.35

      // 440→880→440 sweep
      osc.frequency.setValueAtTime(440, startTime)
      osc.frequency.linearRampToValueAtTime(880, startTime + PERIOD * 0.5)
      osc.frequency.linearRampToValueAtTime(440, startTime + PERIOD)

      osc.connect(gain)
      gain.connect(dst)
      osc.start(startTime)
      osc.stop(startTime + PERIOD)

      oscRef.current = osc

      // Schedule next sweep just before this one ends
      const delay = Math.max(0, (startTime + PERIOD - ctx.currentTime - 0.05) * 1000)
      setTimeout(() => {
        if (ctxRef.current === ctx) schedule(ctx.currentTime)
      }, delay)
    }

    schedule(ctx.currentTime)
  }, [])

  // ── Caller: send test request ───────────────────────────────────
  const startTest = useCallback(async (
    peerId: string,
    onStatus: (s: TestStatus, msg?: string) => void
  ) => {
    testStatusCallback = onStatus
    const peer = store.peers.get(peerId)
    console.log('[AudioTest] startTest', { peerId, peer, selfId: store.selfId })
    if (!peer) { onStatus('error', `Peer not found: ${peerId}`); return }

    cleanup()
    setStatus('requesting')

    const req: SignalingMessage = { type: 'AUDIO_TEST_REQUEST', from: store.selfId, to: peerId }
    console.log('[AudioTest] sending REQUEST to', peer.ip, peer.signalingPort)
    window.electronAPI?.sendSignaling(peer.ip, peer.signalingPort, req)
  }, [store, cleanup, setStatus])

  // ── Caller: remote accepted → build PC + stream tone ───────────
  const onTestAccepted = useCallback(async (peerId: string) => {
    const peer = store.peers.get(peerId)
    if (!peer) return
    setStatus('connecting')

    const pc  = new RTCPeerConnection({ iceServers: [], iceCandidatePoolSize: 10 })
    const ctx = new AudioContext()
    const dst = ctx.createMediaStreamDestination()
    pcRef.current  = pc
    ctxRef.current = ctx

    scheduleSweep(ctx, dst)

    dst.stream.getTracks().forEach(t => pc.addTrack(t, dst.stream))

    pc.onicecandidate = (e) => {
      if (!e.candidate) return
      const msg: SignalingMessage = {
        type: 'AUDIO_TEST_ICE', from: store.selfId, to: peerId,
        payload: e.candidate.toJSON(),
      }
      window.electronAPI?.sendSignaling(peer.ip, peer.signalingPort, msg)
    }

    pc.onconnectionstatechange = () => {
      console.log('[AudioTest] connection state:', pc.connectionState)
      if (pc.connectionState === 'connected') setStatus('sending', 'Tone playing on remote — they should hear it now')
      if (pc.connectionState === 'failed')    { setStatus('error', 'Connection failed'); cleanup() }
    }

    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)
    // Serialize explicitly — RTCSessionDescription loses methods over IPC
    const payload = { type: offer.type, sdp: offer.sdp }
    const msg: SignalingMessage = { type: 'AUDIO_TEST_OFFER', from: store.selfId, to: peerId, payload: payload as RTCSessionDescriptionInit }
    window.electronAPI?.sendSignaling(peer.ip, peer.signalingPort, msg)
  }, [store, setStatus, cleanup, scheduleSweep])

  // ── Receiver: accept request → send ACCEPT ────────────────────
  const acceptTest = useCallback(async (peerId: string) => {
    const peer = store.peers.get(peerId)
    if (!peer) return
    const msg: SignalingMessage = { type: 'AUDIO_TEST_ACCEPT', from: store.selfId, to: peerId }
    window.electronAPI?.sendSignaling(peer.ip, peer.signalingPort, msg)
  }, [store])

  // ── Receiver: incoming OFFER → build PC + play audio ──────────
  const onTestOffer = useCallback(async (peerId: string, offer: RTCSessionDescriptionInit) => {
    const peer = store.peers.get(peerId)
    if (!peer) return
    setStatus('receiving', `Receiving tone from ${store.localNicknames.get(peer.id) ?? peer.name}…`)

    const pc = new RTCPeerConnection({ iceServers: [], iceCandidatePoolSize: 10 })
    pcRef.current = pc

    pc.ontrack = (e) => {
      console.log('[AudioTest] ontrack fired, streams:', e.streams.length)
      const el = getAudioEl()
      el.srcObject = e.streams[0]
      el.play()
        .then(() => {
          console.log('[AudioTest] audio.play() OK')
          setStatus('receiving', '🔊 You should hear a sweep tone now!')
        })
        .catch(err => {
          console.error('[AudioTest] audio.play() failed:', err)
          setStatus('error', `Playback failed: ${err.message}`)
        })
    }

    pc.onicecandidate = (e) => {
      if (!e.candidate) return
      const msg: SignalingMessage = {
        type: 'AUDIO_TEST_ICE', from: store.selfId, to: peerId,
        payload: e.candidate.toJSON(),
      }
      window.electronAPI?.sendSignaling(peer.ip, peer.signalingPort, msg)
    }

    pc.onconnectionstatechange = () => {
      console.log('[AudioTest] receiver connection state:', pc.connectionState)
    }

    await pc.setRemoteDescription({ type: offer.type, sdp: offer.sdp })
    const answer = await pc.createAnswer()
    await pc.setLocalDescription(answer)
    const answerPayload = { type: answer.type, sdp: answer.sdp }
    const msg: SignalingMessage = { type: 'AUDIO_TEST_ANSWER', from: store.selfId, to: peerId, payload: answerPayload as RTCSessionDescriptionInit }
    window.electronAPI?.sendSignaling(peer.ip, peer.signalingPort, msg)
  }, [store, setStatus])

  const onTestAnswer = useCallback(async (_from: string, answer: RTCSessionDescriptionInit) => {
    const pc = pcRef.current
    if (!pc) return
    await pc.setRemoteDescription({ type: answer.type, sdp: answer.sdp })
  }, [])

  const onTestIce = useCallback(async (_from: string, candidate: RTCIceCandidateInit) => {
    const pc = pcRef.current
    if (!pc) return
    try { await pc.addIceCandidate(new RTCIceCandidate(candidate)) } catch { /* ok */ }
  }, [])

  const stopTest = useCallback((peerId?: string, sendEnd = !!peerId) => {
    if (sendEnd && peerId) {
      const peer = store.peers.get(peerId)
      if (peer) {
        const msg: SignalingMessage = { type: 'AUDIO_TEST_END', from: store.selfId, to: peerId }
        window.electronAPI?.sendSignaling(peer.ip, peer.signalingPort, msg)
      }
    }
    cleanup(true)
  }, [store, cleanup])

  // ── Central handler ────────────────────────────────────────────
  const handleAudioTestSignaling = useCallback(async (msg: SignalingMessage) => {
    if (!msg.type.startsWith('AUDIO_TEST')) return
    console.log('[AudioTest] received', msg.type, 'from', msg.from)

    if (msg.type === 'AUDIO_TEST_REQUEST') {
      ;(window as any).__setAudioTestIncoming?.(msg.from)
      return
    }
    if (msg.type === 'AUDIO_TEST_ACCEPT')  { await onTestAccepted(msg.from); return }
    if (msg.type === 'AUDIO_TEST_OFFER')   { await onTestOffer(msg.from, msg.payload); return }
    if (msg.type === 'AUDIO_TEST_ANSWER')  { await onTestAnswer(msg.from, msg.payload); return }
    if (msg.type === 'AUDIO_TEST_ICE')     { await onTestIce(msg.from, msg.payload); return }
    if (msg.type === 'AUDIO_TEST_END')     { cleanup(true); return }
  }, [onTestAccepted, onTestOffer, onTestAnswer, onTestIce, cleanup])

  useEffect(() => {
    return registerSignalingHandler('audiotest', handleAudioTestSignaling)
  }, [handleAudioTestSignaling])

  return { startTest, acceptTest, stopTest }
}
