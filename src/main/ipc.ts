import { IpcMain, BrowserWindow, dialog, shell, app } from 'electron'
import net from 'net'
import fs from 'fs'
import http from 'http'
import path from 'path'
import os from 'os'
import crypto from 'crypto'
import { DiscoveryService } from './discovery'
import { SignalingServer } from './signaling'
import { FileServer } from './fileServer'
import { AppSettings } from '../shared/types'

// Active downloads — fileId → abort controller (destroy the response)
const activeDownloads = new Map<string, () => void>()

// Update build queue — prevents concurrent builds
let buildInProgress = false
let buildResult: any = null
const buildWaiters: Array<(result: any) => void> = []

export function setupIpcHandlers(
  ipcMain: IpcMain,
  win: BrowserWindow,
  discovery: DiscoveryService,
  signaling: SignalingServer,
  fileServer: FileServer,
) {
  ipcMain.handle('get-self-info', () => ({
    id:   discovery.selfId,
    name: discovery.selfName,
    color: discovery.selfColor,
    signalingPort: signaling.getPort(),
    filePort: fileServer.getPort(),
  }))

  ipcMain.handle('get-peers', () => discovery.getPeers())

  ipcMain.on('send-signaling', (_e, peerIp: string, peerPort: number, message: object) => {
    sendSignalingToPeer(peerIp, peerPort, message)
  })

  ipcMain.on('update-settings', (_e, settings: Partial<AppSettings>) => {
    if (settings.userName !== undefined || settings.userColor !== undefined) {
      discovery.updateSelf(
        settings.userName  ?? discovery.selfName,
        settings.userColor ?? discovery.selfColor,
      )
      discovery.broadcastNow()
    }
  })

  // ── File: pick file and register with server ──────────────────
  ipcMain.handle('file-pick', async () => {
    const result = await dialog.showOpenDialog(win, {
      properties: ['openFile'],
      title: 'Select file to send',
    })
    if (result.canceled || !result.filePaths.length) return null
    const filePath = result.filePaths[0]
    const stat = fs.statSync(filePath)
    return {
      filePath,
      fileName: path.basename(filePath),
      fileSize: stat.size,
      mimeType: 'application/octet-stream',
    }
  })

  ipcMain.on('file-register', (_e, fileId: string, filePath: string, fileName: string, fileSize: number) => {
    fileServer.registerFile(fileId, filePath, fileName, fileSize)
  })

  // ── File: download incoming file (with abort support) ───────────
  ipcMain.handle('file-download', async (_e, peerIp: string, transferPort: number, fileId: string, fileName: string, fileSize: number) => {
    const result = await dialog.showSaveDialog(win, {
      defaultPath: path.join(os.homedir(), 'Downloads', fileName),
      title: 'Save received file',
    })
    if (result.canceled || !result.filePath) return { ok: false }

    const savePath = result.filePath
    const url = `http://${peerIp}:${transferPort}/file/${fileId}`

    return new Promise<{ ok: boolean; savePath?: string; aborted?: boolean }>((resolve) => {
      const fileStream = fs.createWriteStream(savePath)
      let received = 0
      let aborted = false

      const req = http.get(url, (res) => {
        if (res.statusCode !== 200) {
          fileStream.close()
          try { fs.unlinkSync(savePath) } catch { /* ok */ }
          activeDownloads.delete(fileId)
          resolve({ ok: false })
          return
        }

        // Throttle progress events — send max every 200ms to avoid flooding main thread
        let lastProgressTs = 0
        res.on('data', (chunk: Buffer) => {
          if (aborted) return
          received += chunk.length
          const now = Date.now()
          if (now - lastProgressTs > 200 || received === fileSize) {
            lastProgressTs = now
            const progress = Math.round((received / fileSize) * 100)
            win.webContents.send('file-download-progress', { fileId, progress })
          }
        })

        res.pipe(fileStream)

        fileStream.on('finish', () => {
          if (aborted) return
          fileStream.close()
          activeDownloads.delete(fileId)
          win.webContents.send('file-download-progress', { fileId, progress: 100 })
          resolve({ ok: true, savePath })
        })

        res.on('error', () => {
          fileStream.close()
          if (!aborted) try { fs.unlinkSync(savePath) } catch { /* ok */ }
          activeDownloads.delete(fileId)
          resolve({ ok: aborted ? false : false, aborted })
        })
      })

      req.on('error', () => {
        fileStream.close()
        if (!aborted) try { fs.unlinkSync(savePath) } catch { /* ok */ }
        activeDownloads.delete(fileId)
        resolve({ ok: false, aborted })
      })

      // Register abort function
      activeDownloads.set(fileId, () => {
        aborted = true
        req.destroy()
        fileStream.close()
        try { fs.unlinkSync(savePath) } catch { /* ok */ }
        activeDownloads.delete(fileId)
        win.webContents.send('file-download-progress', { fileId, progress: -1 })  // -1 = aborted
        resolve({ ok: false, aborted: true })
      })
    })
  })

  // ── File: abort download ──────────────────────────────────────
  ipcMain.on('file-abort', (_e, fileId: string) => {
    const abort = activeDownloads.get(fileId)
    if (abort) abort()
  })

  // Unregister file (sender notified of abort)
  ipcMain.on('file-unregister', (_e, fileId: string) => {
    fileServer.unregisterFile(fileId)
  })

  // Apply downloaded update zip — pure Node.js unzip, no adm-zip dependency
  ipcMain.handle('apply-update', async (_e, zipPath: string) => {
    if (process.platform !== 'win32') {
      return { ok: false, error: 'Auto-update only supported on Windows' }
    }
    try {
      // Use original-fs to read the zip (bypass ASAR interception)
      const ofs  = require('original-fs') as typeof import('fs')
      const zlib = require('zlib')

      const zipBuf = ofs.readFileSync(zipPath)

      // ── Minimal ZIP reader ──────────────────────────────────────
      interface Entry { name: string; data: Buffer }

      function readZip(buf: Buffer): Entry[] {
        const entries: Entry[] = []
        let i = 0
        while (i < buf.length - 4) {
          if (buf.readUInt32LE(i) !== 0x04034b50) { i++; continue }
          const method      = buf.readUInt16LE(i + 8)
          const compSize    = buf.readUInt32LE(i + 18)
          const nameLen     = buf.readUInt16LE(i + 26)
          const extraLen    = buf.readUInt16LE(i + 28)
          const name        = buf.slice(i + 30, i + 30 + nameLen).toString('utf8')
          const dataStart   = i + 30 + nameLen + extraLen
          const compData    = buf.slice(dataStart, dataStart + compSize)
          const data        = method === 8 ? zlib.inflateRawSync(compData) : compData
          if (!name.endsWith('/')) entries.push({ name, data })
          i = dataStart + compSize
        }
        return entries
      }

      const entries  = readZip(zipBuf)
      const metaEntry = entries.find(e => e.name === 'update-meta.json')
      if (!metaEntry) return { ok: false, error: 'Not a valid VoiceOrbit update package' }

      const metaData = JSON.parse(metaEntry.data.toString())
      console.log(`[Update] Package verified: v${metaData.version}`)

      // Extract to _update_<version>/ next to exe
      const appDir    = path.dirname(process.execPath)
      const updateDir = path.join(appDir, `_update_${metaData.version}`)
      if (ofs.existsSync(updateDir)) ofs.rmSync(updateDir, { recursive: true })
      ofs.mkdirSync(updateDir, { recursive: true })

      for (const entry of entries) {
        const outPath = path.join(updateDir, ...entry.name.split('/'))
        ofs.mkdirSync(path.dirname(outPath), { recursive: true })
        ofs.writeFileSync(outPath, entry.data)
      }
      console.log(`[Update] Extracted ${entries.length} files to ${updateDir}`)

      const updaterBat = path.join(updateDir, 'updater.bat')
      if (!ofs.existsSync(updaterBat)) {
        return { ok: false, error: 'updater.bat missing from package' }
      }

      // Patch updater.bat with the real PID of THIS process
      // so it waits only for this instance, not all VoiceOrbit processes
      const currentPid = process.pid
      let batContent = ofs.readFileSync(updaterBat, 'utf8')
      batContent = batContent.replace('set "TARGET_PID=0"', `set "TARGET_PID=${currentPid}"`)
      ofs.writeFileSync(updaterBat, batContent, 'utf8')
      console.log(`[Update] Patched updater.bat with PID ${currentPid}`)

      // Launch updater in a new visible window
      const { execFile } = require('child_process')
      execFile('cmd.exe', ['/c', 'start', 'cmd.exe', '/k', updaterBat], {
        detached:    true,
        stdio:       'ignore',
        cwd:         updateDir,
        windowsHide: false,
      })

      setTimeout(() => app.quit(), 1000)
      return { ok: true, version: metaData.version }
    } catch (err: any) {
      console.error('[Update] Apply failed:', err.message)
      return { ok: false, error: err.message }
    }
  })

  // Download update file to app dir without prompting user for path
  ipcMain.handle('download-update', async (_e, peerIp: string, peerFilePort: number, fileId: string, fileName: string, fileSize: number) => {
    try {
      const appDir  = app.isPackaged ? path.dirname(process.execPath) : os.tmpdir()
      const outPath = path.join(appDir, fileName)

      const fileStream = fs.createWriteStream(outPath)
      const url = `http://${peerIp}:${peerFilePort}/file/${fileId}`

      await new Promise<void>((resolve, reject) => {
        const req = http.get(url, res => {
          if (res.statusCode !== 200) { reject(new Error(`HTTP ${res.statusCode}`)); return }

          let received = 0
          let lastPct  = 0
          res.on('data', (chunk: Buffer) => {
            received += chunk.length
            const pct = Math.round(received / fileSize * 100)
            if (pct !== lastPct) {
              lastPct = pct
              win.webContents.send('update-download-progress', pct)
            }
          })
          res.pipe(fileStream)
          fileStream.on('finish', () => { fileStream.close(); resolve() })
          res.on('error', reject)
        })
        req.on('error', reject)
      })

      return { ok: true, zipPath: outPath }
    } catch (err: any) {
      console.error('[Update] Download failed:', err.message)
      return { ok: false, error: err.message }
    }
  })

  // Build update zip on demand — queues concurrent requests, builds only once
  ipcMain.handle('build-and-register-update', async (_e, version: string) => {
    // If already built and cached, return immediately
    if (buildResult) {
      console.log('[IPC] Returning cached update package')
      return buildResult
    }

    // If build already in progress, wait for it to finish
    if (buildInProgress) {
      console.log('[IPC] Build already in progress — waiting...')
      return new Promise(resolve => buildWaiters.push(resolve))
    }

    // Start the build
    buildInProgress = true
    console.log('[IPC] Starting update package build...')

    try {
      const isPackaged = app.isPackaged
      const execPath   = process.execPath
      const appDir     = path.dirname(execPath)
      const asarPath   = path.join(appDir, 'resources', 'app.asar')
      const asarExists = fs.existsSync(asarPath)

      // Send diagnostics to renderer so they appear in DevTools
      const diag = {
        isPackaged,
        execPath,
        appDir,
        asarPath,
        asarExists,
        version,
        __dirname,
      }
      console.log('[IPC] build-and-register-update diagnostics:', JSON.stringify(diag, null, 2))
      win.webContents.send('update-diagnostic', diag)

      // Patch console.error temporarily to capture packager logs
      const origError = console.error
      const origLog   = console.log
      const packagerLogs: string[] = []
      console.error = (...a) => { origError(...a); packagerLogs.push('ERR: ' + a.join(' ')) }
      console.log   = (...a) => { origLog(...a);   packagerLogs.push('LOG: ' + a.join(' ')) }

      let pkg: any = null
      try {
        const { buildUpdatePackageOnDemand } = require('./updatePackager')
        pkg = await buildUpdatePackageOnDemand(version)
      } finally {
        console.error = origError
        console.log   = origLog
        win.webContents.send('update-diagnostic', { packagerLogs })
      }

      let result = null
      if (pkg) {
        const fileId = 'on-demand-update'
        fileServer.registerFile(fileId, pkg.filePath, pkg.fileName, pkg.fileSize, true /* keepAlive */)
        result = { fileId, fileName: pkg.fileName, fileSize: pkg.fileSize, version: pkg.version }
        buildResult = result
        console.log(`[IPC] Update package ready: ${pkg.fileName}`)
        win.webContents.send('update-diagnostic', { success: true, fileName: pkg.fileName })
      } else {
        console.log('[IPC] buildUpdatePackageOnDemand returned null')
        win.webContents.send('update-diagnostic', { success: false, reason: 'packager returned null' })
      }

      for (const resolve of buildWaiters) resolve(result)
      buildWaiters.length = 0
      return result
    } catch (err: any) {
      const msg = `[IPC] build-and-register-update threw: ${err.message}`
      console.error(msg)
      win.webContents.send('update-diagnostic', { success: false, error: err.message, stack: err.stack })
      for (const resolve of buildWaiters) resolve(null)
      buildWaiters.length = 0
      return null
    } finally {
      buildInProgress = false
    }
  })

  // Get app version
  ipcMain.handle('get-app-version', () => {
    // Try multiple paths: dev (src/main/main/) and prod (dist/main/main/)
    const candidates = [
      path.join(__dirname, '../../../package.json'),   // dev: 3 levels up from src/main/main
      path.join(__dirname, '../../package.json'),      // prod: 2 levels up from dist/main/main
      path.join(process.resourcesPath ?? '', 'package.json'),  // packaged app
    ]
    for (const pkgPath of candidates) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
        if (pkg.version) {
          console.log(`[Version] Read ${pkg.version} from ${pkgPath}`)
          return pkg.version
        }
      } catch { /* try next */ }
    }
    return app.getVersion?.() ?? '1.0.0'
  })

  // Pick an update file (.exe/.zip) to share with others
  ipcMain.handle('update-pick-file', async () => {
    const result = await dialog.showOpenDialog(win, {
      title: 'Select update file to share',
      filters: [
        { name: 'Executable', extensions: ['exe', 'zip', 'dmg', 'AppImage'] },
        { name: 'All Files', extensions: ['*'] },
      ],
      properties: ['openFile'],
    })
    if (result.canceled || !result.filePaths.length) return null
    const filePath = result.filePaths[0]
    const stat = fs.statSync(filePath)
    return {
      filePath,
      fileName: path.basename(filePath),
      fileSize: stat.size,
    }
  })

  // Save clipboard image to temp file and register with file server
  ipcMain.handle('file-send-image', async (_e, _peerId: string, dataUrl: string, fileName: string) => {
    try {
      const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, '')
      const buffer = Buffer.from(base64, 'base64')
      const ext = dataUrl.match(/^data:image\/(\w+)/)?.[1] ?? 'png'
      const tmpPath = path.join(os.tmpdir(), `voiceorbit-${crypto.randomUUID()}.${ext}`)
      fs.writeFileSync(tmpPath, buffer)
      const fileId = crypto.randomUUID()
      fileServer.registerFile(fileId, tmpPath, fileName, buffer.length)
      return { fileId, filePath: tmpPath, fileName, fileSize: buffer.length, mimeType: `image/${ext}` }
    } catch (err: any) {
      console.error('[IPC] file-send-image error:', err.message)
      return null
    }
  })

  // Read a saved file as base64 data URL (for image preview after download)
  ipcMain.handle('file-read-as-data-url', async (_e, filePath: string) => {
    try {
      const buf = fs.readFileSync(filePath)
      const ext = path.extname(filePath).slice(1).toLowerCase() || 'png'
      const mime = ext === 'jpg' ? 'jpeg' : ext
      return `data:image/${mime};base64,${buf.toString('base64')}`
    } catch { return null }
  })

  // Open file in explorer
  ipcMain.on('file-show-in-folder', (_e, filePath: string) => {
    shell.showItemInFolder(filePath)
  })

  // Window controls
  ipcMain.on('window-minimize', () => win.minimize())
  ipcMain.on('window-maximize', () => {
    if (win.isMaximized()) win.unmaximize()
    else win.maximize()
  })
  ipcMain.on('window-close', () => {
    discovery.stopWithBye()
    win.close()
  })

  // Forward signaling events to renderer
  signaling.on('signaling-message', (msg) => {
    if (!win.isDestroyed()) win.webContents.send('signaling-message', msg)
  })
}

function sendSignalingToPeer(ip: string, port: number, message: object) {
  const type = (message as any).type ?? 'unknown'
  console.log(`[Signaling] Sending ${type} to ${ip}:${port}`)
  const socket = net.createConnection({ host: ip, port }, () => {
    socket.write(JSON.stringify(message) + '\n')
    socket.end()
  })
  socket.on('error', (err) => {
    console.error(`[Signaling] Send to ${ip}:${port} failed:`, err.message)
  })
}
