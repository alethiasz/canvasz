import Database from 'better-sqlite3'
import { chown, cp, mkdir, readdir, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = process.env.CANVASZ_DATA ?? join(here, '..', 'data')
const OUT_ROOT = process.env.CANVASZ_BACKUP ?? join(here, '..', 'backups')

const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
const dest = join(OUT_ROOT, `canvasz-${stamp}`)

await mkdir(dest, { recursive: true })

/**
 * `VACUUM INTO` grava uma cópia consistente do banco mesmo com o servidor
 * rodando e escrevendo — copiar o arquivo .db à mão, com WAL ativo, pode
 * gerar um backup corrompido.
 */
const db = new Database(join(DATA_DIR, 'canvasz.db'), { readonly: true })
db.exec(`VACUUM INTO '${join(dest, 'canvasz.db').replace(/'/g, "''")}'`)
db.close()

const blobs = join(DATA_DIR, 'blobs')
if (await stat(blobs).catch(() => null)) {
  await cp(blobs, join(dest, 'blobs'), { recursive: true })
}

let size = 0
const walk = async (dir: string, visit: (path: string) => Promise<void>) => {
  await visit(dir)
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) await walk(full, visit)
    else {
      await visit(full)
      size += (await stat(full)).size
    }
  }
}

/**
 * `docker compose exec` entra como root, então o backup nasceria com dono root
 * e você precisaria de sudo só para apagá-lo. Rodando como root, alinhamos a
 * posse com a do diretório de dados, que é quem realmente manda aqui.
 */
const dono = await stat(DATA_DIR)
const precisaAjustarPosse = process.getuid?.() === 0 && dono.uid !== 0

await walk(dest, async (path) => {
  if (precisaAjustarPosse) await chown(path, dono.uid, dono.gid).catch(() => {})
})

console.log(`[backup] ${dest} (${(size / 1024 / 1024).toFixed(1)} MB)`)
console.log(`[backup] restaurar: pare o app e copie o conteúdo de volta para ${DATA_DIR}`)
