import { useEffect, useRef, useCallback } from 'react'
import { useStore } from '../../store'
import styles from './OrbitCanvas.module.css'

interface RenderedPlanet {
  peerId:      string
  x: number;  y: number
  radius:      number
  color:       string
  name:        string
  angle:       number
  orbitRadius: number
  speaking:    boolean
}

interface Star {
  x: number; y: number
  r: number
  baseAlpha: number
  twinkleOffset: number
  twinkleSpeed:  number
}

interface RocketState {
  x: number; y: number
  angle: number
  targetX: number; targetY: number
  flying: boolean
}

// Precomputed sin LUT — avoids Math.sin in hot path
const SIN_LUT_SIZE = 2048
const SIN_LUT = new Float32Array(SIN_LUT_SIZE)
for (let i = 0; i < SIN_LUT_SIZE; i++) {
  SIN_LUT[i] = Math.sin((i / SIN_LUT_SIZE) * Math.PI * 2)
}
function fastSin(x: number): number {
  const idx = ((x % (Math.PI * 2)) / (Math.PI * 2) * SIN_LUT_SIZE + SIN_LUT_SIZE) % SIN_LUT_SIZE
  return SIN_LUT[idx | 0]
}

interface Props {
  onPlanetClick: (peerId: string) => void
}

export function OrbitCanvas({ onPlanetClick }: Props) {
  const canvasRef      = useRef<HTMLCanvasElement>(null)
  const animRef        = useRef<number>(0)
  const planetsRef     = useRef<RenderedPlanet[]>([])
  const timeRef        = useRef(0)
  const rocketRef      = useRef<RocketState>({ x: 0, y: 0, angle: 0, targetX: 0, targetY: 0, flying: false })
  // Ripple effect: [{startT, color}]
  const ripplesRef     = useRef<{ startT: number; color: string }[]>([])
  const rocketInitRef  = useRef(false)

  // ── Offscreen canvases — drawn rarely, composited every frame ──
  const bgCanvasRef    = useRef<OffscreenCanvas | null>(null)   // static bg gradient
  const starCanvasRef  = useRef<OffscreenCanvas | null>(null)   // static star positions
  const starsRef       = useRef<Star[]>([])
  const bgDirtyRef     = useRef(true)
  const lastSkyKeyRef  = useRef('')
  const lastWRef       = useRef(0)
  const lastHRef       = useRef(0)

  const store          = useStore()
  const localNicknames = useStore(s => s.localNicknames)
  const unreadCounts      = useStore(s => s.unreadCounts)
  const lastIncomingMsgTs = useStore(s => s.lastIncomingMsgTs)

  // Planet style cache — avoid recreating gradients for static properties
  const planetCacheRef = useRef<Map<string, { color: string; img: OffscreenCanvas }>>(new Map())

  const ORBITS = [
    { radius: 0.20, speed: 0.00018, planetR: 18 },
    { radius: 0.28, speed: 0.00013, planetR: 16 },
    { radius: 0.36, speed: 0.00010, planetR: 15 },
    { radius: 0.44, speed: 0.00008, planetR: 14 },
    { radius: 0.52, speed: 0.00006, planetR: 13 },
  ]

  // ── Init stars (once) ─────────────────────────────────────────
  useEffect(() => {
    if (lastIncomingMsgTs === 0) return
    const cssVars = getComputedStyle(document.documentElement)
    const accent  = cssVars.getPropertyValue('--accent').trim() || '#4488ff'
    ripplesRef.current.push({ startT: timeRef.current, color: accent })
    // Keep max 3 ripples
    if (ripplesRef.current.length > 3) ripplesRef.current.shift()
  }, [lastIncomingMsgTs])

  useEffect(() => {
    starsRef.current = Array.from({ length: 160 }, () => ({
      x: Math.random(),
      y: Math.random(),
      r: Math.random() * 1.3 + 0.2,
      baseAlpha:     Math.random() * 0.55 + 0.1,
      twinkleOffset: Math.random() * SIN_LUT_SIZE,
      twinkleSpeed:  Math.random() * 0.3 + 0.1,   // very slow
    }))
    bgDirtyRef.current = true
  }, [])

  // ── Rebuild offscreen bg + stars when size changes ────────────
  const rebuildStaticCanvas = useCallback((W: number, H: number, skyInner = '#0d1428', skyMid = '#080d1e', skyOuter = '#040810') => {
    const dpr = window.devicePixelRatio || 1
    const pw = W * dpr, ph = H * dpr

    // Background gradient
    const bgOff = new OffscreenCanvas(pw, ph)
    const bgCtx = bgOff.getContext('2d')!
    bgCtx.scale(dpr, dpr)
    const bg = bgCtx.createRadialGradient(W/2, H/2, 0, W/2, H/2, Math.min(W,H)*0.8)
    bg.addColorStop(0,   skyInner)
    bg.addColorStop(0.5, skyMid)
    bg.addColorStop(1,   skyOuter)
    bgCtx.fillStyle = bg
    bgCtx.fillRect(0, 0, W, H)

    // Stars — drawn on bg to avoid extra composite
    for (const s of starsRef.current) {
      const alpha = s.baseAlpha
      bgCtx.globalAlpha = alpha
      bgCtx.beginPath()
      bgCtx.arc(s.x * W, s.y * H, s.r, 0, Math.PI * 2)
      bgCtx.fillStyle = '#ffffff'
      bgCtx.fill()
    }
    bgCtx.globalAlpha = 1

    bgCanvasRef.current = bgOff
    bgDirtyRef.current  = false
    lastWRef.current    = W
    lastHRef.current    = H
  }, [])

  // ── Pre-render planet body to offscreen ───────────────────────
  const getPlanetImage = useCallback((p: RenderedPlanet): OffscreenCanvas => {
    const cached = planetCacheRef.current.get(p.peerId)
    if (cached && cached.color === p.color) return cached.img

    const r   = p.radius
    const sz  = Math.ceil(r * 4)
    const off = new OffscreenCanvas(sz, sz)
    const ctx = off.getContext('2d')!
    const cx  = sz / 2, cy = sz / 2

    // Glow
    const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 2.2)
    glow.addColorStop(0, p.color + '44')
    glow.addColorStop(1, 'transparent')
    ctx.beginPath(); ctx.arc(cx, cy, r * 2.2, 0, Math.PI * 2)
    ctx.fillStyle = glow; ctx.fill()

    // Planet body
    const grad = ctx.createRadialGradient(cx - r*.35, cy - r*.35, r*.05, cx, cy, r)
    grad.addColorStop(0, lighten(p.color, 60))
    grad.addColorStop(0.5, p.color)
    grad.addColorStop(1, darken(p.color, 50))
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.fillStyle = grad; ctx.fill()

    // Specular
    const spec = ctx.createRadialGradient(cx - r*.4, cy - r*.4, 0, cx - r*.3, cy - r*.3, r*.5)
    spec.addColorStop(0, 'rgba(255,255,255,0.38)')
    spec.addColorStop(1, 'transparent')
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.fillStyle = spec; ctx.fill()

    // Surface detail — deterministic from peerId hash
    const seed = p.peerId.split('').reduce((a, c) => a + c.charCodeAt(0), 0)
    ctx.globalAlpha = 0.12
    for (let i = 0; i < 3; i++) {
      const bx = cx + ((seed * (i+1) * 37) % (r * 1.2)) - r * 0.6
      const by = cy + ((seed * (i+1) * 53) % (r * 1.0)) - r * 0.5
      const br = r * (0.15 + (seed * (i+7) % 10) / 40)
      ctx.beginPath(); ctx.arc(bx, by, br, 0, Math.PI * 2)
      ctx.fillStyle = darken(p.color, 40); ctx.fill()
    }
    ctx.globalAlpha = 1

    planetCacheRef.current.set(p.peerId, { color: p.color, img: off })
    return off
  }, [])

  // Clear planet cache when peers change (color update etc)
  useEffect(() => {
    // Only clear entries for peers that changed color
    for (const [id, cached] of planetCacheRef.current) {
      const peer = store.peers.get(id)
      if (!peer || cached.color !== peer.color) {
        planetCacheRef.current.delete(id)
      }
    }
  }, [store.peers])

  // ── Rocket target ─────────────────────────────────────────────
  useEffect(() => {
    if (store.selectedPeerIds.size === 0) {
      rocketRef.current.flying = false; return
    }
    const lastId = Array.from(store.selectedPeerIds).at(-1)!
    const planet = planetsRef.current.find(p => p.peerId === lastId)
    if (planet) {
      const ang = Math.atan2(planet.y - rocketRef.current.y, planet.x - rocketRef.current.x)
      rocketRef.current.targetX = planet.x - Math.cos(ang) * (planet.radius + 32)
      rocketRef.current.targetY = planet.y - Math.sin(ang) * (planet.radius + 32)
      rocketRef.current.flying  = true
    }
  }, [store.selectedPeerIds])

  const drawOrbit = useCallback((
    ctx: CanvasRenderingContext2D,
    cx: number, cy: number,
    r: number, t: number, i: number,
    hasPlanet: boolean,
    accentRgb: string,
  ) => {
    const wobble = r * (1 + fastSin(t * 0.0015 + i * 1.2) * 0.012)
    ctx.beginPath(); ctx.arc(cx, cy, wobble, 0, Math.PI * 2)
    ctx.strokeStyle = hasPlanet
      ? `rgba(${accentRgb},0.28)`
      : `rgba(${accentRgb},0.08)`
    ctx.lineWidth = hasPlanet ? 1.0 : 0.5
    ctx.setLineDash([4, 8]); ctx.stroke(); ctx.setLineDash([])
  }, [])

  const drawPlanet = useCallback((
    ctx: CanvasRenderingContext2D,
    p: RenderedPlanet,
    isSelected: boolean,
    t: number,
    img: OffscreenCanvas,
  ) => {
    const { x, y, radius } = p
    const sz = img.width

    // Speaking ring — single arc, no gradient
    if (p.speaking) {
      const pulse = fastSin(t * 0.01)
      ctx.beginPath()
      ctx.arc(x, y, radius * (1.7 + pulse * 0.35), 0, Math.PI * 2)
      ctx.strokeStyle = `rgba(100,255,150,${0.28 + pulse * 0.18})`
      ctx.lineWidth = 2; ctx.stroke()
    }

    // Selection rings — only 2 instead of 3 for perf
    if (isSelected) {
      for (let i = 1; i <= 2; i++) {
        const phase = fastSin(t * 0.004 + i * 0.8)
        ctx.beginPath()
        ctx.arc(x, y, radius * (1.7 + i * 0.6 + phase * 0.1), 0, Math.PI * 2)
        ctx.strokeStyle = `rgba(255,210,60,${(0.45 - i * 0.12) * (0.7 + phase * 0.3)})`
        ctx.lineWidth = 2.2 - i * 0.4; ctx.stroke()
      }
    }

    // Planet body from offscreen cache — single drawImage
    ctx.drawImage(img, x - sz/2, y - sz/2)

    // Label
    ctx.font = '11px "Exo 2",sans-serif'
    ctx.textAlign = 'center'
    ctx.fillStyle = isSelected ? 'rgba(255,220,100,0.95)' : 'rgba(255,255,255,0.75)'
    ctx.fillText(p.name, x, y + radius + 16)
  }, [])

  const drawConnectionLines = useCallback((
    ctx: CanvasRenderingContext2D,
    planets: RenderedPlanet[],
    participants: Map<string, any>,
    rocketX: number,
    rocketY: number,
    t: number,
  ) => {
    if (participants.size < 2) return
    const inCall = planets.filter(p => participants.has(p.peerId))
    if (inCall.length === 0) return

    const pulse = fastSin(t * 0.003) * 0.5 + 0.5   // 0..1

    for (const p of inCall) {
      ctx.beginPath()
      ctx.moveTo(rocketX, rocketY)
      ctx.lineTo(p.x, p.y)
      ctx.strokeStyle = `rgba(${p.color.replace('#','').match(/../g)!
        .map(h => parseInt(h,16)).join(',')},${0.15 + pulse * 0.1})`
      ctx.lineWidth = 0.8
      ctx.setLineDash([3, 6]); ctx.stroke(); ctx.setLineDash([])
    }
  }, [])

  const drawSun = useCallback((
    ctx: CanvasRenderingContext2D,
    x: number, y: number,
    t: number,
    sunColor: string,
  ) => {
    const pulse = fastSin(t * 0.0008) * 0.06 + 1
    const r     = 22 * pulse

    const glow = ctx.createRadialGradient(x, y, 0, x, y, r * 2.8)
    glow.addColorStop(0,   sunColor + '99')
    glow.addColorStop(0.5, sunColor + '33')
    glow.addColorStop(1,   'transparent')
    ctx.beginPath(); ctx.arc(x, y, r * 2.8, 0, Math.PI * 2)
    ctx.fillStyle = glow; ctx.fill()

    const body = ctx.createRadialGradient(x - r*.3, y - r*.3, 0, x, y, r)
    body.addColorStop(0,   lighten(sunColor, 50))
    body.addColorStop(0.6, sunColor)
    body.addColorStop(1,   darken(sunColor, 30))
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fillStyle = body; ctx.fill()
  }, [])

  const drawIncomingEffect = useCallback((
    ctx: CanvasRenderingContext2D,
    rocketX: number, rocketY: number,
    callerPlanet: RenderedPlanet | undefined,
    t: number,
  ) => {
    // 3 expanding rings
    for (let i = 0; i < 3; i++) {
      const phase = ((t * 0.0008 + i * 0.33) % 1)
      ctx.beginPath(); ctx.arc(rocketX, rocketY, 14 + phase * 50, 0, Math.PI * 2)
      ctx.strokeStyle = `rgba(80,200,255,${(1 - phase) * 0.6})`
      ctx.lineWidth = 1.5; ctx.stroke()
    }
    if (callerPlanet) {
      const dash = (t * 0.035) % 20
      ctx.save(); ctx.setLineDash([7, 11]); ctx.lineDashOffset = -dash
      ctx.beginPath()
      ctx.moveTo(callerPlanet.x, callerPlanet.y)
      ctx.lineTo(rocketX, rocketY)
      ctx.strokeStyle = callerPlanet.color + '88'
      ctx.lineWidth = 1.2; ctx.stroke(); ctx.restore()
    }
  }, [])

  const drawRocket = useCallback((
    ctx: CanvasRenderingContext2D,
    rx: number, ry: number,
    angle: number, t: number,
  ) => {
    ctx.save(); ctx.translate(rx, ry); ctx.rotate(angle + Math.PI / 2)
    const s    = 1.1
    const fLen = 7 + fastSin(t * 0.02) * 3
    const fl   = ctx.createLinearGradient(0, 6*s, 0, (6+fLen)*s)
    fl.addColorStop(0, 'rgba(255,160,30,0.9)')
    fl.addColorStop(0.5, 'rgba(255,80,20,0.5)')
    fl.addColorStop(1, 'transparent')
    ctx.beginPath(); ctx.moveTo(-4*s,6*s); ctx.lineTo(0,(6+fLen)*s); ctx.lineTo(4*s,6*s)
    ctx.fillStyle = fl; ctx.fill()
    ctx.beginPath()
    ctx.moveTo(0,-12*s); ctx.bezierCurveTo(5*s,-6*s,6*s,0,5*s,8*s)
    ctx.lineTo(-5*s,8*s); ctx.bezierCurveTo(-6*s,0,-5*s,-6*s,0,-12*s)
    ctx.fillStyle = '#c8d8f0'; ctx.fill()
    ctx.strokeStyle = 'rgba(150,180,220,0.5)'; ctx.lineWidth = 0.8; ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(0,-12*s); ctx.bezierCurveTo(3*s,-10*s,4*s,-5*s,5*s,0)
    ctx.lineTo(-5*s,0); ctx.bezierCurveTo(-4*s,-5*s,-3*s,-10*s,0,-12*s)
    ctx.fillStyle = '#e8eef8'; ctx.fill()
    ctx.beginPath(); ctx.arc(0,-2*s,3*s,0,Math.PI*2)
    ctx.fillStyle = 'rgba(100,180,255,0.8)'; ctx.fill()
    ctx.strokeStyle = 'rgba(200,220,255,0.5)'; ctx.lineWidth = 0.8; ctx.stroke()
    ctx.beginPath(); ctx.moveTo(-5*s,4*s); ctx.lineTo(-10*s,10*s); ctx.lineTo(-5*s,8*s)
    ctx.closePath(); ctx.fillStyle = '#a0b8d8'; ctx.fill()
    ctx.beginPath(); ctx.moveTo(5*s,4*s); ctx.lineTo(10*s,10*s); ctx.lineTo(5*s,8*s)
    ctx.closePath(); ctx.fillStyle = '#a0b8d8'; ctx.fill()
    ctx.restore()
  }, [])

  // ── Twinkle update — separate slow timer, not every RAF frame ──
  const twinkleAlphaRef = useRef<Float32Array>(new Float32Array(160))
  useEffect(() => {
    // Update twinkle alphas at 10fps — cheap, decoupled from 60fps render
    const interval = setInterval(() => {
      const t = timeRef.current
      const stars = starsRef.current
      const alphas = twinkleAlphaRef.current
      for (let i = 0; i < stars.length; i++) {
        alphas[i] = stars[i].baseAlpha * (0.7 + fastSin(t * stars[i].twinkleSpeed * 0.001 + stars[i].twinkleOffset) * 0.3)
      }
    }, 100) // 10fps for twinkle is plenty
    return () => clearInterval(interval)
  }, [])

  // ── Main draw loop ─────────────────────────────────────────────
  const draw = useCallback(() => {
    const canvas = canvasRef.current; if (!canvas) return
    const ctx    = canvas.getContext('2d'); if (!ctx) return
    const dpr    = window.devicePixelRatio || 1
    const W      = canvas.width  / dpr
    const H      = canvas.height / dpr
    if (W === 0 || H === 0) { animRef.current = requestAnimationFrame(draw); return }

    const cx = W/2, cy = H/2
    const minDim = Math.min(W, H)
    const t  = timeRef.current

    // ── 1. Static background — rebuilt on resize OR theme change ──
    const cssVarsNow  = getComputedStyle(document.documentElement)
    const skyInner    = cssVarsNow.getPropertyValue('--bg-sky-inner').trim() || '#0d1428'
    const skyMid      = cssVarsNow.getPropertyValue('--bg-sky-mid').trim()   || '#080d1e'
    const skyOuter    = cssVarsNow.getPropertyValue('--bg-sky-outer').trim() || '#040810'
    const skyKey      = `${skyInner}|${skyMid}|${skyOuter}`
    if (bgDirtyRef.current || W !== lastWRef.current || H !== lastHRef.current || skyKey !== lastSkyKeyRef.current) {
      lastSkyKeyRef.current = skyKey
      rebuildStaticCanvas(W, H, skyInner, skyMid, skyOuter)
    }

    // drawImage the offscreen bg in one call
    ctx.drawImage(bgCanvasRef.current!, 0, 0, W, H)

    // ── 2. Edge ripples for incoming messages ───────────────────
    const now = t
    ripplesRef.current = ripplesRef.current.filter(r => (now - r.startT) < 3000)
    for (const ripple of ripplesRef.current) {
      const age      = (now - ripple.startT) / 3000  // 0..1
      const progress = age                            // 0..1 linear
      const alpha    = (1 - progress) * 0.5

      // Parse accent color
      const hexColor = ripple.color
      const r2 = parseInt(hexColor.slice(1,3),16)
      const g2 = parseInt(hexColor.slice(3,5),16)
      const b2 = parseInt(hexColor.slice(5,7),16)
      const rgba = `rgba(${r2},${g2},${b2},${alpha})`

      // Left edge gradient
      const lgL = ctx.createLinearGradient(0, 0, W * 0.25, 0)
      lgL.addColorStop(0, rgba)
      lgL.addColorStop(1, 'transparent')
      ctx.fillStyle = lgL
      ctx.fillRect(0, 0, W * 0.25, H)

      // Right edge gradient
      const lgR = ctx.createLinearGradient(W, 0, W * 0.75, 0)
      lgR.addColorStop(0, rgba)
      lgR.addColorStop(1, 'transparent')
      ctx.fillStyle = lgR
      ctx.fillRect(W * 0.75, 0, W * 0.25, H)
    }

    // ── 2b. Twinkle — redraw only changed stars ───────────────────
    const stars   = starsRef.current
    const alphas  = twinkleAlphaRef.current
    for (let i = 0; i < stars.length; i++) {
      const s = stars[i]
      ctx.globalAlpha = alphas[i]
      ctx.beginPath(); ctx.arc(s.x * W, s.y * H, s.r, 0, Math.PI * 2)
      ctx.fillStyle = '#ffffff'; ctx.fill()
    }
    ctx.globalAlpha = 1

    // ── 4. Update planet positions ──────────────────────────────
    const peers  = Array.from(store.peers.values()) as import('../../../shared/types').Peer[]
    const rendered: RenderedPlanet[] = []
    peers.forEach((peer, idx) => {
      const orbit = ORBITS[idx % ORBITS.length]
      const r     = minDim * orbit.radius
      const speed = orbit.speed
      const stored = store.peers.get(peer.id)
      const angle  = (stored?.orbitAngle ?? 0) + t * speed
      rendered.push({
        peerId:      peer.id,
        x:           cx + Math.cos(angle) * r,
        y:           cy + Math.sin(angle) * r,
        radius:      orbit.planetR,
        color:       peer.color,
        name:        localNicknames.get(peer.id) ?? peer.name,
        angle,
        orbitRadius: r,
        speaking:    store.callParticipants.get(peer.id)?.speaking ?? false,
      })
    })
    planetsRef.current = rendered

    // ── 3. Rocket position — original logic ─────────────────────
    const rocket = rocketRef.current
    if (!rocketInitRef.current) {
      rocket.x = cx + minDim * 0.12; rocket.y = cy - minDim * 0.38; rocket.angle = 0.4
      rocketInitRef.current = true
    }
    if (rocket.flying && store.selectedPeerIds.size > 0) {
      const lastId = Array.from(store.selectedPeerIds).at(-1)!
      const planet = rendered.find(p => p.peerId === lastId)
      if (planet) {
        const ang = Math.atan2(planet.y - rocket.y, planet.x - rocket.x)
        rocket.targetX = planet.x - Math.cos(ang) * (planet.radius + 32)
        rocket.targetY = planet.y - Math.sin(ang) * (planet.radius + 32)
      }
      const dx = rocket.targetX - rocket.x
      const dy = rocket.targetY - rocket.y
      const dist = Math.hypot(dx, dy)
      if (dist > 2) {
        const spd = Math.min(dist * 0.06, 8)
        rocket.x += (dx / dist) * spd
        rocket.y += (dy / dist) * spd
        rocket.angle = Math.atan2(dy, dx)
      }
    } else if (!rocket.flying) {
      rocket.x += Math.cos(t * 0.0002) * 0.3
      rocket.y += Math.sin(t * 0.00015) * 0.2
      rocket.angle = Math.atan2(Math.sin(t * 0.00015) * 0.2, Math.cos(t * 0.0002) * 0.3)
    }

    const rx = rocket.x, ry = rocket.y

    // ── 5. Read theme accent from CSS vars ──────────────────────
    const accentRgb  = cssVarsNow.getPropertyValue('--accent-rgb').trim() || '68,136,255'
    const sunColor   = cssVarsNow.getPropertyValue('--orbit-sun').trim()  || '#ffd700'

    // ── 6. Orbits ───────────────────────────────────────────────
    ORBITS.forEach((orbit, i) => {
      const hasPlanet = i < peers.length
      drawOrbit(ctx, cx, cy, minDim * orbit.radius, t, i, hasPlanet, accentRgb)
    })

    // ── 7. Connection lines (only when in call) ─────────────────
    if (store.status === 'in-call') {
      drawConnectionLines(ctx, rendered, store.callParticipants, rx, ry, t)
    }

    // ── 8. Sun ──────────────────────────────────────────────────
    drawSun(ctx, cx, cy, t, sunColor)

    // ── 9. Planets (sorted: selected last = on top) ─────────────
    const sorted = [...rendered].sort((a, b) =>
      store.selectedPeerIds.has(a.peerId) ? 1 : store.selectedPeerIds.has(b.peerId) ? -1 : 0
    )
    for (const p of sorted) {
      const img = getPlanetImage(p)
      drawPlanet(ctx, p, store.selectedPeerIds.has(p.peerId), t, img)
      const unread = unreadCounts.get(`dm:${p.peerId}`) ?? 0
      if (unread > 0) drawBadge(ctx, p.x, p.y, p.radius, unread)
    }

    // ── 10. Rocket ──────────────────────────────────────────────
    drawRocket(ctx, rx, ry, rocket.angle, t)

    // ── 11. Incoming call effect ─────────────────────────────────
    if (store.incomingCallFrom) {
      const caller = rendered.find(p => p.peerId === store.incomingCallFrom)
      drawIncomingEffect(ctx, rx, ry, caller, t)
    }

    timeRef.current += 16   // ~60fps increment
    animRef.current = requestAnimationFrame(draw)
  }, [
    store.peers, store.status, store.selectedPeerIds, lastIncomingMsgTs,
    store.callParticipants, store.incomingCallFrom,
    localNicknames, unreadCounts,
    rebuildStaticCanvas, getPlanetImage,
    drawOrbit, drawPlanet, drawConnectionLines,
    drawSun, drawRocket, drawIncomingEffect,
  ])

  // Start/stop loop
  useEffect(() => {
    animRef.current = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(animRef.current)
  }, [draw])

  // ResizeObserver — marks bg dirty on resize
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return
    const observer = new ResizeObserver(entries => {
      for (const e of entries) {
        const dpr = window.devicePixelRatio || 1
        const { width, height } = e.contentRect
        canvas.width  = Math.round(width  * dpr)
        canvas.height = Math.round(height * dpr)
        const ctx = canvas.getContext('2d')
        if (ctx) ctx.scale(dpr, dpr)
        bgDirtyRef.current = true
        planetCacheRef.current.clear()   // planet sizes may change
      }
    })
    observer.observe(canvas)
    return () => observer.disconnect()
  }, [])

  // Click handling
  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect()
    // getBoundingClientRect returns zoomed coords, but canvas draws at natural size.
    // Divide by the ratio of rendered size vs natural size to get canvas-space coords.
    const scaleX = (canvasRef.current!.width  / window.devicePixelRatio) / rect.width
    const scaleY = (canvasRef.current!.height / window.devicePixelRatio) / rect.height
    const mx = (e.clientX - rect.left) * scaleX
    const my = (e.clientY - rect.top)  * scaleY
    for (const p of planetsRef.current) {
      const dx = mx - p.x, dy = my - p.y
      if (dx*dx + dy*dy <= (p.radius + 8) ** 2) {
        onPlanetClick(p.peerId); return
      }
    }
    onPlanetClick('')
  }, [onPlanetClick])

  return (
    <canvas
      ref={canvasRef}
      className={styles.canvas}
      onClick={handleClick}
    />
  )
}

// ── Helpers ──────────────────────────────────────────────────────
function drawBadge(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, count: number) {
  const bx    = x + r * 0.72
  const by    = y - r * 0.72
  const label = count > 99 ? '99+' : String(count)
  const br    = label.length > 2 ? 9 : 8
  ctx.beginPath(); ctx.arc(bx, by, br, 0, Math.PI * 2)
  ctx.fillStyle = '#ff3b3b'; ctx.fill()
  ctx.beginPath(); ctx.arc(bx, by, br, 0, Math.PI * 2)
  ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 1.5; ctx.stroke()
  ctx.font = `bold ${label.length > 2 ? 7 : 9}px "Exo 2", sans-serif`
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  ctx.fillStyle = 'white'; ctx.fillText(label, bx, by)
  ctx.textBaseline = 'alphabetic'
}

function lighten(hex: string, n: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgb(${Math.min(255,r+n)},${Math.min(255,g+n)},${Math.min(255,b+n)})`
}

function darken(hex: string, n: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgb(${Math.max(0,r-n)},${Math.max(0,g-n)},${Math.max(0,b-n)})`
}
