import { useCallback, useState, useEffect } from 'react'
import { useDiscovery } from './hooks/useDiscovery'
import { useWebRTC } from './hooks/useWebRTC'
import { useStore } from './store'
import { OrbitCanvas } from './components/OrbitCanvas/OrbitCanvas'
import { CallOverlay } from './components/CallOverlay/CallOverlay'
import { Settings } from './components/Settings/Settings'
import { ChatPanel } from './components/Chat/ChatPanel'
import { ChatDrawer } from './components/Chat/ChatDrawer'

import { useSignalingDispatcher } from './hooks/useSignaling'
import { useAutoUpdate } from './hooks/useAutoUpdate'
import { UpdateNotification } from './components/Update/UpdateNotification'
import { useRingbackTone } from './hooks/useRingbackTone'
import { useChat } from './hooks/useChat'
import { SignalingMessage } from '../shared/types'
import styles from './App.module.css'
import { applyTheme } from './themes'

export default function App() {
  useDiscovery()
  const store = useStore()
  const { callPeer, endCall, toggleMute, acceptCall, rejectCall, setPeerVolume } = useWebRTC()
  useRingbackTone()
  useSignalingDispatcher()
  const { sendMessage, sendFile, sendImageFromClipboard, acceptFile, rejectFile, abortFile } = useChat()
  const { checkForUpdates } = useAutoUpdate()


  const displayName = (peerId: string, fallback: string) =>
    store.localNicknames.get(peerId) ?? fallback

  const handlePlanetClick = useCallback((peerId: string) => {
    if (store.status === 'in-call' || store.status === 'calling') return
    if (!peerId) {
      store.clearSelection()
      return
    }
    // If chat panel is open — switch to clicked peer's chat instead of multi-select
    if (store.activeChatId) {
      const peer = store.peers.get(peerId)
      const chatId = store.openOrCreateDm(peerId, peer?.name ?? 'Unknown')
      store.clearSelection()
      store.toggleSelectedPeer(peerId)
      store.setActiveChatId(chatId)
      return
    }
    store.toggleSelectedPeer(peerId)
  }, [store])

  const handleStartCall = useCallback(() => {
    if (store.selectedPeerIds.size === 0) return
    store.setStatus('calling')
    for (const peerId of store.selectedPeerIds) {
      const peer = store.peers.get(peerId)
      if (!peer) continue
      const msg: SignalingMessage = { type: 'CALL_REQUEST', from: store.selfId, to: peerId }
      window.electronAPI?.sendSignaling(peer.ip, peer.signalingPort, msg)
    }
    for (const peerId of store.selectedPeerIds) callPeer(peerId)
  }, [store, callPeer])

  const selectedPeers = Array.from(store.selectedPeerIds)
    .map(id => store.peers.get(id)).filter(Boolean) as NonNullable<ReturnType<typeof store.peers.get>>[]

  const singleSelected = store.selectedPeerIds.size === 1
    ? store.peers.get(Array.from(store.selectedPeerIds)[0])
    : null

  const statusText = {
    searching: 'Scanning local network…',
    ready: `${store.peers.size} peer${store.peers.size !== 1 ? 's' : ''} found`,
    calling: 'Connecting…',
    'in-call': 'In call',
  }[store.status]

  const statusDot = {
    searching: styles.dotSearching,
    ready: styles.dotReady,
    calling: styles.dotCalling,
    'in-call': styles.dotInCall,
  }[store.status]

  // Apply theme on mount and when it changes
  useEffect(() => {
    applyTheme(store.settings.theme ?? 'deep-space')
    // OrbitCanvas watches CSS vars each frame — bg rebuilds automatically
  }, [store.settings.theme])

  // Apply UI scale — scale the app wrapper, compensate size so nothing clips
  useEffect(() => {
    const scale = store.settings.uiScale ?? 1.0
    document.documentElement.style.setProperty('--ui-scale', String(scale))
    const el = document.getElementById('app-root')
    if (!el) return
    if (scale === 1.0) {
      el.style.transform = ''
      el.style.transformOrigin = ''
      el.style.width  = ''
      el.style.height = ''
    } else {
      // Scale from top-left, then expand the element so scrollbars don't appear
      el.style.transformOrigin = 'top left'
      el.style.transform = `scale(${scale})`
      // Compensate: if scale=1.2, element appears 20% larger but real size is same
      // so we shrink the element so scaled size == viewport size
      const inv = (1 / scale) * 100
      el.style.width  = `${inv}%`
      el.style.height = `${inv}%`
    }
  }, [store.settings.uiScale])

  const chatOpen = store.chatPanelOpen

  // Total unread across all chat sessions
  // Count of chats that HAVE unread messages (not total message count)
  const totalUnread: number = Array.from(store.unreadCounts.entries() as Iterable<[string, number]>).filter(([, n]) => n > 0).length

  // Esc closes chat panel
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Esc handled inside ChatPanel component
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [store.activeChatId])

  return (
    <div className={styles.app} id="app-root">
      {/* Title bar — full width always */}
      <div className={styles.titleBar}>
        <div className={styles.windowControls}>
          <button className={`${styles.winBtn} ${styles.close}`}    onClick={() => window.electronAPI?.close()} />
          <button className={`${styles.winBtn} ${styles.minimize}`} onClick={() => window.electronAPI?.minimize()} />
          <button className={`${styles.winBtn} ${styles.maximize}`} onClick={() => window.electronAPI?.maximize()} />
        </div>
        <div className={styles.appTitle}>
          <span className={styles.titleGlyph}>◎</span>
          <span>VoiceOrbit</span>
        </div>
        <div className={styles.titleRight}>
          <div className={styles.statusChip}>
            <span className={`${styles.statusDot} ${statusDot}`} />
            <span>{statusText}</span>
          </div>
          <button className={styles.settingsBtn} onClick={() => store.setShowSettings(true)}>⚙</button>
        </div>
      </div>

      {/* Main body — canvas + optional chat side panel */}
      <div className={styles.mainBody}>
        <div className={styles.canvasWrap}>
          <OrbitCanvas onPlanetClick={handlePlanetClick} />

          {/* Self badge */}
          <div className={styles.selfBadge}>
            <div className={styles.selfDot} style={{ background: store.selfColor, boxShadow: `0 0 10px ${store.selfColor}` }} />
            <span className={styles.selfName}>{store.selfName}</span>
            <span className={styles.selfSub}>You</span>
          </div>

          {/* Update notification */}
        <UpdateNotification />

        {/* Incoming call overlay */}
          {store.incomingCallFrom && (() => {
            const caller = store.peers.get(store.incomingCallFrom)
            const color  = caller?.color ?? '#4488ff'
            return (
              <div className={styles.incomingOverlay}>
                <div className={styles.incomingGlow} style={{ background: `radial-gradient(ellipse at center, ${color}33 0%, transparent 70%)` }} />
                <div className={styles.incomingCard}>
                  <div className={styles.ringWrap}>
                    {[1,2,3].map(i => (
                      <div key={i} className={styles.ring} style={{
                        borderColor: color,
                        animationDelay: `${i * 0.4}s`,
                        width:  `${60 + i * 30}px`,
                        height: `${60 + i * 30}px`,
                      }} />
                    ))}
                    <div className={styles.callerAvatarBig} style={{ background: color, boxShadow: `0 0 30px ${color}` }}>
                      {(caller?.name ?? '?').charAt(0).toUpperCase()}
                    </div>
                  </div>
                  <div className={styles.callerNameBig}>{caller ? displayName(caller.id, caller.name) : 'Unknown'}</div>
                  <div className={styles.callerSubBig}>Incoming call…</div>
                  <div className={styles.incomingBtns}>
                    <button className={styles.rejectBigBtn} onClick={() => rejectCall(store.incomingCallFrom!)}>
                      <span>📵</span><span>Decline</span>
                    </button>
                    <button className={styles.acceptBigBtn} onClick={() => acceptCall(store.incomingCallFrom!)}>
                      <span>📞</span><span>Accept</span>
                    </button>
                  </div>
                </div>
              </div>
            )
          })()}

          {/* In-call overlay */}
          {(store.status === 'in-call' || store.status === 'calling') && (
            <CallOverlay onEndCall={endCall} onToggleMute={toggleMute} onSetVolume={setPeerVolume} />
          )}
          {/* Chat drawer — overlays canvas, position:absolute inside canvasWrap */}
          <ChatDrawer
            isOpen={chatOpen}
            onOpen={() => store.setChatPanelOpen(true)}
            unreadCount={totalUnread}
          >
            <ChatPanel
              onClose={() => { store.setActiveChatId(null); store.setChatPanelOpen(false) }}
              onSendMessage={sendMessage}
              onSendFile={sendFile}
              onSendImageFromClipboard={sendImageFromClipboard}
              onAcceptFile={acceptFile}
              onRejectFile={rejectFile}
              onAbortFile={abortFile}
            />
          </ChatDrawer>
        </div>
      </div>

      {/* Bottom bar — call controls or chat/call selection */}
      {store.selectedPeerIds.size > 0 && store.status !== 'in-call' && store.status !== 'calling' && (
        <div className={styles.callBar}>
          <div className={styles.callBarLeft}>
            <span className={styles.callBarLabel}>
              {store.selectedPeerIds.size > 1 ? `Group (${store.selectedPeerIds.size})` : 'Selected'}
            </span>
            <div className={styles.callBarAvatars}>
              {selectedPeers.map(p => (
                <div key={p.id} className={styles.callBarAvatar}
                  style={{ background: p.color, boxShadow: `0 0 8px ${p.color}88` }}
                  title={p.name}>
                  {p.name.charAt(0).toUpperCase()}
                </div>
              ))}
            </div>
            <span className={styles.callBarNames}>
              {selectedPeers.map(p => displayName(p.id, p.name)).join(', ')}
            </span>
          </div>
          <div className={styles.callBarRight}>
            {/* Chat button — DM for single, group for multiple */}
            <button
              className={`${styles.chatBarBtn} ${chatOpen ? styles.chatBarBtnActive : ''}`}
              onClick={() => {
                if (chatOpen) {
                  store.setActiveChatId(null)
                  store.setChatPanelOpen(false)
                  return
                }
                if (store.selectedPeerIds.size === 1 && singleSelected) {
                  const chatId = store.openOrCreateDm(
                    singleSelected.id,
                    store.localNicknames.get(singleSelected.id) ?? singleSelected.name
                  )
                  store.setActiveChatId(chatId)
                } else {
                  const chatId = store.openOrCreateGroup(
                    selectedPeers.map(p => p.id),
                    selectedPeers.map(p => store.localNicknames.get(p.id) ?? p.name)
                  )
                  store.setActiveChatId(chatId)
                }
                store.setChatPanelOpen(true)
              }}
              title={store.selectedPeerIds.size > 1 ? 'Group Chat' : 'Chat'}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <span>{store.selectedPeerIds.size > 1 ? 'Group Chat' : 'Chat'}</span>
            </button>
            <button className={styles.clearSelBtn} onClick={() => { store.clearSelection() }}>✕</button>
            <button className={styles.startCallBtn} onClick={handleStartCall}>
              <span className={styles.callIcon}>📞</span>
              <span>{store.selectedPeerIds.size > 1 ? 'Group Call' : 'Call'}</span>
            </button>
          </div>
        </div>
      )}

      {store.showSettings && <Settings onClose={() => store.setShowSettings(false)} onCheckUpdates={checkForUpdates} />}
    </div>
  )
}
