/**
 * db/client.ts
 *
 * Initialises the Prisma client for Electron.
 *
 * Key considerations:
 *  - DB file lives in app.getPath('userData') — writable on all platforms
 *  - DATABASE_URL must be set BEFORE importing PrismaClient
 *  - better-sqlite3 is a native module → must be rebuilt for Electron's Node ABI
 *    via `electron-rebuild` (run once after npm install)
 *  - We use `prisma db push` (no migrations) for simplicity — schema changes
 *    are applied on startup; safe for a local-only app
 */

/**
 * db/client.ts
 *
 * Provides a DB connection for repository operations.
 *
 * Two modes:
 *  1. Prisma Client (after `npm run db:generate`) — full ORM
 *  2. Raw better-sqlite3 (before generate) — same interface via thin wrapper
 *
 * The repository layer only calls methods that both modes support.
 */

import { getDbPath } from './paths'

let _client: any = null

export async function getDb(): Promise<any> {
  if (_client) return _client

  const dbPath = getDbPath()

  // Try Prisma Client first (available after npm run db:generate)
  try {
    const { PrismaClient }        = await import('../generated/prisma' as any)
    const { PrismaBetterSqlite3 } = await import('@prisma/adapter-better-sqlite3')
    const adapter = new PrismaBetterSqlite3({ url: dbPath })
    _client = new PrismaClient({ adapter })
    await _client.$connect()
    console.log('[DB] Prisma Client connected:', dbPath)
    return _client
  } catch {
    // Prisma Client not generated yet — fall back to raw better-sqlite3 wrapper
    console.warn('[DB] Prisma Client unavailable, using raw SQLite')
  }

  // Minimal wrapper that exposes the same interface repository.ts uses
  const Database = (await import('better-sqlite3')).default
  const db = new (Database as any)(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  _client = makeSqliteWrapper(db)
  console.log('[DB] Raw SQLite connected:', dbPath)
  return _client
}

export async function closeDb() {
  if (_client) {
    try { await _client.$disconnect?.() } catch { /* ok */ }
    try { _client._rawDb?.close?.() }     catch { /* ok */ }
    _client = null
    console.log('[DB] Disconnected')
  }
}

/**
 * Thin wrapper around better-sqlite3 that mimics the Prisma Client API
 * used in repository.ts (findMany, findUnique, upsert, update, deleteMany, create).
 */
function makeSqliteWrapper(db: any) {
  const client = { _rawDb: db } as any

  // $executeRawUnsafe (used by old fallback, keep for safety)
  client.$executeRawUnsafe = (sql: string, ...args: any[]) => {
    return Promise.resolve(db.prepare(sql).run(...args))
  }
  client.$disconnect = () => { db.close(); return Promise.resolve() }

  // Table proxy factory
  const table = (name: string) => ({
    findMany: ({ where, orderBy, take }: any = {}) => {
      let sql = `SELECT * FROM "${name}"`
      const params: any[] = []
      if (where) {
        const clauses = buildWhere(where, params)
        if (clauses) sql += ` WHERE ${clauses}`
      }
      if (orderBy) {
        const [col, dir] = Object.entries(orderBy)[0] as [string, string]
        sql += ` ORDER BY "${col}" ${dir === 'asc' ? 'ASC' : 'DESC'}`
      }
      if (take) sql += ` LIMIT ${take}`
      return Promise.resolve(db.prepare(sql).all(...params))
    },
    findUnique: ({ where }: any) => {
      const params: any[] = []
      const clauses = buildWhere(where, params)
      const row = db.prepare(`SELECT * FROM "${name}" WHERE ${clauses}`).get(...params)
      return Promise.resolve(row ?? null)
    },
    upsert: ({ where, create, update }: any) => {
      const existing = db.prepare(
        `SELECT 1 FROM "${name}" WHERE ${buildWhere(where, [])}`
      ).get(...Object.values(where))
      if (existing) {
        if (Object.keys(update).length > 0) {
          const sets = Object.keys(update).map(k => `"${k}" = ?`).join(', ')
          db.prepare(`UPDATE "${name}" SET ${sets} WHERE ${buildWhere(where, [])}`
          ).run(...Object.values(update), ...Object.values(where))
        }
      } else {
        const all = { ...create }
        const cols = Object.keys(all).map(k => `"${k}"`).join(', ')
        const vals = Object.keys(all).map(() => '?').join(', ')
        db.prepare(`INSERT INTO "${name}" (${cols}) VALUES (${vals})`).run(...Object.values(all))
      }
      return Promise.resolve()
    },
    update: ({ where, data }: any) => {
      const params: any[] = []
      const sets = Object.keys(data).map(k => `"${k}" = ?`).join(', ')
      const clause = buildWhere(where, params)
      db.prepare(`UPDATE "${name}" SET ${sets} WHERE ${clause}`
      ).run(...Object.values(data), ...params)
      return Promise.resolve()
    },
    deleteMany: ({ where }: any) => {
      const params: any[] = []
      const clause = buildWhere(where, params)
      db.prepare(`DELETE FROM "${name}" WHERE ${clause}`).run(...params)
      return Promise.resolve()
    },
    delete: ({ where }: any) => {
      const params: any[] = []
      const clause = buildWhere(where, params)
      db.prepare(`DELETE FROM "${name}" WHERE ${clause}`).run(...params)
      return Promise.resolve()
    },
    create: ({ data }: any) => {
      const cols = Object.keys(data).map(k => `"${k}"`).join(', ')
      const vals = Object.keys(data).map(() => '?').join(', ')
      db.prepare(`INSERT INTO "${name}" (${cols}) VALUES (${vals})`).run(...Object.values(data))
      return Promise.resolve()
    },
  })

  // Map Prisma model names to SQLite table names
  client.chatSession    = table('chat_sessions')
  client.message        = table('messages')
  client.fileTransfer   = table('file_transfers')
  client.reaction       = table('reactions')
  client.peerProfile    = table('peer_profiles')
  client.appSettings    = table('app_settings')
  client.chatNotifSettings = table('chat_notif_settings')

  return client
}

function buildWhere(where: any, params: any[]): string {
  return Object.entries(where)
    .map(([k, v]) => {
      if (v === null || v === undefined) {
        return `"${k}" IS NULL`
      }
      if (typeof v === 'object' && v !== null) {
        // handle { lt, gt, contains } operators
        const [op, val] = Object.entries(v)[0] as [string, any]
        params.push(val)
        const opMap: any = { lt: '<', gt: '>', lte: '<=', gte: '>=', contains: 'LIKE' }
        const sqlVal = op === 'contains' ? `%${val}%` : val
        params[params.length - 1] = sqlVal
        return `"${k}" ${opMap[op] ?? '='} ?`
      }
      params.push(v)
      return `"${k}" = ?`
    })
    .join(' AND ')
}



