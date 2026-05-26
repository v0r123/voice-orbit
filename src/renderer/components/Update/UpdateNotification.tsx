import { useState, useCallback, useEffect, useRef } from 'react'
import { useStore } from '../../store'
import styles from './UpdateNotification.module.css'

type Phase = 'prompt' | 'downloading' | 'confirm' | 'installing' | 'error'

export function UpdateNotification() {
  const store  = useStore()
  const update = store.updateAvailable
  const [phase, setPhase]     = useState<Phase>('prompt')
  const [progress, setProgress] = useState(0)
  const [zipPath, setZipPath]   = useState<string | null>(null)
  const [error, setError]       = useState<string | null>(null)
  const downloadedRef = useRef(false)

  // Listen to update download progress from main process
  useEffect(() => {
    window.electronAPI?.onUpdateDownloadProgress(p => setProgress(p))
  }, [])

  // Reset when update changes
  useEffect(() => {
    setPhase('prompt')
    setProgress(0)
    setZipPath(null)
    setError(null)
    downloadedRef.current = false
  }, [update?.fileId])

  const handleDownload = useCallback(async () => {
    if (!update || downloadedRef.current) return
    downloadedRef.current = true
    setPhase('downloading')
    setProgress(0)

    const result = await window.electronAPI?.downloadUpdate(
      update.peerIp,
      update.peerFilePort,
      update.fileId,
      update.fileName,
      update.fileSize,
    )

    if (result?.ok && result.zipPath) {
      setZipPath(result.zipPath)
      setPhase('confirm')
    } else {
      setError(result?.error ?? 'Download failed')
      setPhase('error')
      downloadedRef.current = false
    }
  }, [update])

  const handleInstall = useCallback(async () => {
    if (!zipPath) return
    setPhase('installing')

    const result = await window.electronAPI?.applyUpdate(zipPath)
    if (!result?.ok) {
      setError(result?.error ?? 'Install failed')
      setPhase('error')
    }
    // On success app will quit — nothing more to do
  }, [zipPath])

  if (!update) return null

  return (
    <div className={styles.banner}>
      <div className={styles.icon}>
        {phase === 'confirm'    ? '✅' :
         phase === 'installing' ? '⚙️' :
         phase === 'error'      ? '⚠️' : '🚀'}
      </div>

      <div className={styles.content}>
        {phase === 'prompt' && <>
          <div className={styles.title}>Update v{update.version} available</div>
          <div className={styles.sub}>{update.fromName} has a newer version · {formatMB(update.fileSize)}</div>
        </>}

        {phase === 'downloading' && <>
          <div className={styles.title}>Downloading update…</div>
          <div className={styles.progressWrap}>
            <div className={styles.progressBar} style={{ width: `${progress}%` }} />
            <span className={styles.progressPct}>{progress}%</span>
          </div>
        </>}

        {phase === 'confirm' && <>
          <div className={styles.title}>Update downloaded!</div>
          <div className={styles.sub}>VoiceOrbit will close, apply update and restart automatically.</div>
        </>}

        {phase === 'installing' && <>
          <div className={styles.title}>Applying update…</div>
          <div className={styles.sub}>App will restart shortly.</div>
        </>}

        {phase === 'error' && <>
          <div className={styles.title}>Update failed</div>
          <div className={styles.errorText}>{error}</div>
        </>}
      </div>

      <div className={styles.actions}>
        {phase === 'prompt' && <>
          <button className={styles.downloadBtn} onClick={handleDownload}>↓ Download</button>
          <button className={styles.dismissBtn}  onClick={() => store.clearUpdateAvailable()}>✕</button>
        </>}

        {phase === 'confirm' && <>
          <button className={styles.installBtn}  onClick={handleInstall}>↻ Install &amp; Restart</button>
          <button className={styles.laterBtn}    onClick={() => store.clearUpdateAvailable()}>Later</button>
        </>}

        {phase === 'error' && <>
          <button className={styles.downloadBtn} onClick={() => { downloadedRef.current = false; setPhase('prompt') }}>Retry</button>
          <button className={styles.dismissBtn}  onClick={() => store.clearUpdateAvailable()}>✕</button>
        </>}
      </div>
    </div>
  )
}

function formatMB(bytes: number) {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
