/**
 * updatePackager.ts — builds update zip using only Node.js built-ins.
 * No external dependencies (archiver etc.) — works from inside app.asar.
 *
 * ZIP format implemented manually:
 *   Local file header + data + Central directory + End of central directory
 */

import path from 'path'
import os   from 'os'
import zlib from 'zlib'
import { app } from 'electron'

// Use original-fs to bypass Electron's ASAR virtual filesystem interception.
// Regular fs.copyFileSync on a path containing 'app.asar' gets intercepted
// and treats the .asar file as a virtual directory — causing ENOENT errors.
// original-fs talks directly to the OS, treating .asar as a plain file.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const fs = require('original-fs') as typeof import('fs')

export interface UpdatePackageInfo {
  filePath: string
  fileName: string
  fileSize: number
  version:  string
}

// ── ZIP builder (pure Node.js, no external deps) ─────────────────

interface ZipEntry {
  name: string       // path inside zip
  data: Buffer
}

function dosDateTime(d: Date): { date: number; time: number } {
  const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2)
  return { date, time }
}

function crc32(buf: Buffer): number {
  const table = (() => {
    const t = new Uint32Array(256)
    for (let i = 0; i < 256; i++) {
      let c = i
      for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      t[i] = c
    }
    return t
  })()
  let crc = 0xffffffff
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function buildZip(entries: ZipEntry[]): Buffer {
  const parts: Buffer[] = []
  const central: Buffer[] = []
  let offset = 0
  const now = new Date()
  const { date: dosDate, time: dosTime } = dosDateTime(now)

  for (const entry of entries) {
    const nameBytes = Buffer.from(entry.name, 'utf8')
    const compressed = zlib.deflateRawSync(entry.data, { level: 9 })
    const crc = crc32(entry.data)
    const useCompressed = compressed.length < entry.data.length
    const compData = useCompressed ? compressed : entry.data
    const method   = useCompressed ? 8 : 0   // 8 = deflate, 0 = store

    // Local file header
    const local = Buffer.alloc(30 + nameBytes.length)
    local.writeUInt32LE(0x04034b50,         0)   // signature
    local.writeUInt16LE(20,                  4)   // version needed
    local.writeUInt16LE(0,                   6)   // flags
    local.writeUInt16LE(method,              8)   // compression
    local.writeUInt16LE(dosTime,            10)
    local.writeUInt16LE(dosDate,            12)
    local.writeUInt32LE(crc,               14)
    local.writeUInt32LE(compData.length,   18)   // compressed size
    local.writeUInt32LE(entry.data.length, 22)   // uncompressed size
    local.writeUInt16LE(nameBytes.length,  26)   // filename length
    local.writeUInt16LE(0,                 28)   // extra length
    nameBytes.copy(local, 30)

    // Central directory entry
    const cent = Buffer.alloc(46 + nameBytes.length)
    cent.writeUInt32LE(0x02014b50,         0)   // signature
    cent.writeUInt16LE(20,                  4)   // version made by
    cent.writeUInt16LE(20,                  6)   // version needed
    cent.writeUInt16LE(0,                   8)   // flags
    cent.writeUInt16LE(method,             10)
    cent.writeUInt16LE(dosTime,            12)
    cent.writeUInt16LE(dosDate,            14)
    cent.writeUInt32LE(crc,               16)
    cent.writeUInt32LE(compData.length,   20)
    cent.writeUInt32LE(entry.data.length, 24)
    cent.writeUInt16LE(nameBytes.length,  28)
    cent.writeUInt16LE(0,                 30)   // extra length
    cent.writeUInt16LE(0,                 32)   // comment length
    cent.writeUInt16LE(0,                 34)   // disk start
    cent.writeUInt16LE(0,                 36)   // internal attr
    cent.writeUInt32LE(0,                 38)   // external attr
    cent.writeUInt32LE(offset,            42)   // local header offset
    nameBytes.copy(cent, 46)

    parts.push(local, compData)
    central.push(cent)
    offset += local.length + compData.length
  }

  const centralBuf = Buffer.concat(central)
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50,        0)   // signature
  eocd.writeUInt16LE(0,                  4)   // disk number
  eocd.writeUInt16LE(0,                  6)   // disk with central dir
  eocd.writeUInt16LE(entries.length,     8)   // entries on disk
  eocd.writeUInt16LE(entries.length,    10)   // total entries
  eocd.writeUInt32LE(centralBuf.length, 12)   // central dir size
  eocd.writeUInt32LE(offset,            16)   // central dir offset
  eocd.writeUInt16LE(0,                 20)   // comment length

  return Buffer.concat([...parts, centralBuf, eocd])
}

// ── Helpers ───────────────────────────────────────────────────────

function copyDirSync(src: string, dst: string) {
  fs.mkdirSync(dst, { recursive: true })
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name)
    const d = path.join(dst, entry.name)
    if (entry.isDirectory()) copyDirSync(s, d)
    else fs.copyFileSync(s, d)
  }
}

function readDirEntries(dir: string, prefix = ''): ZipEntry[] {
  const entries: ZipEntry[] = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const zipName = prefix ? `${prefix}/${entry.name}` : entry.name
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      entries.push(...readDirEntries(full, zipName))
    } else {
      entries.push({ name: zipName, data: fs.readFileSync(full) })
    }
  }
  return entries
}

function makeUpdaterBat(appName: string, version: string, pid: number): string {
  // Note: uses wmic instead of tasklist|find because find.exe in CMD
  // can conflict and leave cmd processes hanging.
  // PowerShell is used to launch the app to avoid flashing console windows.
  return `@echo off
chcp 65001 >nul
title VoiceOrbit Updater v${version}

set "SCRIPT_DIR=%~dp0"
set "APP_DIR=%SCRIPT_DIR%.."
set "ASAR_SRC=%SCRIPT_DIR%resources\\app.asar"
set "ASAR_DST=%APP_DIR%\\resources\\app.asar"
set "APP_EXE=%APP_DIR%\\${appName}.exe"
set "TARGET_PID=${pid}"

echo [1/4] Waiting for PID %TARGET_PID% (${appName}) to close...

:WAIT_LOOP
wmic process where "ProcessId='%TARGET_PID%'" get ProcessId 2>nul | findstr /r "[0-9]" >nul
if not errorlevel 1 (
  timeout /t 1 /nobreak >nul
  goto WAIT_LOOP
)
echo     Process %TARGET_PID% closed.

echo [2/4] Applying update...
if not exist "%ASAR_SRC%" (
  echo ERROR: app.asar not found at %ASAR_SRC%
  pause
  exit /b 1
)

copy /y "%ASAR_SRC%" "%ASAR_DST%" >nul
if errorlevel 1 (
  echo ERROR: Could not replace app.asar - try running as Administrator
  pause
  exit /b 1
)
echo     app.asar replaced.

if exist "%SCRIPT_DIR%resources\\app.asar.unpacked\\" (
  xcopy /e /i /q /y "%SCRIPT_DIR%resources\\app.asar.unpacked" "%APP_DIR%\\resources\\app.asar.unpacked" >nul
  echo     app.asar.unpacked updated.
)

echo [3/4] Update complete!
echo [4/4] Starting ${appName}...
timeout /t 1 /nobreak >nul

powershell -WindowStyle Hidden -Command "Start-Process '%APP_EXE%'"

echo Done. This window will close.
timeout /t 2 /nobreak >nul

cd /d "%APP_DIR%"
rd /s /q "%SCRIPT_DIR%" 2>nul
exit /b 0
`
}

// ── Main export ───────────────────────────────────────────────────

export async function buildUpdatePackageOnDemand(version: string): Promise<UpdatePackageInfo | null> {
  let appDir:  string
  let appName: string
  let asarPath: string

  if (app.isPackaged) {
    appDir   = path.dirname(process.execPath)
    appName  = path.basename(process.execPath, '.exe')
    asarPath = path.join(appDir, 'resources', 'app.asar')
  } else {
    const projectRoot = path.join(__dirname, '../../..')
    appDir   = path.join(projectRoot, 'release', 'win-unpacked')
    appName  = 'VoiceOrbit'
    asarPath = path.join(appDir, 'resources', 'app.asar')
    if (!fs.existsSync(asarPath)) {
      console.warn('[Packager] Dev: no release/win-unpacked. Run: electron-builder --dir')
      return null
    }
  }

  const outPath = path.join(appDir, `VoiceOrbit-update-${version}.zip`)

  // Return cached zip
  if (fs.existsSync(outPath)) {
    const stat = fs.statSync(outPath)
    console.log(`[Packager] Cached: ${path.basename(outPath)} (${(stat.size/1024/1024).toFixed(1)} MB)`)
    return { filePath: outPath, fileName: path.basename(outPath), fileSize: stat.size, version }
  }

  if (!fs.existsSync(asarPath)) {
    console.error('[Packager] app.asar not found:', asarPath)
    return null
  }

  try {
    console.log(`[Packager] Building update zip v${version} (pure Node.js, no external deps)...`)

    // Copy locked files to temp
    const tmpDir  = os.tmpdir()
    const tmpAsar = path.join(tmpDir, `vo-asar-${version}.tmp`)
    fs.copyFileSync(asarPath, tmpAsar)
    console.log(`[Packager] Copied app.asar (${(fs.statSync(tmpAsar).size/1024/1024).toFixed(1)} MB)`)

    const unpackedSrc  = path.join(appDir, 'resources', 'app.asar.unpacked')
    const tmpUnpacked  = path.join(tmpDir, `vo-unpacked-${version}.tmp`)
    const hasUnpacked  = fs.existsSync(unpackedSrc)
    if (hasUnpacked) {
      copyDirSync(unpackedSrc, tmpUnpacked)
      console.log('[Packager] Copied app.asar.unpacked')
    }

    // Build zip entries
    const entries: ZipEntry[] = []

    entries.push({ name: 'resources/app.asar', data: fs.readFileSync(tmpAsar) })

    if (hasUnpacked) {
      entries.push(...readDirEntries(tmpUnpacked, 'resources/app.asar.unpacked'))
    }

    entries.push({
      name: 'updater.bat',
      data: Buffer.from(makeUpdaterBat(appName, version, 0), 'utf8'),
    })

    entries.push({
      name: 'update-meta.json',
      data: Buffer.from(JSON.stringify({ version, appName, asarOnly: true, builtAt: new Date().toISOString() }, null, 2), 'utf8'),
    })

    // Write zip
    console.log(`[Packager] Compressing ${entries.length} entries...`)
    const zipBuf = buildZip(entries)
    fs.writeFileSync(outPath, zipBuf)

    // Cleanup temp
    try { fs.unlinkSync(tmpAsar) } catch { /* ok */ }
    try { if (hasUnpacked) fs.rmSync(tmpUnpacked, { recursive: true }) } catch { /* ok */ }

    // Remove old version zips
    fs.readdirSync(appDir)
      .filter(f => f.startsWith('VoiceOrbit-update-') && f.endsWith('.zip') && !f.includes(version))
      .forEach(f => { try { fs.unlinkSync(path.join(appDir, f)) } catch { /* ok */ } })

    const stat = fs.statSync(outPath)
    console.log(`[Packager] Done: ${path.basename(outPath)} (${(stat.size/1024/1024).toFixed(1)} MB)`)
    return { filePath: outPath, fileName: path.basename(outPath), fileSize: stat.size, version }

  } catch (err: any) {
    console.error('[Packager] Error:', err.message)
    try { if (fs.existsSync(outPath)) fs.unlinkSync(outPath) } catch { /* ok */ }
    return null
  }
}
