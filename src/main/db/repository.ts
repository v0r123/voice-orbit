/**
 * db/repository.ts
 *
 * All database operations in one place.
 * IPC handlers call these functions — never raw Prisma from ipc.ts.
 *
 * Crossplatform notes:
 *  - All dates stored as ISO strings (SQLite has no native DateTime)
 *  - IDs are strings throughout (uuid / custom formats)
 *  - No platform-specific paths — all handled in client.ts
 */

import { getDb } from './client'

// ── Types mirrored from shared/types.ts ───────────────────────
// We re-declare minimal shapes here to avoid importing renderer types in main

interface ChatSessionRow {
  id: string
  peerIds: string        // JSON string
  name: string
  isGroup: boolean
  createdAt: string
}

interface MessageRow {
  id: string
  chatId: string
  fromId: string
  fromName: string
  fromColor: string
  text: string
  ts: string
  self: boolean
  editedAt?: string | null
  deletedAt?: string | null
  original?: string | null
}

interface FileTransferRow {
  fileId: string
  chatId: string
  fromId: string
  fromName: string
  fromColor: string
  fileName: string
  fileSize: number
  mimeType: string
  direction: string
  status: string
  savePath?: string | null
  createdAt: string
}

// ── Sessions ──────────────────────────────────────────────────

export async function upsertSession(session: ChatSessionRow) {
  const db = await getDb()
  await db.chatSession.upsert({
    where:  { id: session.id },
    create: {
      id:        session.id,
      peerIds:   session.peerIds,
      name:      session.name,
      isGroup:   session.isGroup,
      createdAt: new Date(session.createdAt),
    },
    update: {
      name:    session.name,
      peerIds: session.peerIds,
    },
  })
}

export async function loadAllSessions(): Promise<ChatSessionRow[]> {
  const db = await getDb()
  const rows = await db.chatSession.findMany({ orderBy: { createdAt: 'asc' } })
  return rows.map((r: any) => ({
    id:        r.id,
    peerIds:   r.peerIds,
    name:      r.name,
    isGroup:   r.isGroup,
    createdAt: r.createdAt.toISOString(),
  }))
}

export async function deleteSession(chatId: string) {
  const db = await getDb()
  await db.chatSession.delete({ where: { id: chatId } })
}

// ── Messages ──────────────────────────────────────────────────

export async function insertMessage(msg: MessageRow) {
  const db = await getDb()
  await db.message.upsert({
    where:  { id: msg.id },
    create: {
      id:        msg.id,
      chatId:    msg.chatId,
      fromId:    msg.fromId,
      fromName:  msg.fromName,
      fromColor: msg.fromColor,
      text:      msg.text,
      ts:        new Date(msg.ts),
      self:      msg.self,
    },
    update: {},   // don't overwrite existing messages on duplicate
  })
}

export async function loadMessages(
  chatId: string,
  opts: { limit?: number; before?: string } = {}
): Promise<MessageRow[]> {
  const db = await getDb()
  const rows = await db.message.findMany({
    where: {
      chatId,
      deletedAt: null,
      ...(opts.before ? { ts: { lt: new Date(opts.before) } } : {}),
    },
    orderBy: { ts: 'asc' },
    take:    opts.limit ?? 200,
  })
  return rows.map((r: any) => ({
    id:        r.id,
    chatId:    r.chatId,
    fromId:    r.fromId,
    fromName:  r.fromName,
    fromColor: r.fromColor,
    text:      r.text,
    ts:        r.ts.toISOString(),
    self:      r.self,
    editedAt:  r.editedAt?.toISOString() ?? null,
    deletedAt: r.deletedAt?.toISOString() ?? null,
    original:  r.original ?? null,
  }))
}

export async function loadAllMessages(): Promise<MessageRow[]> {
  const db = await getDb()
  const rows = await db.message.findMany({
    where:   { deletedAt: null },
    orderBy: { ts: 'asc' },
  })
  return rows.map((r: any) => ({
    id:        r.id,
    chatId:    r.chatId,
    fromId:    r.fromId,
    fromName:  r.fromName,
    fromColor: r.fromColor,
    text:      r.text,
    ts:        r.ts.toISOString(),
    self:      r.self,
    editedAt:  r.editedAt?.toISOString() ?? null,
    deletedAt: r.deletedAt?.toISOString() ?? null,
    original:  r.original ?? null,
  }))
}

// Future pkt 5: search
export async function searchMessages(query: string): Promise<MessageRow[]> {
  const db = await getDb()
  const rows = await db.message.findMany({
    where: {
      text:      { contains: query },
      deletedAt: null,
    },
    orderBy: { ts: 'desc' },
    take: 100,
  })
  return rows.map((r: any) => ({
    id:        r.id,
    chatId:    r.chatId,
    fromId:    r.fromId,
    fromName:  r.fromName,
    fromColor: r.fromColor,
    text:      r.text,
    ts:        r.ts.toISOString(),
    self:      r.self,
    editedAt:  r.editedAt?.toISOString() ?? null,
    deletedAt: r.deletedAt?.toISOString() ?? null,
    original:  r.original ?? null,
  }))
}

// Future pkt 6: edit
export async function editMessage(id: string, newText: string) {
  const db = await getDb()
  const msg = await db.message.findUnique({ where: { id } })
  if (!msg) return
  await db.message.update({
    where: { id },
    data:  {
      text:     newText,
      editedAt: new Date(),
      original: msg.original ?? msg.text,  // preserve first original
    },
  })
}

// Future pkt 6: delete (soft)
export async function deleteMessage(id: string) {
  const db = await getDb()
  await db.message.update({
    where: { id },
    data:  { deletedAt: new Date(), text: '' },
  })
}

// ── File Transfers ────────────────────────────────────────────

export async function upsertFileTransfer(ft: FileTransferRow) {
  const db = await getDb()
  await db.fileTransfer.upsert({
    where:  { fileId: ft.fileId },
    create: {
      fileId:    ft.fileId,
      chatId:    ft.chatId,
      fromId:    ft.fromId,
      fromName:  ft.fromName,
      fromColor: ft.fromColor,
      fileName:  ft.fileName,
      fileSize:  ft.fileSize,
      mimeType:  ft.mimeType,
      direction: ft.direction,
      status:    ft.status,
      savePath:  ft.savePath ?? null,
      createdAt: new Date(ft.createdAt),
    },
    update: {
      status:   ft.status,
      savePath: ft.savePath ?? null,
    },
  })
}

export async function loadFileTransfers(chatId?: string): Promise<FileTransferRow[]> {
  const db = await getDb()
  const rows = await db.fileTransfer.findMany({
    where:   chatId ? { chatId } : undefined,
    orderBy: { createdAt: 'asc' },
  })
  return rows.map((r: any) => ({
    fileId:    r.fileId,
    chatId:    r.chatId,
    fromId:    r.fromId,
    fromName:  r.fromName,
    fromColor: r.fromColor,
    fileName:  r.fileName,
    fileSize:  r.fileSize,
    mimeType:  r.mimeType,
    direction: r.direction,
    status:    r.status,
    savePath:  r.savePath ?? undefined,
    createdAt: r.createdAt.toISOString(),
  }))
}

// ── Reactions (future pkt 3) ──────────────────────────────────

export async function addReaction(messageId: string, fromId: string, emoji: string) {
  const db = await getDb()
  await db.reaction.upsert({
    where:  { messageId_fromId_emoji: { messageId, fromId, emoji } },
    create: { id: `${messageId}-${fromId}-${emoji}`, messageId, fromId, emoji },
    update: {},
  })
}

export async function removeReaction(messageId: string, fromId: string, emoji: string) {
  const db = await getDb()
  await db.reaction.deleteMany({ where: { messageId, fromId, emoji } })
}

export async function getReactions(messageId: string) {
  const db = await getDb()
  return db.reaction.findMany({ where: { messageId } })
}

// ── Peer profiles (future pkt 4) ─────────────────────────────

export async function upsertPeerProfile(peerId: string, data: {
  nickname?: string
  status?: string
  statusMsg?: string
}) {
  const db = await getDb()
  await db.peerProfile.upsert({
    where:  { peerId },
    create: { peerId, ...data },
    update: data,
  })
}

export async function getPeerProfile(peerId: string) {
  const db = await getDb()
  return db.peerProfile.findUnique({ where: { peerId } })
}

export async function loadAllPeerProfiles() {
  const db = await getDb()
  return db.peerProfile.findMany()
}

// ── App settings ──────────────────────────────────────────────

export async function saveAppSettings(data: object) {
  const db = await getDb()
  await db.appSettings.upsert({
    where:  { id: 1 },
    create: { id: 1, data: JSON.stringify(data) },
    update: { data: JSON.stringify(data) },
  })
}

export async function loadAppSettings(): Promise<object | null> {
  const db = await getDb()
  const row = await db.appSettings.findUnique({ where: { id: 1 } })
  if (!row) return null
  return JSON.parse(row.data)
}
