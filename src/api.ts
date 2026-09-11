import type { TLStoreSnapshot } from 'tldraw'
import type { FileMeta } from './files'

export const ROOT_CANVAS = '__root__'

export type NodeKind = 'folder' | 'note' | 'file'

export type CanvasNode = {
  id: string
  parent_id: string | null
  kind: NodeKind
  title: string
  created_at: number
  updated_at: number
  child_count: number
  /** Começo do markdown, usado no card da nota. Só para `kind: 'note'`. */
  preview: string | null
  /** Só para `kind: 'file'`. */
  mime: string | null
  size: number | null
}

export type PathSegment = { id: string; title: string; kind: NodeKind }

export type TreeNode = {
  id: string
  parent_id: string | null
  kind: NodeKind
  title: string
  updated_at: number
  children: TreeNode[]
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...init?.headers },
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`${init?.method ?? 'GET'} /api${path} → ${res.status} ${detail}`)
  }
  return (await res.json()) as T
}

export function getCanvas(id: string) {
  return request<{ snapshot: TLStoreSnapshot | null }>(`/canvases/${encodeURIComponent(id)}`)
}

export function putCanvas(id: string, snapshot: unknown) {
  return request<{ ok: true }>(`/canvases/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify({ snapshot }),
  })
}

export function listNodes(canvasId: string) {
  return request<{ nodes: CanvasNode[] }>(`/nodes?parent=${encodeURIComponent(canvasId)}`)
}

export function createNode(parent: string, kind: 'folder' | 'note', title: string) {
  return request<{ node: CanvasNode }>('/nodes', {
    method: 'POST',
    body: JSON.stringify({ parent, kind, title }),
  })
}

export function getNote(id: string) {
  return request<{ markdown: string; title: string }>(`/notes/${encodeURIComponent(id)}`)
}

export function putNote(id: string, markdown: string) {
  return request<{ ok: true }>(`/notes/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify({ markdown }),
  })
}

/**
 * Envia o corpo cru em vez de multipart: o `File` vai direto para o disco do
 * servidor sem passar por memória, então o tamanho não é problema.
 */
export async function uploadFile(parent: string, file: File) {
  const params = new URLSearchParams({ parent, name: file.name })
  if (file.type) params.set('type', file.type)

  const res = await fetch(`/api/files/raw?${params.toString()}`, { method: 'PUT', body: file })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`upload de ${file.name} → ${res.status} ${detail}`)
  }
  return (await res.json()) as { node: CanvasNode; file: FileMeta }
}

export function getFile(id: string) {
  return request<{ file: FileMeta }>(`/files/${encodeURIComponent(id)}`)
}

export type SearchHit = {
  node_id: string
  kind: NodeKind
  title: string
  parent_id: string | null
  /** Trecho do corpo com os termos entre « », vindo do snippet() do FTS5. */
  excerpt: string
}

export function searchAll(q: string) {
  return request<{ hits: SearchHit[] }>(`/search?q=${encodeURIComponent(q)}`)
}

export type TrashItem = {
  id: string
  kind: NodeKind
  title: string
  deleted_at: number
  /** Quantos itens vão junto se este for apagado de vez. */
  descendants: number
}

export function listTrash() {
  return request<{ items: TrashItem[] }>('/trash')
}

/** Apaga de vez: remove os registros e os arquivos que ficarem sem dono. */
export function purgeNode(id: string) {
  return request<{ ok: true }>(`/trash/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

export function emptyTrash() {
  return request<{ ok: true }>('/trash', { method: 'DELETE' })
}

export const exportUrl = (id: string) => `/api/export/${encodeURIComponent(id)}`

export function getTree() {
  return request<{ tree: TreeNode[] }>('/tree')
}

/** Resolve um `[[Título]]` para o nó correspondente, se houver. */
export function resolveTitle(title: string) {
  return request<{ node: { id: string; kind: NodeKind } | null }>(
    `/notes/by-title?title=${encodeURIComponent(title)}`,
  )
}

export function updateNode(id: string, patch: { title?: string; parent?: string; restore?: true }) {
  return request<{ node: CanvasNode }>(`/nodes/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })
}

export function deleteNode(id: string) {
  return request<{ ok: true }>(`/nodes/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

export function getPath(id: string) {
  return request<{ path: PathSegment[] }>(`/nodes/${encodeURIComponent(id)}/path`)
}
