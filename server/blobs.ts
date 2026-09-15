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
/** Lançado quando o corpo passa do limite; o arquivo parcial já foi apagado. */
export class UploadTooLarge extends Error {
  // Campo declarado por extenso: o Node roda este arquivo removendo só os tipos
  // (sem transpilar), e `constructor(readonly x)` é sintaxe que ele recusa —
  // derrubava o servidor na inicialização, embora tsc e vitest passassem.
  readonly limitBytes: number

  constructor(limitBytes: number) {
    super(`upload maior que ${limitBytes} bytes`)
    this.limitBytes = limitBytes
  }
}

export async function writeBlob(
  body: ReadableStream<Uint8Array>,
  maxBytes = 0,
): Promise<{
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
      size += chunk.length
      // Conferido durante a gravação, e não só pelo Content-Length: esse
      // cabeçalho é declarado pelo cliente e pode faltar ou mentir.
      if (maxBytes > 0 && size > maxBytes) return done(new UploadTooLarge(maxBytes))
      hash.update(chunk)
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
