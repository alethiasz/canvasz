const BY_EXTENSION: Record<string, string> = {
  // imagem
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
  webp: 'image/webp', svg: 'image/svg+xml', avif: 'image/avif', bmp: 'image/bmp',
  ico: 'image/x-icon', heic: 'image/heic',
  // vídeo e áudio
  mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', mkv: 'video/x-matroska',
  mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', flac: 'audio/flac', m4a: 'audio/mp4',
  // documentos
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  odt: 'application/vnd.oasis.opendocument.text', epub: 'application/epub+zip',
  // texto e código
  txt: 'text/plain', md: 'text/markdown', csv: 'text/csv', json: 'application/json',
  xml: 'application/xml', yaml: 'text/yaml', yml: 'text/yaml', html: 'text/html',
  css: 'text/css', js: 'text/javascript', ts: 'text/typescript', tsx: 'text/typescript',
  jsx: 'text/javascript', py: 'text/x-python', rs: 'text/x-rust', go: 'text/x-go',
  sh: 'text/x-shellscript', sql: 'text/x-sql', toml: 'text/toml', ini: 'text/plain',
  // arquivos compactados
  zip: 'application/zip', gz: 'application/gzip', tar: 'application/x-tar',
  '7z': 'application/x-7z-compressed', rar: 'application/vnd.rar',
}

export const FALLBACK_MIME = 'application/octet-stream'

/**
 * Formato desconhecido nunca é motivo para recusar o upload: sem palpite bom,
 * o arquivo vira `application/octet-stream` e a interface mostra um card
 * genérico com download.
 */
export function guessMime(filename: string, provided?: string): string {
  if (provided && provided !== FALLBACK_MIME && provided.includes('/')) return provided
  const ext = filename.toLowerCase().split('.').pop() ?? ''
  return BY_EXTENSION[ext] ?? FALLBACK_MIME
}

/** Tipos que a interface consegue mostrar embutidos. */
export function previewKind(mime: string): 'image' | 'video' | 'audio' | 'pdf' | 'text' | 'other' {
  if (mime.startsWith('image/')) return 'image'
  if (mime.startsWith('video/')) return 'video'
  if (mime.startsWith('audio/')) return 'audio'
  if (mime === 'application/pdf') return 'pdf'
  if (
    mime.startsWith('text/') ||
    mime === 'application/json' ||
    mime === 'application/xml'
  ) {
    return 'text'
  }
  return 'other'
}
