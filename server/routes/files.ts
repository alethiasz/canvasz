import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { Readable } from 'node:stream'
import { Hono } from 'hono'
import { nanoid } from 'nanoid'
import { blobPath, writeBlob } from '../blobs.ts'
import { db } from '../db.ts'
import { guessMime } from '../mime.ts'
import { enqueueExtraction } from '../extract.ts'
import { selectNodeById } from '../nodeQueries.ts'
import { indexNode } from '../searchIndex.ts'

const selectLiveFolder = db.prepare<[string], { id: string }>(
  `SELECT id FROM nodes WHERE id = ? AND kind = 'folder' AND deleted_at IS NULL`,
)
const selectFile = db.prepare<
  [string],
  { node_id: string; blob_sha: string; mime: string; size: number; original_name: string }
>(
  `SELECT f.node_id, f.blob_sha, f.mime, f.size, f.original_name
   FROM files f JOIN nodes n ON n.id = f.node_id
   WHERE f.node_id = ? AND n.deleted_at IS NULL`,
)

const upsertBlob = db.prepare(
  `INSERT INTO blobs (sha, size, refcount) VALUES (?, ?, 1)
   ON CONFLICT (sha) DO UPDATE SET refcount = refcount + 1`,
)
const insertNode = db.prepare(
  'INSERT INTO nodes (id, parent_id, kind, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
)
const insertFile = db.prepare(
  `INSERT INTO files (node_id, blob_sha, mime, size, original_name, extract_status)
   VALUES (?, ?, ?, ?, ?, 'pending')`,
)

/** O nó, o registro de arquivo e a contagem do blob nascem juntos ou não nascem. */
const createFileNode = db.transaction(
  (
    id: string,
    parentId: string | null,
    title: string,
    sha: string,
    size: number,
    mime: string,
    originalName: string,
  ) => {
    const now = Date.now()
    upsertBlob.run(sha, size)
    insertNode.run(id, parentId, 'file', title, now, now)
    insertFile.run(id, sha, mime, size, originalName)
  },
)

export const files = new Hono()

/**
 * Upload com o corpo cru transmitido em fluxo — nada de multipart, para não
 * bufferizar o arquivo inteiro em memória. Nome e tipo viajam na query.
 */
files.put('/raw', async (c) => {
  const parent = c.req.query('parent') ?? '__root__'
  const name = (c.req.query('name') ?? 'arquivo').slice(0, 200)

  const parentId =
    parent === '__root__' ? null : selectLiveFolder.get(parent) ? parent : undefined
  if (parentId === undefined) return c.json({ error: 'pasta destino inexistente' }, 404)

  const body = c.req.raw.body
  if (!body) return c.json({ error: 'sem corpo' }, 400)

  const mime = guessMime(name, c.req.query('type'))

  try {
    const { sha, size } = await writeBlob(body)
    if (size === 0) return c.json({ error: 'arquivo vazio' }, 400)

    const id = nanoid(12)
    createFileNode(id, parentId, name, sha, size, mime, name)
    indexNode(id)
    // A extração roda depois da resposta: o upload não espera por ela.
    enqueueExtraction(id)
    return c.json({ node: selectNodeById.get(id), file: selectFile.get(id) }, 201)
  } catch (err) {
    console.error('[canvasz] falha no upload', err)
    return c.json({ error: 'falha ao gravar o arquivo' }, 500)
  }
})

files.get('/:id', (c) => {
  const file = selectFile.get(c.req.param('id'))
  if (!file) return c.json({ error: 'arquivo inexistente' }, 404)
  return c.json({ file })
})

/** Serve o conteúdo. Suporta Range, sem o qual vídeo e áudio não navegam. */
files.get('/:id/raw', async (c) => {
  const file = selectFile.get(c.req.param('id'))
  if (!file) return c.json({ error: 'arquivo inexistente' }, 404)

  const path = blobPath(file.blob_sha)
  const info = await stat(path).catch(() => null)
  if (!info) return c.json({ error: 'conteúdo não encontrado no disco' }, 410)

  const total = info.size
  const headers: Record<string, string> = {
    'content-type': file.mime,
    'accept-ranges': 'bytes',
    'cache-control': 'private, max-age=31536000, immutable',
    'content-disposition': `${c.req.query('download') ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(file.original_name)}`,
  }

  const range = c.req.header('range')
  const match = range ? /^bytes=(\d*)-(\d*)$/.exec(range.trim()) : null

  if (match) {
    const [, rawStart, rawEnd] = match
    const start = rawStart ? Number(rawStart) : Math.max(0, total - Number(rawEnd || 0))
    const end = rawStart ? (rawEnd ? Math.min(Number(rawEnd), total - 1) : total - 1) : total - 1

    if (Number.isNaN(start) || start >= total || start > end) {
      return new Response(null, { status: 416, headers: { 'content-range': `bytes */${total}` } })
    }

    const stream = createReadStream(path, { start, end })
    return new Response(Readable.toWeb(stream) as ReadableStream, {
      status: 206,
      headers: {
        ...headers,
        'content-range': `bytes ${start}-${end}/${total}`,
        'content-length': String(end - start + 1),
      },
    })
  }

  const stream = createReadStream(path)
  return new Response(Readable.toWeb(stream) as ReadableStream, {
    status: 200,
    headers: { ...headers, 'content-length': String(total) },
  })
})
