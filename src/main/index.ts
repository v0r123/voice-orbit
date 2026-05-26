import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron'
import path from 'path'
import { DiscoveryService } from './discovery'
import { SignalingServer } from './signaling'
import { FileServer } from './fileServer'
import { setupIpcHandlers } from './ipc'
import { ensureFirewallRules } from './firewall'

let mainWindow: BrowserWindow | null = null
let discoveryService: DiscoveryService | null = null
let signalingServer:  SignalingServer  | null = null
let fileServer:       FileServer       | null = null

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900, height: 700,
    minWidth: 700, minHeight: 600,
    frame: false,
    backgroundColor: '#080818',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      webSecurity: false,
    },
  })

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
  } else {
    mainWindow.loadFile(path.join(__dirname, '../../renderer/index.html'))
  }

  mainWindow.webContents.openDevTools({ mode: 'detach' })
  mainWindow.on('closed', () => { mainWindow = null })
  return mainWindow
}

app.commandLine.appendSwitch('force-webrtc-ip-handling-policy', 'default_public_and_private_interfaces')
app.commandLine.appendSwitch('disable-features', 'WebRtcHideLocalIpsWithMdns')
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')

app.whenReady().then(async () => {
  const win = createWindow()

  discoveryService = new DiscoveryService()
  signalingServer  = new SignalingServer()
  fileServer       = new FileServer()

  await signalingServer.start()
  discoveryService.signalingPort = signalingServer.getPort()

  ensureFirewallRules()

  await discoveryService.start()
  await fileServer.start()
  discoveryService.filePort = fileServer.getPort()

  setupIpcHandlers(ipcMain, win, discoveryService, signalingServer, fileServer)

  discoveryService.on('peer-found',   (peer)   => win.webContents.send('peer-found',   peer))
  discoveryService.on('peer-lost',    (peerId) => win.webContents.send('peer-lost',    peerId))
  discoveryService.on('peer-updated', (peer)   => win.webContents.send('peer-updated', peer))

  // File transfer progress events → renderer
  fileServer.on('progress', (data) => win.webContents.send('file-progress', data))
  fileServer.on('sent',     (data) => win.webContents.send('file-sent',     data))
})

app.on('before-quit', () => {
  discoveryService?.stopWithBye()
  signalingServer?.stop()
  fileServer?.stop()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
