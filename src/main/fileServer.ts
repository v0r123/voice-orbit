import { Worker } from 'worker_threads'
import path from 'path'
import { EventEmitter } from 'events'
import { FILE_SERVER_PORT_BASE } from '../shared/types'

export class FileServer extends EventEmitter {
  private worker: Worker | null = null
  private port = 0

  async start(): Promise<void> {
    const instanceIndex = parseInt(process.env.INSTANCE ?? '0', 10)
    const preferredPort = FILE_SERVER_PORT_BASE + instanceIndex

    return new Promise((resolve) => {
      // In dev: ts-node runs from src, worker file is .ts compiled to same dist dir
      // In prod: worker file is compiled .js next to this file
      const workerPath = path.join(__dirname, 'fileWorker.js')

      this.worker = new Worker(workerPath, {
        workerData: { port: preferredPort },
      })

      this.worker.on('message', (msg: any) => {
        if (msg.type === 'ready') {
          this.port = msg.port
          console.log(`[FileServer] Worker listening on port ${this.port}`)
          resolve()
        }
        if (msg.type === 'progress') {
          this.emit('progress', { fileId: msg.fileId, progress: msg.progress })
        }
        if (msg.type === 'sent') {
          this.emit('sent', { fileId: msg.fileId })
        }
      })

      this.worker.on('error', (err) => {
        console.error('[FileServer] Worker error:', err)
      })
    })
  }

  registerFile(fileId: string, filePath: string, fileName: string, fileSize: number, keepAlive = false) {
    this.worker?.postMessage({ type: 'register', fileId, filePath, fileName, fileSize, keepAlive })
  }

  unregisterFile(fileId: string) {
    this.worker?.postMessage({ type: 'unregister', fileId })
  }

  getPort() { return this.port }

  stop() {
    this.worker?.terminate()
    this.worker = null
  }
}
