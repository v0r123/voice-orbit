# Developer Setup — Prisma 7 + SQLite + Electron

## First-time setup

```bash
npm install

# 1. Rebuild better-sqlite3 native module for Electron's Node ABI
npm run rebuild

# 2. Push schema to DB (creates DB file + all tables)
npm run db:push

# 3. Generate Prisma Client
npm run db:generate

# 4. Start dev server
npm run dev
```

## After changing prisma/schema.prisma

```bash
npm run db:push       # apply schema changes to existing DB
npm run db:generate   # regenerate TypeScript client
```

## Prisma 7 notes

Prisma 7 removed `url` from `datasource` in `schema.prisma`.  
Connection is now configured in `prisma.config.ts` via a driver adapter:

```
prisma.config.ts          ← adapter config (better-sqlite3)
prisma/schema.prisma      ← table definitions only
src/main/db/client.ts     ← runtime PrismaClient with adapter
```

The `prisma.config.ts` computes the DB path the same way Electron's
`app.getPath('userData')` does, without importing Electron — so it works
both in CLI context (`npm run db:push`) and in the Electron runtime.

## DB file location

Data is stored **next to the executable** — the installation is fully portable.

| Environment | Path |
|-------------|------|
| Packaged | `<install dir>/data/voiceorbit.db` |
| Dev | `<project root>/data/voiceorbit.db` |

Override with `VOICEORBIT_DB_PATH` env var (useful for tests or CI).

## Production build

```bash
npm run build
npx electron-builder
```

`electron-builder` config (in `package.json`) handles:
- `asarUnpack`: `better-sqlite3`, `@prisma/client`, `@prisma/adapter-better-sqlite3`
  — native `.node` files must live outside the asar archive
- `extraResources`: `prisma/schema.prisma` and `prisma.config.ts`
  — needed for runtime `db push` fallback

