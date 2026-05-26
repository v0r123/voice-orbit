import { useState } from 'react'
import { useStore } from '../../store'
import styles from './CallOverlay.module.css'

interface Props {
  onEndCall: () => void
  onToggleMute: () => void
  onSetVolume?: (peerId: string, vol: number) => void
}

export function CallOverlay({ onEndCall, onToggleMute, onSetVolume }: Props) {
  const { callParticipants, peers, micMuted, selfName, selfColor, localNicknames } = useStore()
  const displayName = (peerId: string, fallback: string) => localNicknames.get(peerId) ?? fallback
  const { setParticipantVolume } = useStore()
  const [expanded, setExpanded] = useState(false)

  const participants = Array.from(callParticipants.values()) as any[]

  return (
    <div className={`${styles.overlay} ${expanded ? styles.expanded : ''}`}>
      <div className={styles.header} onClick={() => setExpanded((v) => !v)}>
        <div className={styles.callIndicator}>
          <span className={styles.dot} />
          <span>In Call</span>
          <span className={styles.count}>{participants.length}</span>
        </div>
        <button className={styles.expandBtn}>{expanded ? '▼' : '▲'}</button>
      </div>

      {expanded && (
        <div className={styles.body}>
          <div className={styles.participants}>
            {/* Self */}
            <div className={styles.participant}>
              <div
                className={styles.avatar}
                style={{ background: selfColor, boxShadow: `0 0 12px ${selfColor}88` }}
              >
                {selfName.charAt(0).toUpperCase()}
              </div>
              <div className={styles.participantInfo}>
                <span className={styles.participantName}>{selfName} (You)</span>
                <span className={styles.participantStatus}>{micMuted ? '🔇 Muted' : '🎙 Speaking'}</span>
              </div>
            </div>

            {/* Remote peers */}
            {participants.map((p) => {
              const peer = peers.get(p.peerId)
              if (!peer) return null
              return (
                <div key={p.peerId} className={styles.participant}>
                  <div
                    className={`${styles.avatar} ${p.speaking ? styles.speaking : ''}`}
                    style={{
                      background: peer.color,
                      boxShadow: p.speaking
                        ? `0 0 20px ${peer.color}`
                        : `0 0 8px ${peer.color}55`,
                    }}
                  >
                    {peer.name.charAt(0).toUpperCase()}
                  </div>
                  <div className={styles.participantInfo}>
                    <span className={styles.participantName}>{displayName(peer.id, peer.name)}</span>
                    <div className={styles.volumeRow}>
                      <span className={styles.volIcon}>🔊</span>
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.01}
                        value={p.volume}
                        onChange={(e) => {
                          const v = parseFloat(e.target.value)
                          setParticipantVolume(p.peerId, v)
                          onSetVolume?.(p.peerId, v)
                        }}
                        className={styles.volumeSlider}
                        style={{ '--color': peer.color } as React.CSSProperties}
                      />
                      <span className={styles.volValue}>{Math.round(p.volume * 100)}%</span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          <div className={styles.controls}>
            <button
              className={`${styles.ctrlBtn} ${micMuted ? styles.muted : ''}`}
              onClick={onToggleMute}
              title={micMuted ? 'Unmute' : 'Mute'}
            >
              {micMuted ? '🔇' : '🎙'}
              <span>{micMuted ? 'Unmute' : 'Mute'}</span>
            </button>

            <button
              className={`${styles.ctrlBtn} ${styles.endBtn}`}
              onClick={onEndCall}
              title="End Call"
            >
              📵
              <span>End Call</span>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
