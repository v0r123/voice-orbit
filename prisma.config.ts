import path from 'node:path'
import { defineConfig } from 'prisma/config'

// DB lives in <project root>/data/voiceorbit.db (dev)
// or <install dir>/data/voiceorbit.db (packaged).
//
// For CLI commands (db:push, db:generate) we always use the project root.
// Override with VOICEORBIT_DB_PATH env var if needed (e.g. CI, packaging).
const dbPath = process.env.VOICEORBIT_DB_PATH
  ?? path.join(process.cwd(), 'data', 'voiceorbit.db')

export default defineConfig({
  earlyAccess: true,
  schema: './prisma/schema.prisma',
  datasource: {
    url: `file:${dbPath}`,
  },
})

