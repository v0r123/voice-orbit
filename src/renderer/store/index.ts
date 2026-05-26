import { create } from 'zustand'
import { Peer, AppSettings, PLANET_COLORS, ChatMessage, FileTransfer, ChatSession } from '../../shared/types'

export type AppStatus = 'searching' | 'ready' | 'calling' | 'in-call'

export interface CallParticipant {
  peerId: string
  volume: number
  muted: boolean
  speaking: boolean
  gainNode?: GainNode
}

interface AppStore {
  selfId: string
  selfName: string
  selfColor: string
  signalingPort: number

  peers: Map<string, Peer>

  status: AppStatus
  selectedPeerIds: Set<string>   // multi-select for group call
  incomingCallFrom: string | null
  showSettings: boolean

  callParticipants: Map<string, CallParticipant>
  micMuted: boolean

  settings: AppSettings

  localNicknames: Map<string, string>
  appVersion: string
  updateAvailable: { fromPeerId: string; fromName: string; version: string; fileId: string; fileName: string; fileSize: number; peerIp: string; peerFilePort: number } | null
  updateSharedFile: { fileId: string; filePath: string; fileName: string; fileSize: number; version: string } | null
  messages: ChatMessage[]
  fileTransfers: Map<string, FileTransfer>   // fileId → transfer
  activeChatId: string | null
  chatPanelOpen: boolean
  lastIncomingMsgTs: number    // timestamp of last incoming message, for ripple effect
  chatSessions: Map<string, ChatSession>    // id → session
  filePort: number
  unreadCounts: Map<string, number>          // chatId → unread count
  setSelf: (id: string, name: string, color: string, port: number, filePort?: number) => void
  setLocalNickname: (peerId: string, nick: string) => void
  setAppVersion: (v: string) => void
  setUpdateAvailable: (u: AppStore['updateAvailable']) => void
  clearUpdateAvailable: () => void
  setUpdateSharedFile: (f: AppStore['updateSharedFile']) => void
  getDisplayName: (peerId: string, fallback: string) => string
  addPeer: (peer: Peer) => void
  updatePeer: (peer: Peer) => void
  removePeer: (id: string) => void
  toggleSelectedPeer: (id: string) => void
  clearSelection: () => void
  setStatus: (status: AppStatus) => void
  setIncomingCall: (fromId: string | null) => void
  setShowSettings: (v: boolean) => void
  addCallParticipant: (peerId: string) => void
  removeCallParticipant: (peerId: string) => void
  setParticipantVolume: (peerId: string, volume: number) => void
  setParticipantGain: (peerId: string, gainNode: GainNode) => void
  setParticipantSpeaking: (peerId: string, speaking: boolean) => void
  toggleMicMute: () => void
  updateSettings: (s: Partial<AppSettings>) => void
  addMessage: (msg: ChatMessage) => void
  markRead: (peerId: string) => void
  addFileTransfer: (ft: FileTransfer) => void
  updateFileTransfer: (fileId: string, update: Partial<FileTransfer>) => void
  setActiveChatId: (id: string | null) => void
  setChatPanelOpen: (open: boolean) => void
  openOrCreateDm: (peerId: string, peerName: string) => string
  openOrCreateGroup: (peerIds: string[], peerNames: string[]) => string
  getOrCreateSession: (id: string) => ChatSession | undefined
  loadSettings: () => Promise<void>
  clearCall: () => void
}

export const useStore = create<AppStore>((set) => ({
  selfId: '',
  selfName: 'You',
  selfColor: PLANET_COLORS[0],
  signalingPort: 0,

  peers: new Map(),
  localNicknames: new Map(),
  appVersion: '1.0.0',
  updateAvailable: null,
  updateSharedFile: null,
  messages: [],
  fileTransfers: new Map(),
  activeChatId: null,
  chatPanelOpen: false,
  lastIncomingMsgTs: 0,
  chatSessions: new Map(),
  filePort: 0,
  unreadCounts: new Map(),

  status: 'searching',
  selectedPeerIds: new Set(),
  incomingCallFrom: null,
  showSettings: false,

  callParticipants: new Map(),
  micMuted: false,

  settings: {
    userName: 'User',
    userColor: PLANET_COLORS[0],
    micDeviceId: 'default',
    outputDeviceId: 'default',
    inputVolume: 1,
    outputVolume: 1,
    theme: 'deep-space',
    uiScale: 1.0,
  },

  setSelf: (id, name, color, port, fp) =>
    set({ selfId: id, selfName: name, selfColor: color, signalingPort: port, ...(fp ? { filePort: fp } : {}) }),

  setAppVersion: (v) => set({ appVersion: v }),
  setUpdateAvailable: (u) => set({ updateAvailable: u }),
  clearUpdateAvailable: () => set({ updateAvailable: null }),
  setUpdateSharedFile: (f) => set({ updateSharedFile: f }),

  setLocalNickname: (peerId, nick) =>
    set((state) => {
      const next = new Map(state.localNicknames)
      if (nick.trim()) next.set(peerId, nick.trim())
      else next.delete(peerId)
      return { localNicknames: next }
    }),

  getDisplayName: (peerId, fallback) => {
    // This is a selector — read from current state snapshot
    // Components should use useStore(s => s.localNicknames.get(id) ?? peer.name) instead
    return fallback
  },

  addPeer: (peer) =>
    set((state) => {
      const next = new Map(state.peers)
      next.set(peer.id, peer)
      return { peers: next, status: next.size > 0 ? 'ready' : 'searching' }
    }),

  updatePeer: (peer) =>
    set((state) => {
      if (!state.peers.has(peer.id)) return {}
      const next = new Map(state.peers)
      // Preserve orbit position — only update visible properties
      const existing = next.get(peer.id)!
      next.set(peer.id, { ...existing, name: peer.name, color: peer.color, signalingPort: peer.signalingPort })
      return { peers: next }
    }),

  removePeer: (id) =>
    set((state) => {
      const next = new Map(state.peers)
      next.delete(id)
      const sel = new Set(state.selectedPeerIds)
      sel.delete(id)
      return { peers: next, selectedPeerIds: sel, status: next.size > 0 ? 'ready' : 'searching' }
    }),

  toggleSelectedPeer: (id) =>
    set((state) => {
      const sel = new Set(state.selectedPeerIds)
      if (sel.has(id)) sel.delete(id)
      else sel.add(id)
      return { selectedPeerIds: sel }
    }),

  clearSelection: () => set({ selectedPeerIds: new Set() }),

  setStatus: (status) => set({ status }),
  setIncomingCall: (fromId) => set({ incomingCallFrom: fromId }),
  setShowSettings: (v) => set({ showSettings: v }),

  addCallParticipant: (peerId) =>
    set((state) => {
      const next = new Map(state.callParticipants)
      if (!next.has(peerId)) next.set(peerId, { peerId, volume: 1, muted: false, speaking: false })
      return { callParticipants: next }
    }),

  removeCallParticipant: (peerId) =>
    set((state) => {
      const next = new Map(state.callParticipants)
      next.delete(peerId)
      return { callParticipants: next }
    }),

  setParticipantVolume: (peerId, volume) =>
    set((state) => {
      const next = new Map(state.callParticipants)
      const p = next.get(peerId)
      if (p) {
        next.set(peerId, { ...p, volume })
        p.gainNode?.gain.setTargetAtTime(volume, p.gainNode.context.currentTime, 0.01)
      }
      return { callParticipants: next }
    }),

  setParticipantGain: (peerId, gainNode) =>
    set((state) => {
      const next = new Map(state.callParticipants)
      const p = next.get(peerId)
      if (p) next.set(peerId, { ...p, gainNode })
      return { callParticipants: next }
    }),

  setParticipantSpeaking: (peerId, speaking) =>
    set((state) => {
      const next = new Map(state.callParticipants)
      const p = next.get(peerId)
      if (p) next.set(peerId, { ...p, speaking })
      return { callParticipants: next }
    }),

  toggleMicMute: () => set((state) => ({ micMuted: !state.micMuted })),

  addMessage: (msg) =>
    set((state) => {
      const newMessages = [...state.messages, msg]
      if (!msg.self) {
        const counts = new Map(state.unreadCounts)
        if (state.activeChatId !== msg.chatId) {
          counts.set(msg.chatId, (counts.get(msg.chatId) ?? 0) + 1)
        }
        return { messages: newMessages, unreadCounts: counts, lastIncomingMsgTs: msg.ts }
      }
      return { messages: newMessages }
    }),

  markRead: (peerId) =>
    set((state) => {
      if (!state.unreadCounts.has(peerId)) return {}
      const counts = new Map(state.unreadCounts)
      counts.delete(peerId)
      return { unreadCounts: counts }
    }),

  addFileTransfer: (ft) =>
    set((state) => {
      const next = new Map(state.fileTransfers)
      next.set(ft.fileId, ft)
      // Increment unread badge for incoming files when that chat isn't open
      if (ft.direction === 'incoming' && state.activeChatId !== ft.chatId) {
        const counts = new Map(state.unreadCounts)
        counts.set(ft.chatId, (counts.get(ft.chatId) ?? 0) + 1)
        return { fileTransfers: next, unreadCounts: counts }
      }
      return { fileTransfers: next }
    }),

  updateFileTransfer: (fileId, update) =>
    set((state) => {
      const next = new Map(state.fileTransfers)
      const existing = next.get(fileId)
      if (existing) next.set(fileId, { ...existing, ...update })
      return { fileTransfers: next }
    }),

  setActiveChatId: (id) =>
    set((state) => {
      if (!id) return { activeChatId: null }
      const counts = new Map(state.unreadCounts)
      counts.delete(id)
      return { activeChatId: id, unreadCounts: counts }
    }),

  setChatPanelOpen: (open) => set({ chatPanelOpen: open }),



  openOrCreateDm: (peerId, peerName) => {
    const id = `dm:${peerId}`
    set((state) => {
      if (state.chatSessions.has(id)) return {}
      const sessions = new Map(state.chatSessions)
      sessions.set(id, { id, peerIds: [peerId], name: peerName, isGroup: false, createdAt: Date.now() })
      return { chatSessions: sessions }
    })
    return id
  },

  openOrCreateGroup: (peerIds, peerNames) => {
    // Include selfId in sort so chatId is identical for all participants
    const selfId = useStore.getState().selfId
    const allIds = [...new Set([selfId, ...peerIds])].sort()
    const id = `group:${allIds.join('+')}`
    set((state) => {
      if (state.chatSessions.has(id)) return {}
      const sessions = new Map(state.chatSessions)
      // peerIds stored without self (others to send to)
      sessions.set(id, { id, peerIds, name: peerNames.join(', '), isGroup: true, createdAt: Date.now() })
      return { chatSessions: sessions }
    })
    return id
  },

  getOrCreateSession: (id) => useStore.getState().chatSessions.get(id) as any,

  // ── Persistence ───────────────────────────────────────────
  loadSettings: async () => {
    const saved = await window.electronAPI?.settingsLoad()
    if (!saved) return
    const defaults = useStore.getState().settings
    // Restore settings
    const merged = { ...defaults, ...saved.settings ?? saved }
    useStore.setState({
      settings:  merged,
      selfName:  merged.userName  ?? defaults.userName,
      selfColor: merged.userColor ?? defaults.userColor,
    })
    // Restore local nicknames
    if (saved.nicknames && typeof saved.nicknames === 'object') {
      useStore.setState({ localNicknames: new Map(Object.entries(saved.nicknames)) })
    }
    console.log('[Settings] Loaded from disk')
  },

  updateSettings: (s) =>
    set((state) => ({
      settings: { ...state.settings, ...s },
      // Keep selfName/selfColor in sync with settings
      ...(s.userName  ? { selfName:  s.userName  } : {}),
      ...(s.userColor ? { selfColor: s.userColor } : {}),
    })),

  clearCall: () =>
    set((state) => ({
      callParticipants: new Map(),
      micMuted: false,
      status: state.peers.size > 0 ? 'ready' : 'searching',
      selectedPeerIds: new Set(),
    })),
}))
