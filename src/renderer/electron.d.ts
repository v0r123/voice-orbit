import { Peer, SignalingMessage, AppSettings } from '../../shared/types'

declare global {
  interface Window {
    electronAPI?: {
      getSelfInfo(): Promise<{ id: string; name: string; color: string; signalingPort: number; filePort: number }>
      getPeers(): Promise<Peer[]>
      sendSignaling(peerIp: string, peerPort: number, message: SignalingMessage): void
      updateSettings(settings: Partial<AppSettings>): void

      // File transfer
      filePick(): Promise<{ filePath: string; fileName: string; fileSize: number; mimeType: string } | null>
      fileRegister(fileId: string, filePath: string, fileName: string, fileSize: number): void
      fileDownload(peerIp: string, transferPort: number, fileId: string, fileName: string, fileSize: number): Promise<{ ok: boolean; savePath?: string; aborted?: boolean }>
      fileShowInFolder(filePath: string): void
      fileAbort(fileId: string): void
      fileUnregister?(fileId: string): void
      fileSendImage(peerId: string, dataUrl: string, fileName: string): Promise<{ fileId: string; filePath: string; fileName: string; fileSize: number; mimeType: string } | null>
      fileReadAsDataUrl(filePath: string): Promise<string | null>

      onPeerFound(cb: (peer: Peer) => void): void
      onPeerLost(cb: (peerId: string) => void): void
      onPeerUpdated(cb: (peer: Peer) => void): void
      onSignalingMessage(cb: (msg: SignalingMessage) => void): void
      onFileProgress(cb: (data: { fileId: string; progress: number }) => void): void
      onFileSent(cb: (data: { fileId: string }) => void): void
      onFileDownloadProgress(cb: (data: { fileId: string; progress: number }) => void): void

      getAppVersion(): Promise<string>
      settingsLoad(): Promise<Record<string, any> | null>
      settingsSave(data: Record<string, any>): Promise<boolean>
      historyLoad(): Promise<{ messages: any[]; sessions: any[]; transfers: any[] } | null>
      historySave(data: { messages: any[]; sessions: any[]; transfers: any[] }): Promise<boolean>
      historySearch(query: string): Promise<any[]>
      messageEdit(id: string, text: string): Promise<boolean>
      messageDelete(id: string): Promise<boolean>
      reactionAdd(messageId: string, fromId: string, emoji: string): Promise<boolean>
      reactionRemove(messageId: string, fromId: string, emoji: string): Promise<boolean>
      applyUpdate(zipPath: string): Promise<{ ok: boolean; version?: string; error?: string }>
      buildAndRegisterUpdate(version: string): Promise<{ fileId: string; fileName: string; fileSize: number; version: string } | null>
      downloadUpdate(peerIp: string, peerFilePort: number, fileId: string, fileName: string, fileSize: number): Promise<{ ok: boolean; zipPath?: string; error?: string }>
      onUpdateDownloadProgress(cb: (progress: number) => void): void
      onUpdateDiagnostic(cb: (data: any) => void): void
      updatePickFile(): Promise<{ filePath: string; fileName: string; fileSize: number } | null>
      minimize(): void
      maximize(): void
      close(): void
    }
  }
}
export {}
