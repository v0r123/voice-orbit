/**
 * Creates a minimal update package containing only the changed resources.
 * 
 * Electron app structure after build:
 *   release/win-unpacked/
 *     VoiceOrbit.exe         <- Electron runtime, ~120MB, rarely changes
 *     resources/
 *       app.asar             <- Our code, ~3-5MB, changes every update
 *       app.asar.unpacked/   <- Native modules if any
 *     locales/...
 * 
 * Update package contains:
 *   app.asar                 <- New app code
 *   update-meta.json         <- Version, instructions
 *   updater.bat              <- Windows batch updater script
 */

const fs   = require('fs')
const path = require('path')
const archiver = require('archiver')

const pkg        = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8'))
const version    = pkg.version
const appName    = pkg.build.productName ?? 'VoiceOrbit'
const releaseDir = path.join(__dirname, '../release')
const unpackDir  = path.join(releaseDir, 'win-unpacked')
const asarPath   = path.join(unpackDir, 'resources', 'app.asar')
const outputZip  = path.join(releaseDir, `${appName}-update-${version}.zip`)

if (!fs.existsSync(asarPath)) {
  console.error(`❌ app.asar not found at: ${asarPath}`)
  console.error('   Run: npm run build && electron-builder --dir first')
  process.exit(1)
}

const asarSize = fs.statSync(asarPath).size
console.log(`📦 Creating update package for v${version}`)
console.log(`   app.asar: ${(asarSize / 1024 / 1024).toFixed(1)} MB`)

// The updater.bat script — runs on target machine to apply the update
// It waits for the main app to close, replaces app.asar, then restarts
const updaterBat = `@echo off
echo VoiceOrbit Updater v${version}
echo.

set APPDIR=%~dp0..
set ASAR_TARGET=%APPDIR%\\resources\\app.asar
set ASAR_SOURCE=%~dp0app.asar
set APPEXE=%APPDIR%\\${appName}.exe

echo Waiting for VoiceOrbit to close...
timeout /t 2 /nobreak >nul

:: Kill if still running
taskkill /f /im "${appName}.exe" >nul 2>&1
timeout /t 1 /nobreak >nul

echo Applying update...
copy /y "%ASAR_SOURCE%" "%ASAR_TARGET%"
if errorlevel 1 (
  echo ERROR: Failed to copy update file!
  pause
  exit /b 1
)

echo Update applied successfully!
echo Starting VoiceOrbit...
start "" "%APPEXE%"

:: Cleanup
del "%~f0"
exit /b 0
`

const updateMeta = JSON.stringify({
  version,
  appName,
  asarOnly: true,
  createdAt: new Date().toISOString(),
}, null, 2)

// Create ZIP
if (fs.existsSync(outputZip)) fs.unlinkSync(outputZip)

const output  = fs.createWriteStream(outputZip)
const archive = archiver('zip', { zlib: { level: 9 } })

output.on('close', () => {
  const zipSize = archive.pointer()
  console.log(`✅ Update package created: ${path.basename(outputZip)}`)
  console.log(`   Size: ${(zipSize / 1024 / 1024).toFixed(1)} MB (vs full installer)`)
  console.log(`   Path: ${outputZip}`)
})

archive.on('error', err => { throw err })
archive.pipe(output)

archive.file(asarPath,                     { name: 'app.asar' })
archive.append(updaterBat,                 { name: 'updater.bat' })
archive.append(updateMeta,                 { name: 'update-meta.json' })

// Include app.asar.unpacked if it exists (native modules)
const unpackedDir = path.join(unpackDir, 'resources', 'app.asar.unpacked')
if (fs.existsSync(unpackedDir)) {
  archive.directory(unpackedDir, 'app.asar.unpacked')
  console.log('   Including app.asar.unpacked (native modules)')
}

archive.finalize()
