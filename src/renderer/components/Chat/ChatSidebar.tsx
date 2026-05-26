import { useStore } from '../../store'
import { ChatSession } from '../../../shared/types'
import styles from './ChatSidebar.module.css'

interface Props {
  onSelectChat: (chatId: string) => void
  onNewGroupChat: () => void
}

export function ChatSidebar({ onSelectChat, onNewGroupChat }: Props) {
  const store        = useStore()
  const activeChatId = store.activeChatId
  const sessions     = (Array.from(store.chatSessions.values()) as import('../../../shared/types').ChatSession[])
    .sort((a, b) => b.createdAt - a.createdAt)

  function getSessionAvatar(session: ChatSession) {
    if (session.isGroup) return '👥'
    const peer = store.peers.get(session.peerIds[0])
    return peer?.color ?? '#4488ff'
  }

  function getLastMessage(chatId: string) {
    const msgs = store.messages.filter(m => m.chatId === chatId)
    if (msgs.length === 0) return null
    return msgs[msgs.length - 1]
  }

  return (
    <div className={styles.sidebar}>
      <div className={styles.header}>
        <span className={styles.title}>Chats</span>
        {/* Group chat button only shown when 2+ selected */}
        {store.selectedPeerIds.size >= 2 && (
          <button className={styles.newGroupBtn} onClick={onNewGroupChat} title="Start group chat">
            👥+
          </button>
        )}
      </div>

      <div className={styles.list}>
        {sessions.length === 0 && (
          <div className={styles.empty}>No chats yet.<br/>Select a planet to start.</div>
        )}
        {sessions.map(session => {
          const unread   = store.unreadCounts.get(session.id) ?? 0
          const lastMsg  = getLastMessage(session.id)
          const isActive = activeChatId === session.id
          const avatar   = getSessionAvatar(session)
          const isColor  = typeof avatar === 'string' && avatar.startsWith('#')

          return (
            <button
              key={session.id}
              className={`${styles.item} ${isActive ? styles.itemActive : ''}`}
              onClick={() => onSelectChat(session.id)}
            >
              <div
                className={styles.avatar}
                style={isColor ? { background: avatar, boxShadow: `0 0 8px ${avatar}66` } : {}}
              >
                {isColor
                  ? (store.peers.get(session.peerIds[0])?.name ?? '?').charAt(0).toUpperCase()
                  : avatar
                }
              </div>
              <div className={styles.info}>
                <div className={styles.name}>{session.name}</div>
                {lastMsg && (
                  <div className={styles.preview}>
                    {lastMsg.self ? 'You: ' : ''}{lastMsg.text}
                  </div>
                )}
              </div>
              {unread > 0 && (
                <div className={styles.badge}>{unread > 99 ? '99+' : unread}</div>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
