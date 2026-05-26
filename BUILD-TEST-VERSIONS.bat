@echo off
chcp 65001 >nul
echo.
echo  VoiceOrbit — Multi-Version Test Build
echo  ======================================
echo.

:: Check Node.js
where node >nul 2>&1
if errorlevel 1 (
  echo ERROR: Node.js not found. Install from https://nodejs.org
  pause & exit /b 1
)

:: Optional: pass custom versions as arguments
:: BUILD-TEST-VERSIONS.bat 1.0.0 1.0.1 2.0.0
if "%~1"=="" (
  echo Building default versions: 1.0.0, 1.0.1, 1.0.2
  node scripts\build-test-versions.js
) else (
  echo Building versions: %*
  node scripts\build-test-versions.js %*
)

if errorlevel 1 (
  echo.
  echo Build had errors. Check output above.
  pause
) else (
  echo.
  echo All versions built successfully!
  pause
)
