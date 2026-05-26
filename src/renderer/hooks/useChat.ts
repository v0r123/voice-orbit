import { useCallback, useEffect } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { useStore } from '../store'
import { SignalingMessage, ChatMessage, FileTransfer } from '../../shared/types'
import { registerSignalingHandler } from './useSignaling'

export function useChat() {
  const store = useStore()

  // ── Send text message to a chat session ──────────────────────
  const sendMessage = useCallback((chatId: string, text: string) => {
    const session = store.chatSessions.get(chatId)
    if (!session || !text.trim()) return

    const msgId = uuidv4()
    const ts    = Date.now()

    const chatMsg: ChatMessage = {
      id:        msgId,
      fromId:    store.selfId,
      fromName:  store.selfName,
      fromColor: store.selfColor,
      chatId,
      text:      text.trim(),
      ts,
      self:      true,
    }
    store.addMessage(chatMsg)

    // Send to all participants in the session
    for (const peerId of session.peerIds) {
      const peer = store.peers.get(peerId)
      if (!peer) continue
      const sig: SignalingMessage = {
        type: 'TEXT_MESSAGE',
        from: store.selfId,
        to:   peerId,
        text: text.trim(),
        msgId,
        ts,
        chatId,   // receiver uses this to route to correct session
      }
      window.electronAPI?.sendSignaling(peer.ip, peer.signalingPort, sig)
    }
  }, [store])

  // ── Send file to a chat session ───────────────────────────────
  const sendFile = useCallback(async (chatId: string) => {
    const session = store.chatSessions.get(chatId)
    if (!session) return

    const picked = await window.electronAPI?.filePick()
    if (!picked) return

    const { filePath, fileName, fileSize, mimeType } = picked
    const fileId = uuidv4()
    window.electronAPI?.fileRegister(fileId, filePath, fileName, fileSize)

    const ft: FileTransfer = {
      fileId, fileName, fileSize, mimeType,
      fromId:    store.selfId,
      fromName:  store.selfName,
      fromColor: store.selfColor,
      chatId,
      direction: 'outgoing',
      status:    'pending',
      progress:  0,
      createdAt: Date.now(),
    }
    store.addFileTransfer(ft)

    // Generate preview for images
    if (mimeType.startsWith('image/')) {
      window.electronAPI?.fileReadAsDataUrl(filePath).then(dataUrl => {
        if (dataUrl) store.updateFileTransfer(fileId, { previewData: dataUrl })
      }).catch(() => {})
    }

    // Send FILE_OFFER to all participants
    for (const peerId of session.peerIds) {
      const peer = store.peers.get(peerId)
      if (!peer) continue
      const sig: SignalingMessage = {
        type: 'FILE_OFFER',
        from: store.selfId,
        to:   peerId,
        fileId, fileName, fileSize, mimeType,
        chatId,
      }
      window.electronAPI?.sendSignaling(peer.ip, peer.signalingPort, sig)
    }
  }, [store])

  // ── Send clipboard image ──────────────────────────────────────
  const sendImageFromClipboard = useCallback(async (chatId: string, dataUrl: string) => {
    const session = store.chatSessions.get(chatId)
    if (!session) return

    const ts       = Date.now()
    const ext      = dataUrl.match(/^data:image\/(\w+)/)?.[1] ?? 'png'
    const fileName = `image-${ts}.${ext}`

    const result = await window.electronAPI?.fileSendImage('', dataUrl, fileName)
    if (!result) return

    const { fileId, fileSize, mimeType } = result
    const ft: FileTransfer = {
      fileId, fileName, fileSize, mimeType,
      fromId:      store.selfId,
      fromName:    store.selfName,
      fromColor:   store.selfColor,
      chatId,
      direction:   'outgoing',
      status:      'pending',
      progress:    0,
      createdAt:   ts,
      previewData: dataUrl,
    }
    store.addFileTransfer(ft)

    for (const peerId of session.peerIds) {
      const peer = store.peers.get(peerId)
      if (!peer) continue
      const sig: SignalingMessage = {
        type: 'FILE_OFFER',
        from: store.selfId,
        to:   peerId,
        fileId, fileName, fileSize, mimeType,
        previewData: dataUrl,
        chatId,
      }
      window.electronAPI?.sendSignaling(peer.ip, peer.signalingPort, sig)
    }
  }, [store])

  // ── Accept incoming file ──────────────────────────────────────
  const acceptFile = useCallback(async (fileId: string) => {
    const ft = store.fileTransfers.get(fileId)
    if (!ft) return
    const peer = store.peers.get(ft.fromId)
    if (!peer) return

    store.updateFileTransfer(fileId, { status: 'transferring' })

    const sig: SignalingMessage = {
      type:         'FILE_ACCEPT',
      from:         store.selfId,
      to:           ft.fromId,
      fileId,
      transferPort: store.filePort,
    }
    window.electronAPI?.sendSignaling(peer.ip, peer.signalingPort, sig)

    const result = await window.electronAPI?.fileDownload(
      peer.ip, peer.filePort,
      fileId, ft.fileName, ft.fileSize,
    )

    if (result?.ok) {
      let previewData: string | undefined
      if (ft.mimeType?.startsWith('image/') && result.savePath) {
        previewData = await window.electronAPI?.fileReadAsDataUrl(result.savePath) ?? undefined
      }
      store.updateFileTransfer(fileId, {
        status: 'done', progress: 100, savePath: result.savePath,
        ...(previewData ? { previewData } : {}),
      })
    } else if (result?.aborted) {
      store.updateFileTransfer(fileId, { status: 'rejected', progress: 0 })
      if (peer) {
        const sig: SignalingMessage = { type: 'FILE_REJECT', from: store.selfId, to: ft.fromId, fileId }
        window.electronAPI?.sendSignaling(peer.ip, peer.signalingPort, sig)
      }
    } else {
      store.updateFileTransfer(fileId, { status: 'error' })
    }
  }, [store])

  const rejectFile = useCallback((fileId: string) => {
    const ft = store.fileTransfers.get(fileId)
    if (!ft) return
    const peer = store.peers.get(ft.fromId)
    store.updateFileTransfer(fileId, { status: 'rejected' })
    if (peer) {
      const sig: SignalingMessage = { type: 'FILE_REJECT', from: store.selfId, to: ft.fromId, fileId }
      window.electronAPI?.sendSignaling(peer.ip, peer.signalingPort, sig)
    }
  }, [store])

  const abortFile = useCallback((fileId: string) => {
    const ft = store.fileTransfers.get(fileId)
    if (!ft) return
    store.updateFileTransfer(fileId, { status: 'rejected', progress: 0 })
    if (ft.direction === 'incoming') {
      window.electronAPI?.fileAbort(fileId)
      const peer = store.peers.get(ft.fromId)
      if (peer) {
        const sig: SignalingMessage = { type: 'FILE_REJECT', from: store.selfId, to: ft.fromId, fileId }
        window.electronAPI?.sendSignaling(peer.ip, peer.signalingPort, sig)
      }
    } else {
      window.electronAPI?.fileUnregister?.(fileId)
      const session = store.chatSessions.get(ft.chatId)
      if (session) {
        for (const peerId of session.peerIds) {
          const peer = store.peers.get(peerId)
          if (peer) {
            const sig: SignalingMessage = { type: 'FILE_REJECT', from: store.selfId, to: peerId, fileId }
            window.electronAPI?.sendSignaling(peer.ip, peer.signalingPort, sig)
          }
        }
      }
    }
  }, [store])

  // ── Handle incoming signaling ─────────────────────────────────
  const handleChatSignaling = useCallback((msg: SignalingMessage) => {
    if (msg.type === 'TEXT_MESSAGE') {
      const peer     = store.peers.get(msg.from)
      const peerName = store.localNicknames.get(msg.from) ?? peer?.name ?? 'Unknown'

      // Use chatId from signal — could be a group session
      // Ensure session exists (receiver may not have created it yet)
      let chatId = msg.chatId
      if (!store.chatSessions.has(chatId)) {
        if (chatId.startsWith('group:')) {
          // All IDs in the group (includes self)
          const allIds = chatId.replace('group:', '').split('+')
          // peerIds = everyone except self
          const peerIds = allIds.filter(id => id !== store.selfId)
          const peerNames = peerIds.map(id => {
            const p = store.peers.get(id)
            return store.localNicknames.get(id) ?? p?.name ?? id.slice(0, 6)
          })
          store.openOrCreateGroup(peerIds, peerNames)
        } else {
          store.openOrCreateDm(msg.from, peerName)
          chatId = `dm:${msg.from}`
        }
      }

      const chatMsg: ChatMessage = {
        id:        msg.msgId,
        fromId:    msg.from,
        fromName:  peerName,
        fromColor: peer?.color ?? '#4488ff',
        chatId,
        text:      msg.text,
        ts:        msg.ts,
        self:      false,
      }
      store.addMessage(chatMsg)
    }

    if (msg.type === 'FILE_OFFER') {
      const peer     = store.peers.get(msg.from)
      const peerName = store.localNicknames.get(msg.from) ?? peer?.name ?? 'Unknown'

      let chatId = msg.chatId
      if (!store.chatSessions.has(chatId)) {
        if (chatId.startsWith('group:')) {
          const allIds = chatId.replace('group:', '').split('+')
          const peerIds = allIds.filter(id => id !== store.selfId)
          const peerNames = peerIds.map(id => {
            const p = store.peers.get(id)
            return store.localNicknames.get(id) ?? p?.name ?? id.slice(0, 6)
          })
          store.openOrCreateGroup(peerIds, peerNames)
        } else {
          store.openOrCreateDm(msg.from, peerName)
          chatId = `dm:${msg.from}`
        }
      }

      const ft: FileTransfer = {
        fileId:      msg.fileId,
        fileName:    msg.fileName,
        fileSize:    msg.fileSize,
        mimeType:    msg.mimeType,
        fromId:      msg.from,
        fromName:    peerName,
        fromColor:   peer?.color ?? '#4488ff',
        chatId,
        direction:   'incoming',
        status:      'pending',
        progress:    0,
        createdAt:   Date.now(),
        previewData: msg.previewData,
      }
      store.addFileTransfer(ft)
    }

    if (msg.type === 'FILE_ACCEPT') {
      store.updateFileTransfer(msg.fileId, { status: 'transferring' })
    }

    if (msg.type === 'FILE_REJECT') {
      const ft = store.fileTransfers.get(msg.fileId)
      store.updateFileTransfer(msg.fileId, { status: 'rejected', progress: 0 })
      if (ft?.direction === 'outgoing') {
        window.electronAPI?.fileUnregister?.(msg.fileId)
      } else if (ft?.direction === 'incoming') {
        window.electronAPI?.fileAbort(msg.fileId)
      }
    }
  }, [store])

  useEffect(() => {
    window.electronAPI?.onFileProgress(({ fileId, progress }) => {
      store.updateFileTransfer(fileId, { progress })
    })
    window.electronAPI?.onFileSent(({ fileId }) => {
      store.updateFileTransfer(fileId, { status: 'done', progress: 100 })
    })
    window.electronAPI?.onFileDownloadProgress(({ fileId, progress }) => {
      if (progress === -1) {
        store.updateFileTransfer(fileId, { status: 'rejected', progress: 0 })
      } else {
        store.updateFileTransfer(fileId, {
          progress,
          status: progress === 100 ? 'done' : 'transferring',
        })
      }
    })
  }, [])

  useEffect(() => {
    return registerSignalingHandler('chat', handleChatSignaling)
  }, [handleChatSignaling])

  return { sendMessage, sendFile, sendImageFromClipboard, acceptFile, rejectFile, abortFile }
}
