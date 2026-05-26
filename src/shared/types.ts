export interface Peer {
  id: string
  name: string
  color: string
  ip: string
  signalingPort: number
  filePort: number
  lastSeen: number
  orbitIndex: number
  orbitAngle: number
  orbitSpeed: number
}

export interface DiscoveryPacket {
  type: 'HELLO' | 'BYE'
  id: string
  name: string
  color: string
  signalingPort: number
  filePort: number
  localIps?: string[]   // sender's own IPv4 addresses, used to detect same-machine peers
}

export type SignalingMessage =
  | { type: 'OFFER';  from: string; to: string; payload: RTCSessionDescriptionInit }
  | { type: 'ANSWER'; from: string; to: string; payload: RTCSessionDescriptionInit }
  | { type: 'ICE';    from: string; to: string; payload: RTCIceCandidateInit }
  | { type: 'HANGUP'; from: string; to: string }
  | { type: 'CALL_REQUEST'; from: string; to: string }
  | { type: 'CALL_ACCEPT';  from: string; to: string }
  | { type: 'CALL_REJECT';  from: string; to: string }
  | { type: 'CALL_PARTICIPANT_LIST'; from: string; to: string; participantIds: string[] }
  | { type: 'AUDIO_TEST_REQUEST'; from: string; to: string }
  | { type: 'AUDIO_TEST_ACCEPT';  from: string; to: string }
  | { type: 'AUDIO_TEST_OFFER';   from: string; to: string; payload: RTCSessionDescriptionInit }
  | { type: 'AUDIO_TEST_ANSWER';  from: string; to: string; payload: RTCSessionDescriptionInit }
  | { type: 'AUDIO_TEST_ICE';     from: string; to: string; payload: RTCIceCandidateInit }
  | { type: 'AUDIO_TEST_END';     from: string; to: string }
  | { type: 'VERSION_QUERY';    from: string; to: string }
  | { type: 'VERSION_RESPONSE'; from: string; to: string; version: string }
  | { type: 'UPDATE_REQUEST';   from: string; to: string }
  | { type: 'UPDATE_READY';     from: string; to: string; fileId: string; fileName: string; fileSize: number; version: string }
  | { type: 'UPDATE_UNAVAILABLE'; from: string; to: string }
  | { type: 'TEXT_MESSAGE';  from: string; to: string; text: string; msgId: string; ts: number; chatId: string }
  | { type: 'FILE_OFFER';    from: string; to: string; fileId: string; fileName: string; fileSize: number; mimeType: string; previewData?: string; chatId: string }
  | { type: 'FILE_ACCEPT';   from: string; to: string; fileId: string; transferPort: number }
  | { type: 'FILE_REJECT';   from: string; to: string; fileId: string }
  | { type: 'FILE_DONE';     from: string; to: string; fileId: string }

export interface ChatSession {
  id: string             // 'dm:peerId' or 'group:id1+id2+...'
  peerIds: string[]      // participants (excluding self)
  name: string           // display name
  isGroup: boolean
  createdAt: number
}

export interface ChatMessage {
  id: string
  fromId: string
  fromName: string
  fromColor: string
  chatId: string      // session id this message belongs to
  text: string
  ts: number
  self: boolean
}

export interface FileTransfer {
  fileId: string
  fileName: string
  fileSize: number
  mimeType: string
  fromId: string
  fromName: string
  fromColor: string
  chatId: string              // session id this transfer belongs to
  direction: 'incoming' | 'outgoing'
  status: 'pending' | 'accepted' | 'transferring' | 'done' | 'rejected' | 'error'
  progress: number   // 0-100
  createdAt: number
  savePath?: string
  previewData?: string   // base64 data URL for image preview
}

export const FILE_SERVER_PORT_BASE = 45800

export interface AppSettings {
  theme: string
  uiScale: number   // 0.8 - 1.4, default 1.0
  userName: string
  userColor: string
  micDeviceId: string
  outputDeviceId: string
  inputVolume: number
  outputVolume: number
}

export const DISCOVERY_PORT = 45678
export const SIGNALING_PORT_BASE = 45680
export const SIGNALING_PORT_FIXED = 45700  // fixed port per instance for firewall rules

export const PLANET_COLORS = [
  '#4fc3f7', // ice blue
  '#81c784', // sage green
  '#ffb74d', // amber
  '#f48fb1', // rose
  '#ce93d8', // lavender
  '#80cbc4', // teal
  '#ffcc02', // gold
  '#ff8a65', // coral
]
