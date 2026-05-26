import dgram from 'dgram'
import { EventEmitter } from 'events'
import os from 'os'
import { v4 as uuidv4 } from 'uuid'
import {
  Peer, DiscoveryPacket,
  DISCOVERY_PORT, SIGNALING_PORT_BASE, PLANET_COLORS,
} from '../shared/types'

const BROADCAST_INTERVAL = 2000
const PEER_TTL = 8000

// Each instance gets its own loopback UDP port so broadcasts reach all local copies
// Instance 0 = normal, instance 1/2/3 = test copies
const instanceIndex = parseInt(process.env.INSTANCE ?? '0', 10)
// All instances still share the same multicast group port for LAN discovery
// but also send to every instance's dedicated loopback port
const INSTANCE_PORTS = [DISCOVERY_PORT, DISCOVERY_PORT + 1, DISCOVERY_PORT + 2, DISCOVERY_PORT + 3]

export class DiscoveryService extends EventEmitter {
  private socket: dgram.Socket | null = null
  private peers: Map<string, Peer> = new Map()
  private broadcastTimer: NodeJS.Timeout | null = null
  private cleanupTimer:   NodeJS.Timeout | null = null
  private stopped = false

  public readonly selfId: string = uuidv4()
  public selfName: string = instanceIndex > 0
    ? `${os.hostname()} #${instanceIndex + 1}`
    : os.hostname()
  public selfColor: string = PLANET_COLORS[instanceIndex % PLANET_COLORS.length]
  // Each instance gets a deterministic signaling port range so they don't collide
  public signalingPort: number = 0
  public filePort: number = 0

  // The UDP port THIS instance listens on
  private readonly listenPort: number = INSTANCE_PORTS[instanceIndex] ?? DISCOVERY_PORT

  // Collect all local IPv4 addresses of this machine
  private getLocalIps(): string[] {
    const result: string[] = ['127.0.0.1']
    const ifaces = os.networkInterfaces()
    for (const iface of Object.values(ifaces)) {
      if (!iface) continue
      for (const addr of iface) {
        if (addr.family === 'IPv4') result.push(addr.address)
      }
    }
    return result
  }

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.socket = dgram.createSocket({ type: 'udp4', reuseAddr: true })

      this.socket.on('error', (err) => {
        if (this.stopped) return
        console.error('Discovery socket error:', err)
        reject(err)
      })

      this.socket.on('message', (msg, rinfo) => {
        if (this.stopped) return
        try {
          const packet: DiscoveryPacket = JSON.parse(msg.toString())
          if (packet.id === this.selfId) return
          if (packet.type === 'HELLO') this.handleHello(packet, rinfo.address)
          else if (packet.type === 'BYE') this.handleBye(packet.id)
        } catch { /* ignore malformed */ }
      })

      this.socket.bind(this.listenPort, () => {
        try {
          this.socket!.setBroadcast(true)
          // Join multicast-like group: bind to 0.0.0.0 to receive broadcast
        } catch { /* ok */ }
        console.log(`[Discovery] Listening on UDP port ${this.listenPort} (instance ${instanceIndex})`)
        resolve()
      })

      this.broadcastTimer = setInterval(() => { if (!this.stopped) this.broadcast() }, BROADCAST_INTERVAL)
      this.cleanupTimer   = setInterval(() => { if (!this.stopped) this.cleanup()   }, 3000)
      setTimeout(() => { if (!this.stopped) this.broadcast() }, 500)
    })
  }

  // Public — call after name/color change to push update immediately
  broadcastNow() { this.broadcast() }

  private broadcast() {
    if (!this.socket || this.stopped) return
    const packet: DiscoveryPacket = {
      type: 'HELLO', id: this.selfId,
      name: this.selfName, color: this.selfColor,
      signalingPort: this.signalingPort,
      filePort: this.filePort,
      localIps: this.getLocalIps(),
    }
    const msg = Buffer.from(JSON.stringify(packet))

    // 1. Send to all LAN broadcast addresses (real network peers)
    const ifaces = os.networkInterfaces()
    for (const iface of Object.values(ifaces)) {
      if (!iface) continue
      for (const addr of iface) {
        if (addr.family === 'IPv4' && !addr.internal) {
          const parts = addr.address.split('.')
          parts[3] = '255'
          try { this.socket!.send(msg, DISCOVERY_PORT, parts.join('.')) } catch { /* ok */ }
        }
      }
    }
    try { this.socket!.send(msg, DISCOVERY_PORT, '255.255.255.255') } catch { /* ok */ }

    // 2. Send to every other instance's loopback port (localhost multi-instance support)
    for (let i = 0; i < INSTANCE_PORTS.length; i++) {
      if (INSTANCE_PORTS[i] === this.listenPort) continue // skip self
      try { this.socket!.send(msg, INSTANCE_PORTS[i], '127.0.0.1') } catch { /* ok */ }
    }
  }

  private handleHello(packet: DiscoveryPacket, ip: string) {
    const existing = this.peers.get(packet.id)
    const now = Date.now()
    // Same-host detection: compare non-loopback IPs only
    // (every machine has 127.0.0.1, so loopback must be excluded from comparison)
    const myIps = this.getLocalIps().filter(a => a !== '127.0.0.1' && !a.startsWith('127.'))
    const remoteIps = (packet.localIps ?? []).filter(a => a !== '127.0.0.1' && !a.startsWith('127.'))
    const sameHost = myIps.length > 0 && remoteIps.some(remoteIp => myIps.includes(remoteIp))
    const effectiveIp = sameHost ? '127.0.0.1' : ip
    if (!existing) {
      const peer: Peer = {
        id: packet.id, name: packet.name, color: packet.color,
        ip: effectiveIp, signalingPort: packet.signalingPort, filePort: packet.filePort ?? 0, lastSeen: now,
        orbitIndex: this.getNextOrbitIndex(),
        orbitAngle: Math.random() * Math.PI * 2,
        orbitSpeed: 0.0003 + Math.random() * 0.0004,
      }
      this.peers.set(packet.id, peer)
      this.emit('peer-found', peer)
    } else {
      const nameChanged  = existing.name  !== packet.name
      const colorChanged = existing.color !== packet.color
      existing.lastSeen      = now
      existing.name          = packet.name
      existing.color         = packet.color
      existing.ip            = effectiveIp
      existing.signalingPort = packet.signalingPort
      existing.filePort = packet.filePort ?? 0
      // Notify renderer if visible properties changed
      if (nameChanged || colorChanged) {
        this.emit('peer-updated', { ...existing })
      }
    }
  }

  private handleBye(peerId: string) {
    if (this.peers.has(peerId)) {
      this.peers.delete(peerId)
      this.emit('peer-lost', peerId)
    }
  }

  private cleanup() {
    const now = Date.now()
    for (const [id, peer] of this.peers.entries()) {
      if (now - peer.lastSeen > PEER_TTL) {
        this.peers.delete(id)
        this.emit('peer-lost', id)
      }
    }
  }

  private getNextOrbitIndex(): number {
    const used = new Set(Array.from(this.peers.values()).map(p => p.orbitIndex))
    for (let i = 0; i < 10; i++) if (!used.has(i)) return i
    return this.peers.size
  }

  getPeers(): Peer[] { return Array.from(this.peers.values()) }

  updateSelf(name: string, color: string) {
    this.selfName  = name
    this.selfColor = color
  }

  stopWithBye() {
    if (this.stopped) return
    if (this.broadcastTimer) clearInterval(this.broadcastTimer)
    if (this.cleanupTimer)   clearInterval(this.cleanupTimer)
    this.stopped = true
    if (!this.socket) return
    const packet: DiscoveryPacket = {
      type: 'BYE', id: this.selfId,
      name: this.selfName, color: this.selfColor,
      signalingPort: this.signalingPort,
      filePort: this.filePort,
    }
    const msg = Buffer.from(JSON.stringify(packet))
    // Send BYE to all instance ports too
    const targets: Array<[string, number]> = [
      ['255.255.255.255', DISCOVERY_PORT],
      ...INSTANCE_PORTS.filter(p => p !== this.listenPort).map(p => ['127.0.0.1', p] as [string, number]),
    ]
    let pending = targets.length
    const done = () => {
      if (--pending <= 0) {
        try { this.socket?.close() } catch { /* ok */ }
        this.socket = null
      }
    }
    for (const [addr, port] of targets) {
      try { this.socket.send(msg, port, addr, done) } catch { done() }
    }
  }

  stop() {
    if (this.stopped) return
    if (this.broadcastTimer) clearInterval(this.broadcastTimer)
    if (this.cleanupTimer)   clearInterval(this.cleanupTimer)
    this.stopped = true
    try { this.socket?.close() } catch { /* ok */ }
    this.socket = null
  }
}
