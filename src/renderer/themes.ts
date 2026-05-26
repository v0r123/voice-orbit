export interface Theme {
  id:    string
  name:  string
  emoji: string
  vars:  Record<string, string>
}

export const THEMES: Theme[] = [
  {
    id: 'deep-space', name: 'Deep Space', emoji: '🌌',
    vars: {
      '--bg': '#080818', '--bg-sky-inner': '#0d1428', '--bg-sky-mid': '#080d1e', '--bg-sky-outer': '#040810',
      '--bg-title': 'rgba(6,10,22,0.97)', '--bg-panel': 'rgba(8,14,30,0.92)',
      '--bg-card': 'rgba(255,255,255,0.05)', '--bg-input': 'rgba(255,255,255,0.05)',
      '--accent': '#4488ff', '--accent-rgb': '68,136,255', '--accent2': '#44ffaa',
      '--text': 'rgba(255,255,255,0.85)', '--text-sub': 'rgba(255,255,255,0.38)',
      '--text-muted': 'rgba(255,255,255,0.18)', '--border': 'rgba(80,140,255,0.15)',
      '--border-soft': 'rgba(255,255,255,0.08)', '--glow': 'rgba(68,136,255,0.25)',
      '--call-accept': '#1e7e44', '--call-reject': '#7e1e1e', '--orbit-sun': '#ffd700',
    },
  },
  {
    id: 'nebula', name: 'Nebula', emoji: '🔮',
    vars: {
      '--bg': '#0d0818', '--bg-sky-inner': '#160828', '--bg-sky-mid': '#0d0520', '--bg-sky-outer': '#060210',
      '--bg-title': 'rgba(13,8,24,0.97)', '--bg-panel': 'rgba(20,10,35,0.92)',
      '--bg-card': 'rgba(180,100,255,0.06)', '--bg-input': 'rgba(180,100,255,0.05)',
      '--accent': '#cc44ff', '--accent-rgb': '204,68,255', '--accent2': '#ff44cc',
      '--text': 'rgba(255,240,255,0.88)', '--text-sub': 'rgba(220,180,255,0.45)',
      '--text-muted': 'rgba(200,150,255,0.22)', '--border': 'rgba(180,100,255,0.2)',
      '--border-soft': 'rgba(180,100,255,0.1)', '--glow': 'rgba(180,80,255,0.3)',
      '--call-accept': '#2d6e3a', '--call-reject': '#7e1e4a', '--orbit-sun': '#cc88ff',
    },
  },
  {
    id: 'solar', name: 'Solar Flare', emoji: '☀️',
    vars: {
      '--bg': '#0f0800', '--bg-sky-inner': '#1a0e00', '--bg-sky-mid': '#100800', '--bg-sky-outer': '#080400',
      '--bg-title': 'rgba(15,8,0,0.97)', '--bg-panel': 'rgba(25,12,0,0.92)',
      '--bg-card': 'rgba(255,140,0,0.06)', '--bg-input': 'rgba(255,140,0,0.04)',
      '--accent': '#ff8800', '--accent-rgb': '255,136,0', '--accent2': '#ffdd00',
      '--text': 'rgba(255,240,200,0.88)', '--text-sub': 'rgba(255,200,100,0.45)',
      '--text-muted': 'rgba(255,180,80,0.22)', '--border': 'rgba(255,140,0,0.2)',
      '--border-soft': 'rgba(255,140,0,0.1)', '--glow': 'rgba(255,120,0,0.3)',
      '--call-accept': '#3a6e20', '--call-reject': '#7e2e1e', '--orbit-sun': '#ffaa00',
    },
  },
  {
    id: 'arctic', name: 'Arctic', emoji: '🧊',
    vars: {
      '--bg': '#000d14', '--bg-sky-inner': '#001a24', '--bg-sky-mid': '#000f1a', '--bg-sky-outer': '#00060e',
      '--bg-title': 'rgba(0,13,20,0.97)', '--bg-panel': 'rgba(0,20,32,0.92)',
      '--bg-card': 'rgba(0,200,255,0.05)', '--bg-input': 'rgba(0,200,255,0.04)',
      '--accent': '#00ccff', '--accent-rgb': '0,204,255', '--accent2': '#00ffee',
      '--text': 'rgba(200,245,255,0.88)', '--text-sub': 'rgba(120,210,240,0.5)',
      '--text-muted': 'rgba(80,180,220,0.25)', '--border': 'rgba(0,180,255,0.2)',
      '--border-soft': 'rgba(0,180,255,0.1)', '--glow': 'rgba(0,180,255,0.28)',
      '--call-accept': '#1a6e50', '--call-reject': '#1e4a7e', '--orbit-sun': '#00eeff',
    },
  },
  {
    id: 'forest', name: 'Forest', emoji: '🌿',
    vars: {
      '--bg': '#020d04', '--bg-sky-inner': '#041408', '--bg-sky-mid': '#020d04', '--bg-sky-outer': '#010602',
      '--bg-title': 'rgba(2,13,4,0.97)', '--bg-panel': 'rgba(4,20,8,0.92)',
      '--bg-card': 'rgba(50,200,80,0.05)', '--bg-input': 'rgba(50,200,80,0.04)',
      '--accent': '#44cc66', '--accent-rgb': '68,204,102', '--accent2': '#aaff44',
      '--text': 'rgba(210,255,220,0.88)', '--text-sub': 'rgba(130,220,150,0.5)',
      '--text-muted': 'rgba(80,180,100,0.25)', '--border': 'rgba(50,180,80,0.2)',
      '--border-soft': 'rgba(50,180,80,0.1)', '--glow': 'rgba(50,180,80,0.28)',
      '--call-accept': '#1e6e2a', '--call-reject': '#6e3a1e', '--orbit-sun': '#88ff44',
    },
  },
  {
    id: 'crimson', name: 'Crimson', emoji: '🔴',
    vars: {
      '--bg': '#120005', '--bg-sky-inner': '#1e0008', '--bg-sky-mid': '#140005', '--bg-sky-outer': '#0a0003',
      '--bg-title': 'rgba(18,0,5,0.97)', '--bg-panel': 'rgba(28,0,8,0.92)',
      '--bg-card': 'rgba(255,30,60,0.06)', '--bg-input': 'rgba(255,30,60,0.04)',
      '--accent': '#ff2244', '--accent-rgb': '255,34,68', '--accent2': '#ff8844',
      '--text': 'rgba(255,220,225,0.88)', '--text-sub': 'rgba(255,160,170,0.5)',
      '--text-muted': 'rgba(255,120,130,0.25)', '--border': 'rgba(255,34,68,0.2)',
      '--border-soft': 'rgba(255,34,68,0.1)', '--glow': 'rgba(255,34,68,0.3)',
      '--call-accept': '#1e6e2a', '--call-reject': '#7e0010', '--orbit-sun': '#ff4422',
    },
  },
  {
    id: 'midnight', name: 'Midnight', emoji: '🌙',
    vars: {
      '--bg': '#05050f', '--bg-sky-inner': '#0a0a1e', '--bg-sky-mid': '#060614', '--bg-sky-outer': '#02020a',
      '--bg-title': 'rgba(5,5,15,0.97)', '--bg-panel': 'rgba(8,8,22,0.92)',
      '--bg-card': 'rgba(140,140,255,0.06)', '--bg-input': 'rgba(140,140,255,0.04)',
      '--accent': '#9988ff', '--accent-rgb': '153,136,255', '--accent2': '#cc88ff',
      '--text': 'rgba(230,225,255,0.88)', '--text-sub': 'rgba(180,170,255,0.5)',
      '--text-muted': 'rgba(140,130,220,0.28)', '--border': 'rgba(140,130,255,0.2)',
      '--border-soft': 'rgba(140,130,255,0.1)', '--glow': 'rgba(140,130,255,0.28)',
      '--call-accept': '#2a4e6e', '--call-reject': '#6e1e4a', '--orbit-sun': '#ccbbff',
    },
  },
  {
    id: 'toxic', name: 'Toxic', emoji: '☢️',
    vars: {
      '--bg': '#010c03', '--bg-sky-inner': '#021405', '--bg-sky-mid': '#010c03', '--bg-sky-outer': '#000801',
      '--bg-title': 'rgba(1,12,3,0.97)', '--bg-panel': 'rgba(2,18,5,0.92)',
      '--bg-card': 'rgba(100,255,50,0.06)', '--bg-input': 'rgba(100,255,50,0.04)',
      '--accent': '#7fff00', '--accent-rgb': '127,255,0', '--accent2': '#00ffaa',
      '--text': 'rgba(220,255,200,0.9)', '--text-sub': 'rgba(150,255,100,0.55)',
      '--text-muted': 'rgba(100,200,60,0.3)', '--border': 'rgba(127,255,0,0.22)',
      '--border-soft': 'rgba(127,255,0,0.1)', '--glow': 'rgba(127,255,0,0.32)',
      '--call-accept': '#2e7e10', '--call-reject': '#7e3a10', '--orbit-sun': '#aaff00',
    },
  },
]


export const DEFAULT_THEME_ID = 'deep-space'

export function applyTheme(themeId: string) {
  const theme = THEMES.find(t => t.id === themeId) ?? THEMES[0]
  const root  = document.documentElement
  for (const [key, value] of Object.entries(theme.vars)) {
    root.style.setProperty(key, value)
  }
  root.setAttribute('data-theme', theme.id)
}
