/**
 * db/paths.ts
 *
 * Single source of truth for the data directory.
 *
 * Packaged : <dir with VoiceOrbit.exe>/data/
 * Dev      : <project root>/data/
 *
 * The `data/` folder sits next to the executable so the entire
 * installation is self-contained and portable — users can copy
 * the folder and keep their history and settings.
 */

import path from 'path'
import fs   from 'fs'
import { app } from 'electron'

let _dataDir: string | null = null

export function getDataDir(): string {
  if (_dataDir) return _dataDir

  const base = app.isPackaged
    ? path.dirname(process.execPath)   // next to VoiceOrbit.exe
    : path.join(__dirname, '../../..') // <project root> in dev

  _dataDir = path.join(base, 'data')
  if (!fs.existsSync(_dataDir)) {
    fs.mkdirSync(_dataDir, { recursive: true })
  }
  return _dataDir
}

export function getDbPath(): string {
  return path.join(getDataDir(), 'voiceorbit.db')
}
