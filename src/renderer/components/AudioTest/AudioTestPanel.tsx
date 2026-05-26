import { useState, useEffect, useCallback } from 'react'
import { useStore } from '../../store'
import { TestStatus } from '../../hooks/useAudioTest'
import styles from './AudioTestPanel.module.css'

interface Props {
  onClose:    () => void
  startTest:  (peerId: string, onStatus: (s: TestStatus, msg?: string) => void) => Promise<void>
  acceptTest: (peerId: string) => Promise<void>
  stopTest:   (peerId?: string) => void
}

const STATUS_LABEL: Record<TestStatus, string> = {
  idle:       'Select a peer and send a test tone',
  requesting: 'Waiting for peer to accept…',
  connecting: 'Establishing test connection…',
  sending:    'Sending tone → peer should hear it',
  receiving:  'Receiving tone from peer…',
  done:       'Test complete',
  error:      'Test failed',
}

const STATUS_COLOR: Record<TestStatus, string> = {
  idle:       'rgba(255,255,255,0.3)',
  requesting: '#ffaa22',
  connecting: '#4488ff',
  sending:    '#44ff88',
  receiving:  '#44ffcc',
  done:       '#88ff88',
  error:      '#ff6666',
}

export function AudioTestPanel({ onClose, startTest, acceptTest, stopTest }: Props) {
  // Auto-cancel test when panel closes
  const wrappedClose = useCallback(() => {
    stopTest()   // cancels any active test silently
    onClose()
  }, [onClose, stopTest])
  const store = useStore()

  const [selectedPeerId, setSelectedPeerId] = useState<string>('')
  const [status, setStatus]       = useState<TestStatus>('idle')
  const [statusMsg, setStatusMsg] = useState('')
  const [incomingFrom, setIncomingFrom] = useState<string | null>(null)

  const peers = Array.from(store.peers.values()) as import('../../../shared/types').Peer[]

  // AUDIO_TEST_REQUEST arrives via useAudioTest's central dispatcher callback
  useEffect(() => {
    // Expose setter so useAudioTest can notify this panel
    ;(window as any).__setAudioTestIncoming = (fromId: string | null) => setIncomingFrom(fromId)
    return () => { delete (window as any).__setAudioTestIncoming }
  }, [])

  const handleStart = useCallback(async () => {
    if (!selectedPeerId) return
    await startTest(selectedPeerId, (s: TestStatus, msg?: string) => {
      setStatus(s)
      setStatusMsg(msg ?? '')
    })
  }, [selectedPeerId, startTest])

  const handleAccept = useCallback(async () => {
    if (!incomingFrom) return
    setSelectedPeerId(incomingFrom)
    setIncomingFrom(null)
    setStatus('receiving')
    await acceptTest(incomingFrom)
  }, [incomingFrom, acceptTest])

  const handleDecline = useCallback(() => {
    setIncomingFrom(null)
  }, [])

  const handleStop = useCallback(() => {
    stopTest(selectedPeerId || undefined)
    setStatus('idle')
    setStatusMsg('')
  }, [selectedPeerId, stopTest])

  const isActive = status !== 'idle' && status !== 'done' && status !== 'error'
  const callerPeer = incomingFrom ? store.peers.get(incomingFrom) : null

  return (
    <div className={styles.backdrop} onClick={e => e.target === e.currentTarget && wrappedClose()}>
      <div className={styles.panel}>
        <div className={styles.titleBar}>
          <span className={styles.title}>🔊 Audio Test</span>
          <button className={styles.closeBtn} onClick={wrappedClose}>✕</button>
        </div>

        <div className={styles.body}>
          <p className={styles.desc}>
            Sends a test tone via WebRTC directly to another peer.
            If they hear it, your full audio path is working.
          </p>

          {/* Incoming test request */}
          {incomingFrom && callerPeer && (
            <div className={styles.incomingRequest}>
              <div className={styles.incomingAvatar}
                style={{ background: callerPeer.color, boxShadow: `0 0 12px ${callerPeer.color}` }}>
                {callerPeer.name.charAt(0).toUpperCase()}
              </div>
              <div className={styles.incomingInfo}>
                <div className={styles.incomingName}>{store.localNicknames.get(callerPeer.id) ?? callerPeer.name}</div>
                <div className={styles.incomingLabel}>wants to run an audio test</div>
              </div>
              <div className={styles.incomingBtns}>
                <button className={styles.acceptBtn} onClick={handleAccept}>Accept</button>
                <button className={styles.declineBtn} onClick={handleDecline}>Decline</button>
              </div>
            </div>
          )}

          {/* Peer selector */}
          <div className={styles.field}>
            <span className={styles.label}>Send test tone to</span>
            {peers.length === 0 ? (
              <div className={styles.noPeers}>No peers found on the network</div>
            ) : (
              <div className={styles.peerList}>
                {peers.map(p => (
                  <button
                    key={p.id}
                    className={`${styles.peerBtn} ${selectedPeerId === p.id ? styles.peerSelected : ''}`}
                    style={selectedPeerId === p.id ? { borderColor: p.color, boxShadow: `0 0 10px ${p.color}44` } : {}}
                    onClick={() => setSelectedPeerId(p.id)}
                    disabled={isActive}
                  >
                    <div className={styles.peerAvatar}
                      style={{ background: p.color }}>
                      {p.name.charAt(0).toUpperCase()}
                    </div>
                    <span>{store.localNicknames.get(p.id) ?? p.name}</span>
                    <span className={styles.peerIp}>{p.ip}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Status indicator */}
          <div className={styles.statusRow}>
            <div className={styles.statusDot} style={{ background: STATUS_COLOR[status], boxShadow: `0 0 8px ${STATUS_COLOR[status]}` }} />
            <div className={styles.statusText}>
              <div style={{ color: STATUS_COLOR[status] }}>{STATUS_LABEL[status]}</div>
              {statusMsg && <div className={styles.statusSub}>{statusMsg}</div>}
            </div>
          </div>

          {/* Tone visualizer — animated bars when sending/receiving */}
          {(status === 'sending' || status === 'receiving') && (
            <div className={styles.visualizer}>
              {Array.from({ length: 12 }).map((_, i) => (
                <div key={i} className={styles.bar}
                  style={{ animationDelay: `${i * 0.08}s`, background: status === 'sending' ? '#44ff88' : '#44ffcc' }} />
              ))}
            </div>
          )}

          {/* Action buttons */}
          <div className={styles.actions}>
            {!isActive ? (
              <button
                className={styles.startBtn}
                onClick={handleStart}
                disabled={!selectedPeerId}
              >
                ▶ Send Test Tone
              </button>
            ) : (
              <button className={styles.stopBtn} onClick={handleStop}>
                ⏹ Stop Test
              </button>
            )}
          </div>

          {/* Instructions */}
          <div className={styles.instructions}>
            <div className={styles.instrTitle}>How it works</div>
            <div className={styles.instrStep}><span>1</span> Select a peer and click Send Test Tone</div>
            <div className={styles.instrStep}><span>2</span> They accept the request on their side</div>
            <div className={styles.instrStep}><span>3</span> A sweep tone (440→880 Hz) plays through WebRTC</div>
            <div className={styles.instrStep}><span>4</span> If they hear it — audio is working end-to-end ✓</div>
          </div>
        </div>
      </div>
    </div>
  )
}
