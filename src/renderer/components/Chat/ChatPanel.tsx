import { useState, useRef, useEffect, useCallback } from 'react'
import { useStore } from '../../store'
import { FileTransfer, ChatSession } from '../../../shared/types'
import styles from './ChatPanel.module.css'

interface Props {
  onClose: () => void
  onSendMessage: (chatId: string, text: string) => void
  onSendFile: (chatId: string) => void
  onSendImageFromClipboard: (chatId: string, dataUrl: string) => void
  onAcceptFile: (fileId: string) => void
  onRejectFile: (fileId: string) => void
  onAbortFile: (fileId: string) => void
}

export function ChatPanel({ onClose, onSendMessage, onSendFile, onSendImageFromClipboard, onAcceptFile, onRejectFile, onAbortFile }: Props) {
  const store        = useStore()
  const activeChatId = store.activeChatId
  // null = show sessions list, string = show that chat
  const [view, setView] = useState<'list' | 'chat'>(!activeChatId ? 'list' : 'chat')

  // Sync view when activeChatId changes from outside
  useEffect(() => {
    if (activeChatId) setView('chat')
  }, [activeChatId])

  const openChat = (id: string) => {
    store.setActiveChatId(id)
    setView('chat')
  }

  const goBack = () => {
    store.setActiveChatId(null)
    setView('list')
  }

  // Esc: chat → list → close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (view === 'chat') goBack()
        else onClose()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [view])

  return (
    <div className={styles.panel}>
      {view === 'list'
        ? <SessionList onSelectChat={openChat} onClose={onClose} />
        : activeChatId
          ? <ChatView
              chatId={activeChatId}
              onBack={goBack}
              onSendMessage={onSendMessage}
              onSendFile={onSendFile}
              onSendImageFromClipboard={onSendImageFromClipboard}
              onAcceptFile={onAcceptFile}
              onRejectFile={onRejectFile}
              onAbortFile={onAbortFile}
            />
          : <SessionList onSelectChat={openChat} onClose={onClose} />
      }
    </div>
  )
}

// ── Session List ───────────────────────────────────────────────
function SessionList({ onSelectChat, onClose }: { onSelectChat: (id: string) => void; onClose: () => void }) {
  const store    = useStore()
  const sessions = (Array.from(store.chatSessions.values()) as ChatSession[])
    .sort((a, b) => {
      // Sort by last message time, then createdAt
      const lastA = store.messages.filter((m: any) => m.chatId === a.id).at(-1)?.ts ?? a.createdAt
      const lastB = store.messages.filter((m: any) => m.chatId === b.id).at(-1)?.ts ?? b.createdAt
      return lastB - lastA
    })

  return (
    <div className={styles.listView}>
      <div className={styles.listHeader}>
        <span className={styles.listTitle}>Messages</span>
        <button className={styles.closeBtn} onClick={onClose}>✕</button>
      </div>

      <div className={styles.sessionList}>
        {sessions.length === 0 && (
          <div className={styles.empty}>
            No chats yet.<br/>Select a planet to start.
          </div>
        )}
        {sessions.map(session => <SessionItem key={session.id} session={session} onSelect={onSelectChat} />)}
      </div>
    </div>
  )
}

function SessionItem({ session, onSelect }: { session: ChatSession; onSelect: (id: string) => void }) {
  const store    = useStore()
  const unread   = store.unreadCounts.get(session.id) ?? 0
  const messages = store.messages.filter((m: any) => m.chatId === session.id)
  const lastMsg  = messages.at(-1)
  const isActive = store.activeChatId === session.id

  const firstPeer = !session.isGroup ? store.peers.get(session.peerIds[0]) : null
  const color     = firstPeer?.color ?? '#4488ff'

  return (
    <button
      className={`${styles.sessionItem} ${isActive ? styles.sessionActive : ''}`}
      onClick={() => onSelect(session.id)}
    >
      <div
        className={styles.sessionAvatar}
        style={!session.isGroup ? { background: color, boxShadow: `0 0 8px ${color}55` } : {}}
      >
        {session.isGroup ? '👥' : session.name.charAt(0).toUpperCase()}
      </div>
      <div className={styles.sessionInfo}>
        <div className={styles.sessionName}>{session.name}</div>
        {lastMsg && (
          <div className={styles.sessionPreview}>
            {(lastMsg as any).self ? 'You: ' : ''}{(lastMsg as any).text ?? '📎 File'}
          </div>
        )}
      </div>
      {unread > 0 && (
        <div className={styles.sessionBadge}>{unread > 99 ? '99+' : unread}</div>
      )}
    </button>
  )
}

// ── Chat View ──────────────────────────────────────────────────
interface ChatViewProps {
  chatId: string
  onBack: () => void
  onSendMessage: (chatId: string, text: string) => void
  onSendFile: (chatId: string) => void
  onSendImageFromClipboard: (chatId: string, dataUrl: string) => void
  onAcceptFile: (fileId: string) => void
  onRejectFile: (fileId: string) => void
  onAbortFile: (fileId: string) => void
}

function ChatView({ chatId, onBack, onSendMessage, onSendFile, onSendImageFromClipboard, onAcceptFile, onRejectFile, onAbortFile }: ChatViewProps) {
  const store    = useStore()
  const [input, setInput] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef  = useRef<HTMLTextAreaElement>(null)

  const session   = store.chatSessions.get(chatId)
  const isGroup   = session?.isGroup ?? false
  const chatName  = session?.name ?? 'Chat'
  const firstPeer = !isGroup ? store.peers.get(session?.peerIds[0] ?? '') : null
  const chatColor = firstPeer?.color ?? '#4488ff'

  const messages  = store.messages.filter((m: any) => m.chatId === chatId)
  const lastMsgId  = messages.at(-1)?.id
  const [atBottom, setAtBottom] = useState(true)
  const messagesRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  // Track scroll position
  const handleScroll = useCallback(() => {
    const el = messagesRef.current
    if (!el) return
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    setAtBottom(distFromBottom < 60)
  }, [])
  const transfers = (Array.from(store.fileTransfers.values()) as FileTransfer[])
    .filter(ft => ft.chatId === chatId)

  const activeTransfer = transfers.find(ft => ft.status === 'transferring' && ft.progress < 100)

  // Auto-scroll only when already at bottom
  useEffect(() => {
    if (atBottom) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages.length, transfers.length, atBottom])

  // Ctrl+V paste image
  useEffect(() => {
    const handler = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items
      if (!items) return
      for (const item of Array.from(items)) {
        if (item.type.startsWith('image/')) {
          e.preventDefault()
          const blob = item.getAsFile()
          if (!blob) return
          const reader = new FileReader()
          reader.onload = () => onSendImageFromClipboard(chatId, reader.result as string)
          reader.readAsDataURL(blob)
          break
        }
      }
    }
    window.addEventListener('paste', handler)
    return () => window.removeEventListener('paste', handler)
  }, [chatId, onSendImageFromClipboard])

  const handleSend = useCallback(() => {
    if (!input.trim()) return
    onSendMessage(chatId, input)
    setInput('')
    inputRef.current?.focus()
  }, [input, chatId, onSendMessage])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
  }

  // Merge messages and transfers sorted by time
  type Item = { kind: 'msg'; ts: number; id: string } | { kind: 'file'; ts: number; fileId: string }
  const items: Item[] = [
    ...messages.map((m: any) => ({ kind: 'msg' as const, ts: m.ts, id: m.id })),
    ...transfers.map(ft => ({ kind: 'file' as const, ts: ft.createdAt, fileId: ft.fileId })),
  ].sort((a, b) => a.ts - b.ts)

  return (
    <>
      {/* Header */}
      <div className={styles.header}>
        <button className={styles.backBtn} onClick={onBack} title="Back to chats">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path d="M19 12H5M12 19l-7-7 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <div
          className={styles.headerAvatar}
          style={!isGroup ? { background: chatColor, boxShadow: `0 0 8px ${chatColor}66` } : {}}
        >
          {isGroup ? '👥' : chatName.charAt(0).toUpperCase()}
        </div>
        <div className={styles.headerMeta}>
          <span className={styles.headerName}>{chatName}</span>
          {isGroup && session && (
            <span className={styles.headerSub}>{session.peerIds.length} members</span>
          )}
          {activeTransfer && (
            <div className={styles.headerProgress}>
              <div className={styles.headerProgressFill} style={{ width: `${activeTransfer.progress}%` }} />
              <span className={styles.headerProgressLabel}>
                {activeTransfer.direction === 'outgoing' ? '↑' : '↓'} {activeTransfer.fileName} · {activeTransfer.progress}%
              </span>
            </div>
          )}
        </div>

      </div>

      {/* Messages */}
      <div className={styles.messagesWrap}>
      <div className={styles.messages} ref={messagesRef} onScroll={handleScroll}>
        {items.length === 0 && <div className={styles.empty}>No messages yet.</div>}
        {items.map(item => {
          if (item.kind === 'msg') {
            const msg = messages.find((m: any) => m.id === item.id) as any
            if (!msg) return null
            return (
              <div key={msg.id} className={`${styles.msgRow} ${msg.self ? styles.self : styles.other}`}>
                {!msg.self && (
                  <div className={styles.msgAvatar} style={{ background: msg.fromColor }}>
                    {msg.fromName.charAt(0).toUpperCase()}
                  </div>
                )}
                <div className={styles.bubble}>
                  {isGroup && !msg.self && (
                    <div className={styles.senderName} style={{ color: msg.fromColor }}>{msg.fromName}</div>
                  )}
                  <div className={styles.bubbleText}>{msg.text}</div>
                  <div className={styles.bubbleTime}>{formatTime(msg.ts)}</div>
                </div>
              </div>
            )
          }
          const ft = store.fileTransfers.get(item.fileId)
          if (!ft) return null
          return <FileCard key={ft.fileId} ft={ft} self={ft.direction === 'outgoing'} isGroup={isGroup} onAccept={onAcceptFile} onReject={onRejectFile} onAbort={onAbortFile} />
        })}
        <div ref={bottomRef} />
      </div>
      {!atBottom && (
        <button className={styles.scrollDownBtn} onClick={scrollToBottom} title="Scroll to bottom">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path d="M12 5v14M5 12l7 7 7-7" stroke="currentColor" strokeWidth="2.2"
              strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      )}
      </div>

      {/* Input */}
      <div className={styles.inputRow}>
        <button className={styles.attachBtn} onClick={() => onSendFile(chatId)} title="Send file">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path d="M21.44 11.05L12.25 20.24a5 5 0 0 1-7.07-7.07l9.19-9.19a3.33 3.33 0 0 1 4.71 4.71L10.89 17.9a1.67 1.67 0 0 1-2.36-2.36l8.14-8.13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <textarea
          ref={inputRef}
          className={styles.input}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message… (Enter to send)"
          rows={1}
        />
        <button className={styles.sendBtn} onClick={handleSend} disabled={!input.trim()}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path d="M22 2L11 13M22 2L15 22l-4-9-9-4 20-7z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      </div>
    </>
  )
}

// ── File Card ───────────────────────────────────────────────────
function FileCard({ ft, self, isGroup, onAccept, onReject, onAbort }: {
  ft: FileTransfer; self: boolean; isGroup: boolean
  onAccept: (id: string) => void
  onReject: (id: string) => void
  onAbort:  (id: string) => void
}) {
  const isImage = ft.mimeType?.startsWith('image/')
  const icon = isImage ? '🖼' : ft.mimeType?.startsWith('video/') ? '🎬' : ft.mimeType?.startsWith('audio/') ? '🎵' : ft.mimeType?.includes('pdf') ? '📄' : '📎'
  const canOpen = ft.status === 'done' && ft.savePath

  const handleOpen = () => { if (canOpen) window.electronAPI?.fileShowInFolder(ft.savePath!) }

  if (isImage && ft.previewData) {
    return (
      <div className={`${styles.imageCard} ${self ? styles.fileSelf : styles.fileOther} ${canOpen ? styles.fileClickable : ''}`}
        style={{ alignSelf: self ? 'flex-end' : 'flex-start' }}
        onClick={canOpen ? handleOpen : undefined}>
        {isGroup && !self && <div className={styles.imageSender} style={{ color: ft.fromColor }}>{ft.fromName}</div>}
        <img src={ft.previewData} className={styles.imagePreview} alt={ft.fileName} />
        <div className={styles.imageMeta}>
          {ft.status === 'transferring' && (
            <div className={styles.imageProgress}>
              <div className={styles.progressFill} style={{ width: `${ft.progress}%` }} />
              <button className={styles.abortBtn} onClick={e => { e.stopPropagation(); onAbort(ft.fileId) }}>✕</button>
            </div>
          )}
          {ft.status === 'pending' && !self && (
            <div className={styles.imageActions}>
              <button className={styles.acceptFileBtn} onClick={e => { e.stopPropagation(); onAccept(ft.fileId) }}>↓ Save</button>
              <button className={styles.rejectFileBtn} onClick={e => { e.stopPropagation(); onReject(ft.fileId) }}>✕</button>
            </div>
          )}
          {ft.status === 'pending' && self && <span className={styles.imagePending}>Waiting…</span>}
          {ft.status === 'done' && canOpen && <span className={styles.openHint}>click to open</span>}
          {ft.status === 'rejected' && <span className={styles.imageRejected}>✕ Cancelled</span>}
        </div>
      </div>
    )
  }

  return (
    <div className={`${styles.fileCard} ${self ? styles.fileSelf : styles.fileOther} ${canOpen ? styles.fileClickable : ''}`}
      style={{ alignSelf: self ? 'flex-end' : 'flex-start' }}
      onClick={canOpen ? handleOpen : undefined}>
      <div className={styles.fileIcon}>{icon}</div>
      <div className={styles.fileInfo}>
        {isGroup && !self && <div className={styles.fileSender} style={{ color: ft.fromColor }}>{ft.fromName}</div>}
        <div className={styles.fileName}>{ft.fileName}</div>
        <div className={styles.fileMeta}>{formatSize(ft.fileSize)}</div>
        {ft.status === 'pending' && !self && (
          <div className={styles.fileActions}>
            <button className={styles.acceptFileBtn} onClick={e => { e.stopPropagation(); onAccept(ft.fileId) }}>↓ Accept</button>
            <button className={styles.rejectFileBtn} onClick={e => { e.stopPropagation(); onReject(ft.fileId) }}>✕</button>
          </div>
        )}
        {ft.status === 'pending' && self && <div className={styles.filePending}>Waiting…</div>}
        {ft.status === 'transferring' && (
          <div className={styles.progressWrap}>
            <div className={styles.progressTrack}><div className={styles.progressFill} style={{ width: `${ft.progress}%` }} /></div>
            <span className={styles.progressPct}>{ft.progress}%</span>
            <button className={styles.abortBtn} onClick={e => { e.stopPropagation(); onAbort(ft.fileId) }}>✕</button>
          </div>
        )}
        {ft.status === 'done' && (
          <div className={styles.fileDone}>
            <span>✓ {self ? 'Sent' : 'Saved'}</span>
            {ft.savePath && <span className={styles.openHint}>· click to open</span>}
          </div>
        )}
        {ft.status === 'rejected' && <div className={styles.fileStatus}>✕ {self ? 'Declined' : 'You declined'}</div>}
        {ft.status === 'error'    && <div className={styles.fileStatus}>⚠ Failed</div>}
      </div>
    </div>
  )
}

function formatSize(b: number) {
  if (b < 1024) return `${b} B`
  if (b < 1024*1024) return `${(b/1024).toFixed(1)} KB`
  return `${(b/1024/1024).toFixed(1)} MB`
}
function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}
