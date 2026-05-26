import { useEffect, useRef, useCallback } from 'react'
import { registerSignalingHandler } from './useSignaling'
import { useStore } from '../store'
import { SignalingMessage } from '../../shared/types'

const RTC_CONFIG: RTCConfiguration = {
  // Works for both LAN peers and multiple instances on localhost
  iceServers: [],
  iceCandidatePoolSize: 10,
}

// Detect if peer is on the same machine (loopback IP)
function isLoopback(ip: string): boolean {
  return ip === '127.0.0.1' || ip.startsWith('127.')
}

export function useWebRTC() {
  const store = useStore()
  const peerConnections  = useRef<Map<string, RTCPeerConnection>>(new Map())
  const cancelledPeers   = useRef<Set<string>>(new Set())   // peers we've hung up on THIS call
  const callSessionId    = useRef<string>('')                // unique per call, clears stale signals
  const localStream = useRef<MediaStream | null>(null)
  const audioCtx = useRef<AudioContext | null>(null)
  const speakingTimers = useRef<Map<string, NodeJS.Timeout>>(new Map())

  // Get mic stream
  const getLocalStream = useCallback(async () => {
    if (localStream.current) return localStream.current
    try {
      const constraints: MediaStreamConstraints = {
        audio: store.settings.micDeviceId !== 'default'
          ? { deviceId: { exact: store.settings.micDeviceId } }
          : true,
        video: false,
      }
      const stream = await navigator.mediaDevices.getUserMedia(constraints)
      localStream.current = stream
      return stream
    } catch (e) {
      console.error('Mic access error:', e)
      return null
    }
  }, [store.settings.micDeviceId])

  // Audio elements per peer — kept alive in module scope
  const audioElements = useRef<Map<string, HTMLAudioElement>>(new Map())

  // Setup audio pipeline for remote track
  const setupRemoteAudio = useCallback((peerId: string, stream: MediaStream) => {
    // Resume AudioContext if suspended (needed for speaking detection)
    if (audioCtx.current?.state === 'suspended') {
      audioCtx.current.resume()
    }

    // Use HTML Audio element for reliable playback (same approach as audio test)
    let el = audioElements.current.get(peerId)
    if (!el) {
      el = document.createElement('audio')
      el.autoplay = true
      el.volume = store.callParticipants.get(peerId)?.volume ?? 1
      document.body.appendChild(el)
      audioElements.current.set(peerId, el)
    }
    el.srcObject = stream
    el.play().then(() => {
      console.log('[WebRTC] Audio playing for peer', peerId)
    }).catch(err => {
      console.error('[WebRTC] Audio play failed:', err)
    })

    // Speaking detection via separate AudioContext analyser
    try {
      const ctx = audioCtx.current ?? new AudioContext()
      audioCtx.current = ctx

      // Resume if needed
      if (ctx.state === 'suspended') ctx.resume()

      const source = ctx.createMediaStreamSource(stream)
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 256
      const dataArray = new Uint8Array(analyser.frequencyBinCount)
      source.connect(analyser)
      // NOTE: NOT connected to ctx.destination — audio goes through el, not ctx
      // This avoids double playback

      store.setParticipantGain(peerId, ctx.createGain()) // dummy gain for volume control via el

      const detectSpeaking = () => {
        analyser.getByteFrequencyData(dataArray)
        const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length
        const isSpeaking = avg > 15
        if (isSpeaking) {
          const existing = speakingTimers.current.get(peerId)
          if (existing) clearTimeout(existing)
          store.setParticipantSpeaking(peerId, true)
          const timer = setTimeout(() => store.setParticipantSpeaking(peerId, false), 500)
          speakingTimers.current.set(peerId, timer)
        }
        if (peerConnections.current.has(peerId)) requestAnimationFrame(detectSpeaking)
      }
      detectSpeaking()
    } catch (e) {
      console.warn('[WebRTC] Speaking detection setup failed:', e)
    }
  }, [store])

  // Add local mic tracks to an existing peer connection
  const addLocalTracks = useCallback(async (peerId: string) => {
    const pc = peerConnections.current.get(peerId)
    if (!pc) return
    const stream = await getLocalStream()
    if (stream) {
      stream.getTracks().forEach(track => pc.addTrack(track, stream))
    }
  }, [getLocalStream])

  // Create peer connection for a given peer — does NOT add local tracks yet
  const createPeerConnection = useCallback(async (peerId: string, isInitiator: boolean) => {
    const pc = new RTCPeerConnection(RTC_CONFIG)
    peerConnections.current.set(peerId, pc)

    // Handle remote tracks — only fires after both sides added tracks
    pc.ontrack = (event) => {
      const remoteStream = event.streams[0]
      store.addCallParticipant(peerId)
      setupRemoteAudio(peerId, remoteStream)
    }

    // ICE candidates
    pc.onicecandidate = (event) => {
      if (!event.candidate) return
      const peer = store.peers.get(peerId)
      if (!peer) return
      const msg: SignalingMessage = {
        type: 'ICE',
        from: store.selfId,
        to: peerId,
        payload: event.candidate.toJSON(),
      }
      window.electronAPI?.sendSignaling(peer.ip, peer.signalingPort, msg)
    }

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        hangupPeer(peerId)
      }
    }

    if (isInitiator) {
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)

      const peer = store.peers.get(peerId)
      if (peer) {
        const msg: SignalingMessage = {
          type: 'OFFER',
          from: store.selfId,
          to: peerId,
          payload: { type: offer.type, sdp: offer.sdp } as RTCSessionDescriptionInit,
        }
        window.electronAPI?.sendSignaling(peer.ip, peer.signalingPort, msg)
      }
    }

    return pc
  }, [store, getLocalStream, setupRemoteAudio])

  // Initiate a call
  const callPeer = useCallback(async (peerId: string) => {
    // New call session — clear stale cancelled peers from previous calls
    cancelledPeers.current.clear()
    callSessionId.current = Math.random().toString(36).slice(2)
    store.setStatus('calling')
    await createPeerConnection(peerId, true)
  }, [store, createPeerConnection])

  // Hangup a specific peer
  const hangupPeer = useCallback((peerId: string) => {
    const pc = peerConnections.current.get(peerId)
    if (pc) {
      pc.close()
      peerConnections.current.delete(peerId)
    }
    // Clean up audio element
    const el = audioElements.current.get(peerId)
    if (el) {
      el.srcObject = null
      el.pause()
      el.remove()
      audioElements.current.delete(peerId)
    }
    store.removeCallParticipant(peerId)

    const peer = store.peers.get(peerId)
    if (peer) {
      const msg: SignalingMessage = { type: 'HANGUP', from: store.selfId, to: peerId }
      window.electronAPI?.sendSignaling(peer.ip, peer.signalingPort, msg)
    }
  }, [store])

  // Set volume for a peer via their audio element
  const setPeerVolume = useCallback((peerId: string, volume: number) => {
    const el = audioElements.current.get(peerId)
    if (el) el.volume = Math.max(0, Math.min(1, volume))
  }, [])

  // End entire call
  const endCall = useCallback(() => {
    // Notify ALL known call participants (direct connections + others in the list)
    // so even peers without a direct PC know we left
    const allParticipantIds = Array.from(useStore.getState().callParticipants.keys()) as string[]
    const directPeerIds = Array.from(peerConnections.current.keys())

    // Send HANGUP to everyone we know about in this call
    const toNotify = new Set([...allParticipantIds, ...directPeerIds, ...Array.from(store.selectedPeerIds)])
    toNotify.delete(store.selfId)

    for (const peerId of toNotify) {
      const peer = store.peers.get(peerId)
      if (peer) {
        window.electronAPI?.sendSignaling(peer.ip, peer.signalingPort, {
          type: 'HANGUP', from: store.selfId, to: peerId,
        })
      }
    }

    // Close all peer connections
    for (const peerId of directPeerIds) {
      const pc = peerConnections.current.get(peerId)
      if (pc) { pc.close(); peerConnections.current.delete(peerId) }
      const el = audioElements.current.get(peerId)
      if (el) { el.srcObject = null; el.pause(); el.remove(); audioElements.current.delete(peerId) }
    }

    localStream.current?.getTracks().forEach((t) => t.stop())
    localStream.current = null
    audioElements.current.clear()
    cancelledPeers.current.clear()
    callSessionId.current = ''
    store.clearCall()
  }, [store])

  // Mute/unmute mic
  const toggleMute = useCallback(() => {
    const stream = localStream.current
    if (stream) {
      const audioTrack = stream.getAudioTracks()[0]
      if (audioTrack) {
        audioTrack.enabled = store.micMuted // toggle (will invert)
      }
    }
    store.toggleMicMute()
  }, [store])

  // Handle incoming signaling messages
  const handleSignaling = useCallback(async (msg: SignalingMessage) => {
    const { type, from } = msg

    if (type === 'CALL_REQUEST') {
      store.setIncomingCall(from)
    }

    if (type === 'CALL_ACCEPT') {
      store.setIncomingCall(null)
      store.setStatus('in-call')
      // initiator already created PC, now both are in call
    }

    if (type === 'CALL_REJECT') {
      store.setIncomingCall(null)
      // Remove the rejecting peer's PC and participant slot
      const rejectPc = peerConnections.current.get(from)
      if (rejectPc) { rejectPc.close(); peerConnections.current.delete(from) }
      store.removeCallParticipant(from)
      // Only clear the entire call if nobody else is connected
      if (peerConnections.current.size === 0 && store.status !== 'in-call') {
        store.clearCall()
      }
    }

    if (type === 'OFFER') {
      // Ignore OFFER if caller already hung up, or we rejected this call
      if (cancelledPeers.current.has(from) || store.incomingCallFrom === null && store.status !== 'in-call') {
        console.log('[WebRTC] Ignoring stale OFFER from', from)
        return
      }
      // Create PC without adding local tracks yet — tracks added in acceptCall
      const pc = await createPeerConnection(from, false)
      await pc.setRemoteDescription({ type: msg.payload.type, sdp: msg.payload.sdp })
      // Store the offer so acceptCall can create the answer
      ;(pc as any).__pendingOffer = true
    }

    if (type === 'ANSWER') {
      if (cancelledPeers.current.has(from)) {
        console.log('[WebRTC] Ignoring stale ANSWER from', from)
        return
      }
      const pc = peerConnections.current.get(from)
      if (pc) {
        await addLocalTracks(from)
        await pc.setRemoteDescription({ type: msg.payload.type, sdp: msg.payload.sdp })
        store.addCallParticipant(store.selfId)
        store.addCallParticipant(from)
        store.setStatus('in-call')

        // Build participant list AFTER store updates — include self + all current + new joiner
        // We read fresh from store after update
        const currentParticipants = Array.from(useStore.getState().callParticipants.keys())
        // Make sure self and new participant are included
        const participantSet = new Set([...currentParticipants, store.selfId, from])
        const participantIds = Array.from(participantSet)

        // Broadcast to every participant (except self)
        for (const pid of participantIds) {
          if (pid === store.selfId) continue
          const peer = store.peers.get(pid)
          if (peer) {
            window.electronAPI?.sendSignaling(peer.ip, peer.signalingPort, {
              type: 'CALL_PARTICIPANT_LIST',
              from: store.selfId,
              to: pid,
              participantIds,
            })
          }
        }
      }
    }

    // Callee accepted — U1 now knows U2 is officially in
    if (type === 'CALL_ACCEPT') {
      console.log('[WebRTC] CALL_ACCEPT from', from)
      store.addCallParticipant(from)
      store.addCallParticipant(store.selfId)
      store.setStatus('in-call')
    }

    // Callee rejected
    if (type === 'CALL_REJECT') {
      const pc = peerConnections.current.get(from)
      if (pc) { pc.close(); peerConnections.current.delete(from) }
      store.removeCallParticipant(from)
      if (store.incomingCallFrom === from) store.setIncomingCall(null)
      cancelledPeers.current.add(from)
      if (peerConnections.current.size === 0 && store.status !== 'in-call') {
        store.clearCall()
      }
    }

    // Sync participant list — replaces current list so removals work too
    if (type === 'CALL_PARTICIPANT_LIST') {
      console.log('[WebRTC] CALL_PARTICIPANT_LIST:', msg.participantIds)
      // Add new participants
      for (const id of msg.participantIds) {
        store.addCallParticipant(id)
      }
      // Remove participants no longer in the list (someone left)
      const currentIds = Array.from(useStore.getState().callParticipants.keys()) as string[]
      for (const id of currentIds) {
        if (!msg.participantIds.includes(id)) {
          store.removeCallParticipant(id)
        }
      }
    }

    if (type === 'ICE') {
      const pc = peerConnections.current.get(from)
      if (pc) {
        await pc.addIceCandidate(new RTCIceCandidate(msg.payload))
      }
    }

    if (type === 'HANGUP') {
      const pc = peerConnections.current.get(from)
      if (pc) {
        pc.close()
        peerConnections.current.delete(from)
      }
      const hangupEl = audioElements.current.get(from)
      if (hangupEl) {
        hangupEl.srcObject = null; hangupEl.pause(); hangupEl.remove()
        audioElements.current.delete(from)
      }

      // Build remaining list BEFORE store update (while state is still accurate)
      // Filter out: the one who left (from) and ourselves (selfId)
      const beforeRemove = Array.from(useStore.getState().callParticipants.keys()) as string[]
      const remainingAfter = beforeRemove.filter(id => id !== from && id !== store.selfId)

      store.removeCallParticipant(from)
      if (store.incomingCallFrom === from) store.setIncomingCall(null)
      // Don't add to cancelledPeers here — that would block next call from same peer

      // If we have remaining participants — notify them who is still in the call
      // This covers the case where U3 has no direct connection to U2
      if (remainingAfter.length > 0) {
        const updatedList = [store.selfId, ...remainingAfter]
        for (const pid of remainingAfter) {
          const peer = store.peers.get(pid)
          if (peer) {
            window.electronAPI?.sendSignaling(peer.ip, peer.signalingPort, {
              type: 'CALL_PARTICIPANT_LIST',
              from: store.selfId,
              to: pid,
              participantIds: updatedList,
            })
          }
        }
      }

      if (peerConnections.current.size === 0) {
        store.clearCall()
      }
    }
  }, [store, createPeerConnection])

  // Accept incoming call
  const acceptCall = useCallback(async (peerId: string) => {
    // New call session — clear stale cancelled peers from previous calls
    cancelledPeers.current.clear()
    callSessionId.current = Math.random().toString(36).slice(2)
    store.setIncomingCall(null)
    store.setStatus('in-call')
    store.addCallParticipant(store.selfId)
    store.addCallParticipant(peerId)
    // Add mic tracks now that user accepted
    await addLocalTracks(peerId)

    // Create and send answer (was deferred from OFFER handler)
    const pc = peerConnections.current.get(peerId)
    if (pc && (pc as any).__pendingOffer) {
      delete (pc as any).__pendingOffer
      store.setStatus('in-call')
      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)
      const peer = store.peers.get(peerId)
      if (peer) {
        const answerMsg: SignalingMessage = {
          type: 'ANSWER',
          from: store.selfId,
          to: peerId,
          payload: { type: answer.type, sdp: answer.sdp } as RTCSessionDescriptionInit,
        }
        window.electronAPI?.sendSignaling(peer.ip, peer.signalingPort, answerMsg)
      }
    }

    const peer = store.peers.get(peerId)
    if (peer) {
      const msg: SignalingMessage = { type: 'CALL_ACCEPT', from: store.selfId, to: peerId }
      window.electronAPI?.sendSignaling(peer.ip, peer.signalingPort, msg)
    }
  }, [store])

  const rejectCall = useCallback((peerId: string) => {
    store.setIncomingCall(null)
    const pc = peerConnections.current.get(peerId)
    if (pc) { pc.close(); peerConnections.current.delete(peerId) }
    cancelledPeers.current.add(peerId)  // ignore any late OFFER from this peer
    store.clearCall()
    const peer = store.peers.get(peerId)
    if (peer) {
      const msg: SignalingMessage = { type: 'CALL_REJECT', from: store.selfId, to: peerId }
      window.electronAPI?.sendSignaling(peer.ip, peer.signalingPort, msg)
    }
  }, [store])

  // Register with central dispatcher
  useEffect(() => {
    return registerSignalingHandler('webrtc', handleSignaling)
  }, [handleSignaling])

  return { callPeer, endCall, toggleMute, acceptCall, rejectCall, hangupPeer, setPeerVolume }
}
