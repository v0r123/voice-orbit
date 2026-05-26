import { useEffect } from 'react'
import { useStore } from '../store'
import { Peer } from '../../shared/types'

export function useDiscovery() {
  const { addPeer, updatePeer, removePeer, setSelf } = useStore()

  useEffect(() => {
    window.electronAPI?.getSelfInfo().then((info: any) => {
      if (info) setSelf(info.id, info.name, info.color, info.signalingPort, info.filePort)
    })

    window.electronAPI?.getPeers().then((peers: Peer[]) => {
      peers.forEach(addPeer)
    })

    window.electronAPI?.onPeerFound((peer: Peer) => addPeer(peer))
    window.electronAPI?.onPeerLost((id: string) => removePeer(id))
    window.electronAPI?.onPeerUpdated((peer: Peer) => updatePeer(peer))
  }, [])
}
