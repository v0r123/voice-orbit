import { exec as execCb, spawn } from 'child_process'
import { promisify } from 'util'
import path from 'path'
import fs from 'fs'
import os from 'os'

const exec = promisify(execCb)

const RULE_TCP = 'VoiceOrbit-Signaling'
const RULE_UDP = 'VoiceOrbit-Discovery'
// Wide range — covers fixed ports + any fallback random ports in high range
const TCP_PORTS = '45700-45750'
const UDP_PORTS = '45678-45685'

async function ruleExists(name: string): Promise<boolean> {
  try {
    const { stdout } = await exec(
      `netsh advfirewall firewall show rule name="${name}"`
    )
    return stdout.includes(name)
  } catch { return false }
}

// Write a .ps1 script to temp dir and run it elevated via Start-Process RunAs
async function addRulesElevated(): Promise<void> {
  const script = `
netsh advfirewall firewall delete rule name="${RULE_TCP}" 2>$null
netsh advfirewall firewall delete rule name="${RULE_UDP}" 2>$null
netsh advfirewall firewall add rule name="${RULE_TCP}" dir=in action=allow protocol=TCP localport=${TCP_PORTS} profile=private,domain description="VoiceOrbit LAN signaling"
netsh advfirewall firewall add rule name="${RULE_UDP}" dir=in action=allow protocol=UDP localport=${UDP_PORTS} profile=private,domain description="VoiceOrbit LAN discovery"
`.trim()

  const scriptPath = path.join(os.tmpdir(), 'voiceorbit-fw.ps1')
  fs.writeFileSync(scriptPath, script, 'utf8')

  return new Promise((resolve) => {
    // -ExecutionPolicy Bypass needed for unsigned scripts
    // -Wait ensures we know when it's done
    // -WindowStyle Hidden avoids flashing console
    const ps = spawn('powershell', [
      '-ExecutionPolicy', 'Bypass',
      '-Command',
      `Start-Process powershell -ArgumentList '-ExecutionPolicy Bypass -File \\"${scriptPath}\\"' -Verb RunAs -Wait -WindowStyle Hidden`,
    ], { windowsHide: true })

    ps.on('close', () => {
      try { fs.unlinkSync(scriptPath) } catch { /* ok */ }
      resolve()
    })
    ps.on('error', () => {
      try { fs.unlinkSync(scriptPath) } catch { /* ok */ }
      resolve()
    })
  })
}

export async function ensureFirewallRules(): Promise<void> {
  if (process.platform !== 'win32') return

  const tcpOk = await ruleExists(RULE_TCP)
  const udpOk = await ruleExists(RULE_UDP)

  if (tcpOk && udpOk) {
    console.log('[Firewall] Rules already exist — OK')
    return
  }

  console.log('[Firewall] Rules missing — requesting UAC elevation...')
  await addRulesElevated()

  // Verify
  const tcpNow = await ruleExists(RULE_TCP)
  const udpNow = await ruleExists(RULE_UDP)

  if (tcpNow && udpNow) {
    console.log(`[Firewall] Rules added successfully (TCP ${TCP_PORTS}, UDP ${UDP_PORTS})`)
  } else {
    console.warn('[Firewall] Still missing after elevation. Run manually in PowerShell as Admin:')
    console.warn(`  netsh advfirewall firewall add rule name="${RULE_TCP}" dir=in action=allow protocol=TCP localport=${TCP_PORTS} profile=private`)
    console.warn(`  netsh advfirewall firewall add rule name="${RULE_UDP}" dir=in action=allow protocol=UDP localport=${UDP_PORTS} profile=private`)
  }
}

export async function removeFirewallRules(): Promise<void> {
  if (process.platform !== 'win32') return
  try {
    await exec(`netsh advfirewall firewall delete rule name="${RULE_TCP}"`)
    await exec(`netsh advfirewall firewall delete rule name="${RULE_UDP}"`)
    console.log('[Firewall] Removed VoiceOrbit rules')
  } catch { /* ok — rules may not exist */ }
}
