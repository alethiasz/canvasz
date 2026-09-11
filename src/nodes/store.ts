import { create } from 'zustand'
import type { CanvasNode } from '../api'

type NodesState = {
  /** Nós do canvas aberto, por id. Os cards leem o título daqui. */
  byId: Record<string, CanvasNode>
  setAll: (nodes: CanvasNode[]) => void
  upsert: (node: CanvasNode) => void
  remove: (id: string) => void
}

export const useNodesStore = create<NodesState>((set) => ({
  byId: {},
  setAll: (nodes) => set({ byId: Object.fromEntries(nodes.map((n) => [n.id, n])) }),
  upsert: (node) => set((s) => ({ byId: { ...s.byId, [node.id]: node } })),
  remove: (id) =>
    set((s) => {
      if (!(id in s.byId)) return s
      const { [id]: _removed, ...rest } = s.byId
      return { byId: rest }
    }),
}))
