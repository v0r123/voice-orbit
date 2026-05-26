/**
 * build-test-versions.js
 *
 * Builds multiple versions of VoiceOrbit for update testing.
 * Each version goes into: release/test/<version>/
 *
 * Usage:
 *   node scripts/build-test-versions.js 1.0.0 1.0.1 1.0.2
 *   node scripts/build-test-versions.js          ← uses defaults: 1.0.0, 1.0.1, 1.0.2
 *
 * What it does per version:
 *   1. Sets version in package.json
 *   2. Runs npm run build  (Vite + TypeScript compile)
 *   3. Runs electron-builder --dir  (portable unpacked build, no installer)
 *   4. Copies release/win-unpacked → release/test/<version>/
 *   5. Restores original package.json
 */

const { execSync } = require('child_process')
const fs           = require('fs')
const path         = require('path')

const ROOT      = path.join(__dirname, '..')
const PKG_PATH  = path.join(ROOT, 'package.json')
const OUT_BASE  = path.join(ROOT, 'release', 'test')
const UNPACKED  = path.join(ROOT, 'release', 'win-unpacked')

// ── Versions to build ────────────────────────────────────────────
const versions = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ['1.0.0', '1.0.1', '1.0.2']

// ── Helpers ──────────────────────────────────────────────────────
function run(cmd, label) {
  console.log(`\n  ▶ ${label}`)
  execSync(cmd, { cwd: ROOT, stdio: 'inherit' })
}

function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true })
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name)
    const d = path.join(dst, entry.name)
    if (entry.isDirectory()) copyDir(s, d)
    else fs.copyFileSync(s, d)
  }
}

function rmDir(dir) {
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true })
}

// ── Main ─────────────────────────────────────────────────────────
const originalPkg = fs.readFileSync(PKG_PATH, 'utf8')
const pkg         = JSON.parse(originalPkg)

console.log(`\n╔══════════════════════════════════════════╗`)
console.log(`║  VoiceOrbit — Multi-Version Test Build   ║`)
console.log(`╚══════════════════════════════════════════╝`)
console.log(`\nVersions: ${versions.join(', ')}`)
console.log(`Output:   release/test/<version>/\n`)

fs.mkdirSync(OUT_BASE, { recursive: true })

const built = []

for (const version of versions) {
  const outDir = path.join(OUT_BASE, version)

  console.log(`\n${'─'.repeat(50)}`)
  console.log(`  Building v${version}`)
  console.log(`${'─'.repeat(50)}`)

  // Skip if already built
  if (fs.existsSync(path.join(outDir, 'VoiceOrbit.exe'))) {
    console.log(`  ✓ Already built — skipping (delete release/test/${version}/ to rebuild)`)
    built.push({ version, outDir })
    continue
  }

  // 1. Patch package.json
  const patched = { ...pkg, version }
  fs.writeFileSync(PKG_PATH, JSON.stringify(patched, null, 2))
  console.log(`  ✓ package.json → v${version}`)

  try {
    // 2. Build renderer + main
    run('npm run build', 'Compiling TypeScript + Vite')

    // 3. electron-builder --dir (fast, no installer)
    run('npx electron-builder --dir --win', 'electron-builder --dir')

    // 4. Copy win-unpacked → release/test/<version>/
    rmDir(outDir)
    console.log(`\n  ▶ Copying to release/test/${version}/`)
    copyDir(UNPACKED, outDir)
    console.log(`  ✓ Done`)

    built.push({ version, outDir })
  } catch (err) {
    console.error(`\n  ✗ Build failed for v${version}:`, err.message)
    process.exitCode = 1
  }
}

// 5. Restore original package.json
fs.writeFileSync(PKG_PATH, originalPkg)
console.log(`\n  ✓ Restored original package.json (v${pkg.version})`)

// ── Summary ──────────────────────────────────────────────────────
console.log(`\n${'═'.repeat(50)}`)
console.log(`  Build complete!`)
console.log(`${'═'.repeat(50)}\n`)

for (const { version, outDir } of built) {
  const exeSize = (() => {
    try {
      const bytes = fs.statSync(path.join(outDir, 'VoiceOrbit.exe')).size
      return `${(bytes / 1024 / 1024).toFixed(0)} MB`
    } catch { return '?' }
  })()
  console.log(`  v${version.padEnd(10)} → release\\test\\${version}\\   (${exeSize})`)
}

console.log(`\nTo test updates, run each version in a separate window:`)
for (const { version, outDir } of built) {
  const rel = path.relative(ROOT, outDir).replace(/\//g, '\\')
  console.log(`  ${rel}\\VoiceOrbit.exe`)
}
console.log()
