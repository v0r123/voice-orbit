const fs = require('fs')
const path = require('path')

// Copy preload.js
const preloadSrc  = path.join(__dirname, '../src/main/preload.js')
const preloadDest = path.join(__dirname, '../dist/main/main/preload.js')
fs.mkdirSync(path.dirname(preloadDest), { recursive: true })
fs.copyFileSync(preloadSrc, preloadDest)
console.log('Copied preload.js -> dist/main/main/preload.js')

// Copy fileWorker.js (compiled by tsc, just needs to be in right place)
// tsc puts it at dist/main/main/fileWorker.js — already correct
console.log('Build complete.')
