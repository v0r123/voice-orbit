/**
 * ChatDrawer
 *
 * Panel is ALWAYS position:absolute; right:0; width=<current>.
 * It never moves. Visibility is controlled by CSS visibility+opacity only.
 * Resize = only width changes = panel grows LEFT. Right edge stays fixed.
 *
 * Open   → visibility:visible, opacity:1
 * Closed → visibility:hidden,  opacity:0  (no layout change, no movement)
 *
 * Tab: 12px wide pill, vertically centered, rounded left corners.
 */
import { useState, useRef, useCallback, useEffect } from 'react'
import styles from './ChatDrawer.module.css'

interface Props {
  children:      React.ReactNode
  isOpen:        boolean
  onOpen:        () => void
  defaultWidth?: number
  unreadCount?:  number   // total unread across all chats
}

const MIN_W = 240
const MAX_W = 700

export function ChatDrawer({ children, isOpen, onOpen, defaultWidth = 300, unreadCount = 0 }: Props) {
  const [width,    setWidth]    = useState(defaultWidth)
  const [ripples,  setRipples]  = useState<{ id: number; x: number; y: number }[]>([])
  const [dragging, setDragging] = useState(false)
  const ridRef     = useRef(0)
  const dragStartX = useRef(0)
  const dragStartW = useRef(0)

  /* ── Tab ripple ──────────────────────────────────────────── */
  const handleTabClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const id   = ++ridRef.current
    setRipples(p => [...p.slice(-4), { id, x: e.clientX - rect.left, y: e.clientY - rect.top }])
    setTimeout(() => setRipples(p => p.filter(r => r.id !== id)), 700)
    onOpen()
  }, [onOpen])

  /* ── Resize grip ─────────────────────────────────────────── */
  const onGripDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation()
    dragStartX.current = e.clientX
    dragStartW.current = width
    setDragging(true)
  }, [width])

  useEffect(() => {
    if (!dragging) return
    const move = (e: MouseEvent) => {
      // drag LEFT = bigger (right wall fixed, left edge moves)
      const delta = dragStartX.current - e.clientX
      setWidth(Math.max(MIN_W, Math.min(MAX_W, dragStartW.current + delta)))
    }
    const up = () => setDragging(false)
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
    return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up) }
  }, [dragging])

  return (
    <>
      {/* Tab — shown only when panel is closed */}
      {!isOpen && (
        <div className={styles.tab} onClick={handleTabClick}>
          {ripples.map(r => (
            <span key={r.id} className={styles.ripple}
              style={{ left: r.x, top: r.y }} />
          ))}

          {/* Icon + badge together so badge sits top-right of icon */}
          <div className={styles.tabIconWrap}>
            <svg className={styles.tabIcon} viewBox="0 0 24 24" fill="none">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"
                stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            {unreadCount > 0 && (
              <div className={styles.badge}>
                {unreadCount > 99 ? '99+' : unreadCount}
              </div>
            )}
          </div>
        </div>
      )}

      {/*
        Panel: ALWAYS right:0, ALWAYS width=current.
        Never moves. open/close = opacity + pointer-events only.
        Resize drag only changes width → left edge moves, right stays.
      */}
      <div
        className={styles.panel}
        style={{
          width,
          opacity:       isOpen ? 1 : 0,
          visibility:    isOpen ? 'visible' : 'hidden',
          pointerEvents: isOpen ? 'auto' : 'none',
          transition:    dragging
            ? 'none'
            : 'opacity 0.22s ease, visibility 0.22s ease',
        }}
      >
        {/* Resize grip — left edge */}
        <div
          className={`${styles.grip} ${dragging ? styles.gripActive : ''}`}
          onMouseDown={onGripDown}
        >
          <div className={styles.gripBar} />
        </div>

        <div className={styles.content}>{children}</div>
      </div>
    </>
  )
}
