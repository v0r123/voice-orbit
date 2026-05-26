const { contextBridge, ipcRenderer } = require('electron')

function makeChannel(channel) {
  let callback = null
  ipcRenderer.on(channel, (_e, ...args) => { if (callback) callback(...args) })
  return (cb) => { callback = cb }
}

const onPeerFound        = makeChannel('peer-found')
const onPeerLost         = makeChannel('peer-lost')
const onPeerUpdated      = makeChannel('peer-updated')
const onSignalingMessage = makeChannel('signaling-message')
const onFileProgress     = makeChannel('file-progress')
const onFileSent         = makeChannel('file-sent')
const onFileDownloadProgress  = makeChannel('file-download-progress')
const onUpdateDownloadProgress = makeChannel('update-download-progress')
const onUpdateDiagnostic       = makeChannel('update-diagnostic')

contextBridge.exposeInMainWorld('electronAPI', {
  getSelfInfo:  () => ipcRenderer.invoke('get-self-info'),
  getPeers:     () => ipcRenderer.invoke('get-peers'),

  sendSignaling: (peerIp, peerPort, message) =>
    ipcRenderer.send('send-signaling', peerIp, peerPort, message),

  updateSettings: (settings) => ipcRenderer.send('update-settings', settings),

  // File transfer
  filePick:       ()                                          => ipcRenderer.invoke('file-pick'),
  fileRegister:   (fileId, filePath, fileName, fileSize)     => ipcRenderer.send('file-register', fileId, filePath, fileName, fileSize),
  fileDownload:   (peerIp, transferPort, fileId, fileName, fileSize) =>
    ipcRenderer.invoke('file-download', peerIp, transferPort, fileId, fileName, fileSize),
  fileShowInFolder: (filePath) => ipcRenderer.send('file-show-in-folder', filePath),
  fileAbort: (fileId) => ipcRenderer.send('file-abort', fileId),
  fileUnregister: (fileId) => ipcRenderer.send('file-unregister', fileId),
  fileSendImage: (peerId, dataUrl, fileName) => ipcRenderer.invoke('file-send-image', peerId, dataUrl, fileName),
  fileReadAsDataUrl: (filePath) => ipcRenderer.invoke('file-read-as-data-url', filePath),

  onPeerFound,
  onPeerLost,
  onPeerUpdated,
  onSignalingMessage,
  onFileProgress,
  onFileSent,
  onFileDownloadProgress,
  onUpdateDownloadProgress,
  onUpdateDiagnostic,

  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  getSelfExecutable: () => ipcRenderer.invoke('get-self-executable'),
  applyUpdate: (zipPath) => ipcRenderer.invoke('apply-update', zipPath),
  downloadUpdate: (peerIp, peerFilePort, fileId, fileName, fileSize) =>
    ipcRenderer.invoke('download-update', peerIp, peerFilePort, fileId, fileName, fileSize),
  updatePickFile: () => ipcRenderer.invoke('update-pick-file'),
  buildAndRegisterUpdate: (version) => ipcRenderer.invoke('build-and-register-update', version),
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close:    () => ipcRenderer.send('window-close'),
})
