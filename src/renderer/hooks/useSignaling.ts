/**
 * Central signaling dispatcher.
 * Called ONCE at App root. Registers a single onSignalingMessage handler
 * and dispatches to registered sub-handlers by message type prefix.
 */
import { useEffect, useRef } from 'react'
import { SignalingMessage } from '../../shared/types'

type Handler = (msg: SignalingMessage) => void

const handlers = new Map<string, Handler>()

// Register a handler for a set of message type prefixes
export function registerSignalingHandler(id: string, handler: Handler) {
  handlers.set(id, handler)
  return () => { handlers.delete(id) }
}

// Called once at app root — sets up the single IPC listener
export function useSignalingDispatcher() {
  const started = useRef(false)
  useEffect(() => {
    if (started.current) return
    started.current = true
    window.electronAPI?.onSignalingMessage((msg: SignalingMessage) => {
      for (const handler of handlers.values()) {
        try { handler(msg) } catch (e) { console.error('Signaling handler error', e) }
      }
    })
  }, [])
}
