import { readFile } from 'node:fs/promises'
import { blobPath } from './blobs.ts'
import { db } from './db.ts'
import { indexNode } from './searchIndex.ts'

/** Texto extraído acima disso não ajuda a busca e só incha o banco. */
const MAX_TEXT = 2_000_000
const MAX_SOURCE_BYTES = 100_000_000

const selectFile = db.prepare<[string], { blob_sha: string; mime: string; size: number }>(
  'SELECT blob_sha, mime, size FROM files WHERE node_id = ?',
)
const saveText = db.prepare(
  'UPDATE files SET extracted_text = ?, extract_status = ? WHERE node_id = ?',
)

async function extractPdf(path: string): Promise<string> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const task = pdfjs.getDocument({
    data: new Uint8Array(await readFile(path)),
    useSystemFonts: false,
  })
  const doc = await task.promise
  try {
    const pages: string[] = []
    for (let p = 1; p <= doc.numPages; p++) {
      const content = await (await doc.getPage(p)).getTextContent()
      pages.push(content.items.map((i) => ('str' in i ? i.str : '')).join(' '))
      if (pages.join('\n').length > MAX_TEXT) break
    }
    return pages.join('\n')
  } finally {
    // Em pdfjs 6 quem fecha é a task, não o documento.
    await task.destroy()
  }
}

async function extractDocx(path: string): Promise<string> {
  const mammoth = (await import('mammoth')).default
  const { value } = await mammoth.extractRawText({ path })
  return value
}

const DOCX_MIME =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

async function extractText(path: string, mime: string): Promise<string | null> {
  if (mime.startsWith('text/') || mime === 'application/json' || mime === 'application/xml') {
    return await readFile(path, 'utf8')
  }
  if (mime === 'application/pdf') return await extractPdf(path)
  if (mime === DOCX_MIME) return await extractDocx(path)
  return null
}

const queue: string[] = []
let running = false

/**
 * Fila em processo, um arquivo por vez. Extração é secundária: ela nunca pode
 * atrasar o upload nem derrubá-lo, então roda depois da resposta e engole os
 * próprios erros — o arquivo continua guardado e baixável de qualquer jeito.
 */
export function enqueueExtraction(nodeId: string): void {
  queue.push(nodeId)
  if (!running) void drain()
}

async function drain(): Promise<void> {
  running = true
  while (queue.length > 0) {
    const nodeId = queue.shift()!
    const file = selectFile.get(nodeId)
    if (!file) continue

    try {
      if (file.size > MAX_SOURCE_BYTES) {
        saveText.run(null, 'skipped', nodeId)
        continue
      }
      const text = await extractText(blobPath(file.blob_sha), file.mime)
      if (text === null) {
        saveText.run(null, 'skipped', nodeId)
      } else {
        saveText.run(text.slice(0, MAX_TEXT), 'done', nodeId)
        indexNode(nodeId)
      }
    } catch (err) {
      console.warn(`[canvasz] não deu para extrair texto de ${nodeId}:`, err)
      saveText.run(null, 'error', nodeId)
    }
  }
  running = false
}
