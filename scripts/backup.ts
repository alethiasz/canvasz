import Database from 'better-sqlite3'
import { chown, cp, mkdir, readdir, rm, stat } from 'node:fs/promises'
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

/**
 * Rotação opcional (`CANVASZ_BACKUP_KEEP=N` guarda só os N mais recentes).
 *
 * Feita para o backup automático na VPS: sem ela, um cron diário vai
 * empilhando cópias até encher o disco que a outra aplicação também usa. Sem a
 * variável nada é apagado — rodado à mão, o backup continua só acrescentando.
 */
const manter = Number(process.env.CANVASZ_BACKUP_KEEP ?? 0)
if (Number.isInteger(manter) && manter > 0) {
  const anteriores = (await readdir(OUT_ROOT, { withFileTypes: true }))
    .filter((e) => e.isDirectory() && /^canvasz-\d{4}-\d{2}-\d{2}T/.test(e.name))
    .map((e) => e.name)
    // O carimbo ISO ordena por data já em ordem alfabética.
    .sort()
    .reverse()

  for (const velho of anteriores.slice(manter)) {
    if (join(OUT_ROOT, velho) === dest) continue
    await rm(join(OUT_ROOT, velho), { recursive: true, force: true })
    console.log(`[backup] rotação: removido ${velho}`)
  }
}
console.log(`[backup] restaurar: pare o app e copie o conteúdo de volta para ${DATA_DIR}`)
