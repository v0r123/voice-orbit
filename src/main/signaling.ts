import net from 'net'
import { EventEmitter } from 'events'
import { SignalingMessage, SIGNALING_PORT_FIXED } from '../shared/types'

export class SignalingServer extends EventEmitter {
  private server: net.Server | null = null
  private port: number = 0

  async start(port: number = SIGNALING_PORT_FIXED + (parseInt(process.env.INSTANCE ?? '0', 10))): Promise<void> {
    return new Promise((resolve) => {
      this.server = net.createServer((socket) => {
        let buffer = ''

        socket.on('data', (data) => {
          buffer += data.toString()
          const lines = buffer.split('\n')
          buffer = lines.pop() ?? ''

          for (const line of lines) {
            if (!line.trim()) continue
            try {
              const parsed = JSON.parse(line)
              // Skip registration packets (used by old architecture, ignore gracefully)
              if (parsed.register) continue
              // Every message received by our server is destined FOR US — emit to renderer
              const type = (parsed as any).type ?? 'unknown'
              console.log(`[Signaling] Received ${type} from ${(parsed as any).from ?? '?'}`)
              this.emit('signaling-message', parsed as SignalingMessage)
            } catch {
              console.error('Signaling parse error:', line)
            }
          }
        })

        socket.on('error', () => { /* ignore client disconnect errors */ })
      })

      this.server.on('error', (err: any) => {
        if (err.code === 'EADDRINUSE') {
          // Fixed port busy — fall back to random
          console.warn(`[Signaling] Port ${port} in use, falling back to random port`)
          this.server!.listen(0, '0.0.0.0', () => {
            this.port = (this.server!.address() as net.AddressInfo).port
            console.log(`[Signaling] Listening on fallback port ${this.port}`)
            resolve()
          })
        }
      })

      this.server.listen(port, '0.0.0.0', () => {
        this.port = (this.server!.address() as net.AddressInfo).port
        console.log(`[Signaling] Listening on port ${this.port}`)
        resolve()
      })
    })
  }

  getPort(): number { return this.port }

  stop() {
    this.server?.close()
  }
}
