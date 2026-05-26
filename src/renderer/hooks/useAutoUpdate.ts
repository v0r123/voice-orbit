import { useEffect, useCallback, useRef } from 'react'
import { useStore } from '../store'
import { SignalingMessage } from '../../shared/types'
import { registerSignalingHandler } from './useSignaling'

/** true if b is strictly newer than a (semver) */
function isNewer(a: string, b: string): boolean {
  const parse = (v: string) => v.replace(/^v/, '').split('.').map(n => parseInt(n, 10) || 0)
  const [aM, am, ap] = parse(a)
  const [bM, bm, bp] = parse(b)
  if (bM !== aM) return bM > aM
  if (bm !== am) return bm > am
  return bp > ap
}

export function useAutoUpdate() {
  const storeRef     = useRef(useStore.getState())
  const appVersionRef = useRef('1.0.0')
  // Collected responses: peerId → version
  const responsesRef  = useRef<Map<string, string>>(new Map())
  // Timeout handle for collecting phase
  const collectTimer  = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => useStore.subscribe(s => { storeRef.current = s }), [])

  // Pipe main-process diagnostics into renderer console
  useEffect(() => {
    window.electronAPI?.onUpdateDiagnostic?.((data: any) => {
      console.log('[AutoUpdate MAIN-DIAG]', JSON.stringify(data, null, 2))
    })
  }, [])

  // Load own version once
  useEffect(() => {
    window.electronAPI?.getAppVersion().then(v => {
      if (v) {
        appVersionRef.current = v
        useStore.getState().setAppVersion(v)
        console.log(`[AutoUpdate] My version: ${v}`)
      }
    })
  }, [])

  // ── Step 1: broadcast VERSION_QUERY to all peers ──────────────
  const queryAllPeers = useCallback(() => {
    const state = storeRef.current
    const peers = Array.from(state.peers.values()) as any[]
    if (peers.length === 0) {
      console.log('[AutoUpdate] No peers to query')
      return
    }
    responsesRef.current.clear()
    console.log(`[AutoUpdate] Querying ${peers.length} peer(s), my version: ${appVersionRef.current}`)

    for (const peer of peers) {
      const msg: SignalingMessage = { type: 'VERSION_QUERY', from: state.selfId, to: peer.id }
      window.electronAPI?.sendSignaling(peer.ip, peer.signalingPort, msg)
    }

    // Wait 3s for all responses, then pick the best
    if (collectTimer.current) clearTimeout(collectTimer.current)
    collectTimer.current = setTimeout(() => evaluateBestVersion(), 3000)
  }, [])

  // Auto-query 5s after startup
  useEffect(() => {
    const t = setTimeout(queryAllPeers, 5000)
    return () => clearTimeout(t)
  }, [queryAllPeers])

  // Manual check
  const checkForUpdates = useCallback(() => {
    storeRef.current.clearUpdateAvailable()
    queryAllPeers()
  }, [queryAllPeers])

  // ── Step 2: after collecting all responses, pick the newest ───
  const evaluateBestVersion = useCallback(() => {
    const myVersion = appVersionRef.current
    const responses = responsesRef.current

    if (responses.size === 0) {
      console.log('[AutoUpdate] No responses received')
      return
    }

    // Find the peer with the highest version
    let bestPeerId:  string | null = null
    let bestVersion: string = myVersion

    for (const [peerId, version] of responses) {
      if (isNewer(bestVersion, version)) {
        bestVersion = version
        bestPeerId  = peerId
      }
    }

    console.log(`[AutoUpdate] Best version found: ${bestVersion} (mine: ${myVersion}, from: ${bestPeerId ?? 'none'})`)

    if (!bestPeerId) {
      console.log('[AutoUpdate] Already up to date')
      return
    }

    // Request update package from the peer with the best version
    const state = storeRef.current
    const peer  = state.peers.get(bestPeerId)
    if (!peer) return

    console.log(`[AutoUpdate] Requesting update from ${peer.name} (v${bestVersion})`)
    const msg: SignalingMessage = { type: 'UPDATE_REQUEST', from: state.selfId, to: bestPeerId }
    window.electronAPI?.sendSignaling(peer.ip, peer.signalingPort, msg)
  }, [])

  // ── Signaling handler ─────────────────────────────────────────
  const handleSignaling = useCallback(async (msg: SignalingMessage) => {
    const state     = storeRef.current
    const myVersion = appVersionRef.current

    // ── Respond to version query ──────────────────────────────
    if (msg.type === 'VERSION_QUERY') {
      const peer = state.peers.get(msg.from)
      if (!peer) return
      console.log(`[AutoUpdate] VERSION_QUERY from ${peer.name} — responding with v${myVersion}`)
      const response: SignalingMessage = {
        type: 'VERSION_RESPONSE',
        from: state.selfId,
        to: msg.from,
        version: myVersion,
      }
      window.electronAPI?.sendSignaling(peer.ip, peer.signalingPort, response)
    }

    // ── Collect version responses ─────────────────────────────
    if (msg.type === 'VERSION_RESPONSE') {
      const peer = state.peers.get(msg.from)
      console.log(`[AutoUpdate] VERSION_RESPONSE from ${peer?.name ?? msg.from}: v${msg.version}`)
      responsesRef.current.set(msg.from, msg.version)
    }

    // ── Peer requests our update ──────────────────────────────
    if (msg.type === 'UPDATE_REQUEST') {
      const peer = state.peers.get(msg.from)
      if (!peer) return
      console.log(`[AutoUpdate] UPDATE_REQUEST from ${peer.name} — building package...`)

      const pkg = await window.electronAPI?.buildAndRegisterUpdate(myVersion)
      if (pkg) {
        const response: SignalingMessage = {
          type: 'UPDATE_READY',
          from: state.selfId,
          to: msg.from,
          fileId:   pkg.fileId,
          fileName: pkg.fileName,
          fileSize: pkg.fileSize,
          version:  pkg.version,
        }
        window.electronAPI?.sendSignaling(peer.ip, peer.signalingPort, response)
        console.log(`[AutoUpdate] UPDATE_READY sent to ${peer.name}: ${pkg.fileName}`)
      } else {
        const response: SignalingMessage = { type: 'UPDATE_UNAVAILABLE', from: state.selfId, to: msg.from }
        window.electronAPI?.sendSignaling(peer.ip, peer.signalingPort, response)
        console.log(`[AutoUpdate] UPDATE_UNAVAILABLE sent to ${peer.name} (dev mode or error)`)
      }
    }

    // ── Receive update offer ──────────────────────────────────
    if (msg.type === 'UPDATE_READY') {
      const peer = state.peers.get(msg.from)
      console.log(`[AutoUpdate] UPDATE_READY from ${peer?.name}: v${msg.version} (${(msg.fileSize/1024/1024).toFixed(1)} MB)`)

      // Only accept if still newer (another peer could have sent something even newer)
      if (!isNewer(myVersion, msg.version)) {
        console.log('[AutoUpdate] Ignoring — version not newer than ours')
        return
      }
      if (state.updateAvailable?.version === msg.version) return

      state.setUpdateAvailable({
        fromPeerId:   msg.from,
        fromName:     state.localNicknames.get(msg.from) ?? peer?.name ?? 'Unknown',
        version:      msg.version,
        fileId:       msg.fileId,
        fileName:     msg.fileName,
        fileSize:     msg.fileSize,
        peerIp:       peer?.ip ?? '',
        peerFilePort: peer?.filePort ?? 0,
      })
    }

    if (msg.type === 'UPDATE_UNAVAILABLE') {
      console.log(`[AutoUpdate] UPDATE_UNAVAILABLE from ${msg.from} — no package available`)
    }
  }, [])

  useEffect(() => {
    return registerSignalingHandler('autoupdate', handleSignaling)
  }, [handleSignaling])

  return { checkForUpdates }
}
