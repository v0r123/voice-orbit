import { workerData, parentPort } from 'worker_threads'
import http from 'http'
import fs from 'fs'

interface PendingFile {
  filePath: string
  fileName: string
  fileSize: number
  keepAlive?: boolean   // if true, don't remove after first download
}

const pending = new Map<string, PendingFile>()
// Active sockets per fileId — needed to kill mid-transfer
const activeSockets = new Map<string, Set<import('stream').Writable>>()
const { port: preferredPort } = workerData as { port: number }

parentPort?.on('message', (msg: any) => {
  if (msg.type === 'register') {
    pending.set(msg.fileId, {
      filePath: msg.filePath,
      fileName: msg.fileName,
      fileSize: msg.fileSize,
      keepAlive: msg.keepAlive ?? false,
    })
  }
  if (msg.type === 'unregister') {
    pending.delete(msg.fileId)
    // Kill any active HTTP connections for this file
    const sockets = activeSockets.get(msg.fileId)
    if (sockets) {
      for (const sock of sockets) {
        try { sock.destroy() } catch { /* ok */ }
      }
      activeSockets.delete(msg.fileId)
    }
  }
})

const server = http.createServer((req, res) => {
  const match = req.url?.match(/^\/file\/([^/]+)$/)
  if (req.method !== 'GET' || !match) {
    res.writeHead(404); res.end(); return
  }

  const fileId = match[1]
  const entry = pending.get(fileId)
  if (!entry || !fs.existsSync(entry.filePath)) {
    res.writeHead(404); res.end(); return
  }

  const { filePath, fileName, fileSize } = entry

  res.writeHead(200, {
    'Content-Type': 'application/octet-stream',
    'Content-Disposition': `attachment; filename="${encodeURIComponent(fileName)}"`,
    'Content-Length': fileSize,
    'Access-Control-Allow-Origin': '*',
  })

  // Track this socket so we can destroy it on abort
  if (!activeSockets.has(fileId)) activeSockets.set(fileId, new Set())
  activeSockets.get(fileId)!.add(res)
  res.on('close', () => activeSockets.get(fileId)?.delete(res))

  const stream = fs.createReadStream(filePath)
  let sent = 0
  let lastProgress = 0

  stream.on('data', (chunk) => {
    sent += (chunk as Buffer).length
    const progress = Math.round((sent / fileSize) * 100)
    if (progress !== lastProgress) {
      lastProgress = progress
      parentPort?.postMessage({ type: 'progress', fileId, progress })
    }
  })

  stream.on('end', () => {
    parentPort?.postMessage({ type: 'sent', fileId })
    // Only remove if not keepAlive (update packages should stay registered)
    if (!pending.get(fileId)?.keepAlive) {
      pending.delete(fileId)
    }
    activeSockets.delete(fileId)
  })

  stream.on('error', () => {
    res.destroy()
    activeSockets.get(fileId)?.delete(res)
  })

  stream.pipe(res)
})

const tryListen = (port: number) => {
  server.once('error', (err: any) => {
    if (err.code === 'EADDRINUSE') tryListen(port + 1)
  })
  server.listen(port, '0.0.0.0', () => {
    const actualPort = (server.address() as any).port
    parentPort?.postMessage({ type: 'ready', port: actualPort })
  })
}

tryListen(preferredPort)
