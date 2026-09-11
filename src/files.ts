export const FILE_PREFIX = 'canvasz://file/'

export type FileMeta = {
  node_id: string
  blob_sha: string
  mime: string
  size: number
  original_name: string
}

export const fileRawUrl = (id: string) => `/api/files/${encodeURIComponent(id)}/raw`
export const fileDownloadUrl = (id: string) => `${fileRawUrl(id)}?download=1`

export type PreviewKind = 'image' | 'video' | 'audio' | 'pdf' | 'text' | 'other'

/** O que a interface consegue mostrar embutido; o resto vira card de download. */
export function previewKind(mime: string | null | undefined): PreviewKind {
  if (!mime) return 'other'
  if (mime.startsWith('image/')) return 'image'
  if (mime.startsWith('video/')) return 'video'
  if (mime.startsWith('audio/')) return 'audio'
  if (mime === 'application/pdf') return 'pdf'
  if (mime.startsWith('text/') || mime === 'application/json' || mime === 'application/xml') {
    return 'text'
  }
  return 'other'
}

export const KIND_ICON: Record<PreviewKind, string> = {
  image: '🖼', video: '🎬', audio: '🎵', pdf: '📕', text: '📃', other: '📦',
}

export function formatSize(bytes: number | null | undefined): string {
  if (bytes == null) return ''
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let value = bytes / 1024
  let i = 0
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024
    i++
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[i]}`
}

/**
 * Imagem vira `![]()` para aparecer embutida; qualquer outro formato vira link,
 * porque sintaxe de imagem com um zip não renderiza nada.
 */
export function fileMarkdown(id: string, name: string, mime: string): string {
  const ref = `${FILE_PREFIX}${id}`
  return previewKind(mime) === 'image' ? `![${name}](${ref})` : `[${name}](${ref})`
}
