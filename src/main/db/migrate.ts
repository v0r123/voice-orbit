/**
 * db/migrate.ts
 *
 * Creates all tables on startup.
 *
 * Strategy:
 *  1. Try `prisma db push` (available after `npm run db:push`)
 *  2. Fallback: create tables directly via better-sqlite3 (no Prisma Client needed)
 *     This always works — even before `npm run db:generate`
 */

import path from 'path'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { app } from 'electron'
import { getDbPath } from './paths'

const execFileAsync = promisify(execFile)

const TABLES = [
  `CREATE TABLE IF NOT EXISTS "chat_sessions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "peerIds" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isGroup" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS "messages" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "chatId" TEXT NOT NULL,
    "fromId" TEXT NOT NULL,
    "fromName" TEXT NOT NULL,
    "fromColor" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "ts" DATETIME NOT NULL,
    "self" INTEGER NOT NULL DEFAULT 0,
    "editedAt" DATETIME,
    "deletedAt" DATETIME,
    "original" TEXT,
    FOREIGN KEY ("chatId") REFERENCES "chat_sessions"("id") ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS "file_transfers" (
    "fileId" TEXT NOT NULL PRIMARY KEY,
    "chatId" TEXT NOT NULL,
    "fromId" TEXT NOT NULL,
    "fromName" TEXT NOT NULL,
    "fromColor" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "mimeType" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "savePath" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("chatId") REFERENCES "chat_sessions"("id") ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS "chat_notif_settings" (
    "chatId" TEXT NOT NULL PRIMARY KEY,
    "muted" INTEGER NOT NULL DEFAULT 0,
    "soundEnabled" INTEGER NOT NULL DEFAULT 1,
    "desktopEnabled" INTEGER NOT NULL DEFAULT 1,
    FOREIGN KEY ("chatId") REFERENCES "chat_sessions"("id") ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS "reactions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "messageId" TEXT NOT NULL,
    "fromId" TEXT NOT NULL,
    "emoji" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("messageId") REFERENCES "messages"("id") ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS "peer_profiles" (
    "peerId" TEXT NOT NULL PRIMARY KEY,
    "nickname" TEXT,
    "status" TEXT NOT NULL DEFAULT 'online',
    "statusMsg" TEXT NOT NULL DEFAULT '',
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS "app_settings" (
    "id" INTEGER NOT NULL PRIMARY KEY DEFAULT 1,
    "data" TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS "messages_chatId_ts_idx"
    ON "messages"("chatId","ts")`,
  `CREATE INDEX IF NOT EXISTS "file_transfers_chatId_idx"
    ON "file_transfers"("chatId")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "reactions_unique"
    ON "reactions"("messageId","fromId","emoji")`,
]

export async function runMigrations(): Promise<void> {
  const dbPath = getDbPath()

  // Always run the direct SQL migration first — it's instant and needs no Prisma CLI
  await runDirectMigration(dbPath)

  // Optionally also run prisma db push to keep Prisma's internal schema metadata in sync
  // (only when CLI is available — not critical for the app to function)
  try {
    const prismaBin = app.isPackaged
      ? path.join(process.resourcesPath, 'node_modules/.bin/prisma')
      : path.join(__dirname, '../../../node_modules/.bin/prisma')

    const schemaPath = app.isPackaged
      ? path.join(process.resourcesPath, 'prisma/schema.prisma')
      : path.join(__dirname, '../../../prisma/schema.prisma')

    await execFileAsync(prismaBin, [
      'db', 'push',
      '--schema', schemaPath,
      '--skip-generate',
      '--accept-data-loss',
    ], {
      env: { ...process.env, VOICEORBIT_DB_PATH: dbPath },
      cwd: app.isPackaged ? process.resourcesPath : path.join(__dirname, '../../..'),
      timeout: 10_000,
    })
    console.log('[DB] prisma db push OK')
  } catch {
    // Silently ignore — tables already created by runDirectMigration above
  }
}

/**
 * Creates all tables directly via better-sqlite3.
 * Works without Prisma Client or CLI — this is the primary migration path.
 */
async function runDirectMigration(dbPath: string): Promise<void> {
  // Dynamic import — better-sqlite3 is a native module, must be outside asar
  const Database = (await import('better-sqlite3')).default
  const db = new (Database as any)(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  for (const sql of TABLES) {
    db.exec(sql)
  }
  db.close()
  console.log('[DB] Tables ready:', dbPath)
}
