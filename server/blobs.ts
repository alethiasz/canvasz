import { createHash, randomUUID } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { mkdir, rename, rm, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { BLOB_DIR } from './db.ts'

/** Blobs vivem em `<dir>/<2 primeiros do sha>/<sha>` — endereçados pelo conteúdo. */
export function blobPath(sha: string): string {
  return join(BLOB_DIR, sha.slice(0, 2), sha)
}

/**
 * Grava o corpo da requisição em disco em fluxo, calculando o SHA-256 no
 * caminho. Nada é bufferizado em memória, então um vídeo de 2 GB custa o mesmo
 * que um txt. Se o conteúdo já existir, o arquivo temporário é descartado e o
 * blob existente é reaproveitado.
 */
export async function writeBlob(body: ReadableStream<Uint8Array>): Promise<{
  sha: string
  size: number
  deduped: boolean
}> {
  await mkdir(BLOB_DIR, { recursive: true })
  const tmp = join(BLOB_DIR, `.tmp-${randomUUID()}`)

  const hash = createHash('sha256')
  let size = 0
  const measure = new Transform({
    transform(chunk: Buffer, _enc, done) {
      hash.update(chunk)
      size += chunk.length
      done(null, chunk)
    },
  })

  try {
    await pipeline(Readable.fromWeb(body as never), measure, createWriteStream(tmp))
  } catch (err) {
    await rm(tmp, { force: true })
    throw err
  }

  const sha = hash.digest('hex')
  const dest = blobPath(sha)
  await mkdir(dirname(dest), { recursive: true })

  const deduped = await stat(dest).then(
    () => true,
    () => false,
  )
  if (deduped) await rm(tmp, { force: true })
  else await rename(tmp, dest)

  return { sha, size, deduped }
}
