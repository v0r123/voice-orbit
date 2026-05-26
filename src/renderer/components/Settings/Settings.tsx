import { useState, useEffect } from 'react'
import { useStore } from '../../store'
import { PLANET_COLORS } from '../../../shared/types'
import styles from './Settings.module.css'
import { THEMES } from '../../themes'

interface Props {
  onClose: () => void
  onCheckUpdates?: () => void
}

interface DeviceInfo {
  deviceId: string
  label: string
}

export function Settings({ onClose, onCheckUpdates }: Props) {
  const store = useStore()
  const { settings, updateSettings, selfColor, selfName, peers, localNicknames, setLocalNickname, appVersion, updateSharedFile } = store

  const [micDevices, setMicDevices]     = useState<DeviceInfo[]>([])
  const [outputDevices, setOutputDevices] = useState<DeviceInfo[]>([])
  const [testLevel, setTestLevel]       = useState(0)
  const [testing, setTesting]           = useState(false)
  const [localName, setLocalName]       = useState(settings.userName || selfName)
  const [localColor, setLocalColor]     = useState(settings.userColor || selfColor)
  const [checking, setChecking]         = useState(false)
  // nick edits: peerId → draft string
  const [nickDrafts, setNickDrafts]     = useState<Record<string, string>>(() => {
    const obj: Record<string, string> = {}
    for (const [id, nick] of localNicknames.entries()) obj[id] = nick
    return obj
  })

  useEffect(() => {
    navigator.mediaDevices.enumerateDevices().then((devices) => {
      setMicDevices(devices
        .filter(d => d.kind === 'audioinput')
        .map(d => ({ deviceId: d.deviceId, label: d.label || `Mic ${d.deviceId.slice(0, 6)}` })))
      setOutputDevices(devices
        .filter(d => d.kind === 'audiooutput')
        .map(d => ({ deviceId: d.deviceId, label: d.label || `Output ${d.deviceId.slice(0, 6)}` })))
    })
  }, [])

  // Mic test
  useEffect(() => {
    if (!testing) { setTestLevel(0); return }
    let animId: number
    let stream: MediaStream | null = null
    navigator.mediaDevices.getUserMedia({ audio: true }).then((s) => {
      stream = s
      const ctx = new AudioContext()
      const src = ctx.createMediaStreamSource(s)
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 256
      src.connect(analyser)
      const data = new Uint8Array(analyser.frequencyBinCount)
      const loop = () => {
        analyser.getByteFrequencyData(data)
        setTestLevel(data.reduce((a, b) => a + b, 0) / data.length / 128)
        animId = requestAnimationFrame(loop)
      }
      loop()
    })
    return () => { cancelAnimationFrame(animId); stream?.getTracks().forEach(t => t.stop()) }
  }, [testing])

  const handleSave = () => {
    // Save own profile
    updateSettings({ ...settings, userName: localName, userColor: localColor })
    window.electronAPI?.updateSettings({ userName: localName, userColor: localColor })
    // Save all nickname drafts
    for (const [peerId, nick] of Object.entries(nickDrafts)) {
      setLocalNickname(peerId, nick)
    }
    onClose()
  }

  const peerList = Array.from(peers.values()) as import('../../../shared/types').Peer[]

  return (
    <div className={styles.backdrop} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className={styles.panel}>
        <div className={styles.titleBar}>
          <span className={styles.title}>⚙ Settings</span>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        <div className={styles.content}>
          {/* ── Profile ── */}
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Profile</h3>

            <label className={styles.field}>
              <span className={styles.label}>Display Name</span>
              <input
                className={styles.input}
                value={localName}
                onChange={e => setLocalName(e.target.value)}
                maxLength={24}
                placeholder="Your name"
              />
            </label>

            <div className={styles.field}>
              <span className={styles.label}>Planet Color</span>
              <div className={styles.colorGrid}>
                {PLANET_COLORS.map(c => (
                  <button
                    key={c}
                    className={`${styles.colorSwatch} ${localColor === c ? styles.selected : ''}`}
                    style={{ background: c, boxShadow: localColor === c ? `0 0 14px ${c}` : 'none' }}
                    onClick={() => setLocalColor(c)}
                  />
                ))}
              </div>
            </div>
          </section>

          {/* ── Nicknames ── */}
          {peerList.length > 0 && (
            <section className={styles.section}>
              <h3 className={styles.sectionTitle}>Local Nicknames</h3>
              <p className={styles.sectionHint}>
                Visible only to you — rename peers to tell them apart
              </p>
              <div className={styles.nickList}>
                {peerList.map(peer => {
                  const draft = nickDrafts[peer.id] ?? ''
                  return (
                    <div key={peer.id} className={styles.nickRow}>
                      <div
                        className={styles.nickAvatar}
                        style={{ background: peer.color, boxShadow: `0 0 8px ${peer.color}66` }}
                      >
                        {peer.name.charAt(0).toUpperCase()}
                      </div>
                      <div className={styles.nickFields}>
                        <span className={styles.nickOriginal}>{peer.name}</span>
                        <input
                          className={styles.nickInput}
                          value={draft}
                          onChange={e => setNickDrafts(prev => ({ ...prev, [peer.id]: e.target.value }))}
                          placeholder="Set a nickname…"
                          maxLength={24}
                        />
                      </div>
                      {draft && (
                        <button
                          className={styles.nickClear}
                          onClick={() => setNickDrafts(prev => ({ ...prev, [peer.id]: '' }))}
                          title="Remove nickname"
                        >✕</button>
                      )}
                    </div>
                  )
                })}
              </div>
            </section>
          )}

          {/* ── Appearance ── */}
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Appearance</h3>
            <div className={styles.field}>
              <span className={styles.label}>Theme</span>
              <div className={styles.themeGrid}>
                {THEMES.map(theme => (
                  <button
                    key={theme.id}
                    className={`${styles.themeBtn} ${(settings.theme ?? 'deep-space') === theme.id ? styles.themeBtnActive : ''}`}
                    onClick={() => updateSettings({ theme: theme.id })}
                  >
                    <span className={styles.themeEmoji}>{theme.emoji}</span>
                    <span className={styles.themeName}>{theme.name}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className={styles.field}>
              <span className={styles.label}>Interface Scale</span>
              <div className={styles.scaleRow}>
                <span className={styles.scaleLabel}>A</span>
                <input
                  type="range"
                  min={0.75}
                  max={1.4}
                  step={0.05}
                  value={settings.uiScale ?? 1.0}
                  onChange={e => updateSettings({ uiScale: parseFloat(e.target.value) })}
                  className={styles.scaleSlider}
                />
                <span className={styles.scaleLabelLg}>A</span>
                <span className={styles.scaleValue}>{Math.round((settings.uiScale ?? 1.0) * 100)}%</span>
                <button
                  className={styles.scaleReset}
                  onClick={() => updateSettings({ uiScale: 1.0 })}
                  title="Reset to 100%"
                >↺</button>
              </div>
            </div>
          </section>

          {/* ── App Update ── */}
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>App Update</h3>

            <div className={styles.field}>
              <span className={styles.label}>Current Version</span>
              <span className={styles.versionBadge}>v{appVersion}</span>
            </div>

            <div className={styles.field}>
              <span className={styles.updateHint}>
                Updates are shared automatically over LAN when peers connect.
              </span>
            </div>

            <div className={styles.field}>
              <button
                className={styles.checkUpdateBtn}
                disabled={checking}
                onClick={async () => {
                  setChecking(true)
                  onCheckUpdates?.()
                  setTimeout(() => setChecking(false), 3000)
                }}
              >
                {checking ? 'Checking…' : '↻ Check for updates now'}
              </button>
            </div>
          </section>

          {/* ── Audio Input ── */}
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Audio Input</h3>

            <label className={styles.field}>
              <span className={styles.label}>Microphone</span>
              <select
                className={styles.select}
                value={settings.micDeviceId}
                onChange={e => updateSettings({ micDeviceId: e.target.value })}
              >
                <option value="default">Default</option>
                {micDevices.map(d => <option key={d.deviceId} value={d.deviceId}>{d.label}</option>)}
              </select>
            </label>

            <label className={styles.field}>
              <span className={styles.label}>Input Volume</span>
              <div className={styles.sliderRow}>
                <input type="range" min={0} max={2} step={0.05}
                  value={settings.inputVolume}
                  onChange={e => updateSettings({ inputVolume: parseFloat(e.target.value) })}
                  className={styles.slider}
                />
                <span className={styles.sliderVal}>{Math.round(settings.inputVolume * 100)}%</span>
              </div>
            </label>

            <div className={styles.field}>
              <span className={styles.label}>Mic Test</span>
              <div className={styles.testRow}>
                <button
                  className={`${styles.testBtn} ${testing ? styles.testing : ''}`}
                  onClick={() => setTesting(v => !v)}
                >
                  {testing ? '⏹ Stop' : '▶ Test Mic'}
                </button>
                <div className={styles.levelBar}>
                  <div className={styles.levelFill} style={{ width: `${Math.min(100, testLevel * 100)}%` }} />
                </div>
              </div>
            </div>
          </section>

          {/* ── Audio Output ── */}
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Audio Output</h3>

            <label className={styles.field}>
              <span className={styles.label}>Output Device</span>
              <select
                className={styles.select}
                value={settings.outputDeviceId}
                onChange={e => updateSettings({ outputDeviceId: e.target.value })}
              >
                <option value="default">Default</option>
                {outputDevices.map(d => <option key={d.deviceId} value={d.deviceId}>{d.label}</option>)}
              </select>
            </label>

            <label className={styles.field}>
              <span className={styles.label}>Output Volume</span>
              <div className={styles.sliderRow}>
                <input type="range" min={0} max={1} step={0.01}
                  value={settings.outputVolume}
                  onChange={e => updateSettings({ outputVolume: parseFloat(e.target.value) })}
                  className={styles.slider}
                />
                <span className={styles.sliderVal}>{Math.round(settings.outputVolume * 100)}%</span>
              </div>
            </label>
          </section>
        </div>

        <div className={styles.footer}>
          <button className={styles.cancelBtn} onClick={onClose}>Cancel</button>
          <button className={styles.saveBtn} onClick={handleSave}>Save Changes</button>
        </div>
      </div>
    </div>
  )
}
