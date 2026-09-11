import Database from 'better-sqlite3'
import { mkdirSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))

export const DATA_DIR = process.env.CANVASZ_DATA ?? join(here, '..', 'data')
export const BLOB_DIR = join(DATA_DIR, 'blobs')

/**
 * Migrations são arquivos `NNN_nome.sql` aplicados em ordem. `user_version`
 * guarda quantas já rodaram, então cada arquivo é aplicado exatamente uma vez.
 * Exportada para que os testes montem o mesmo schema num banco `:memory:`.
 */
export function applyMigrations(database: Database.Database): void {
  const dir = join(here, 'migrations')
  const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()
  const applied = database.pragma('user_version', { simple: true }) as number

  for (let i = applied; i < files.length; i++) {
    const file = files[i]!
    const sql = readFileSync(join(dir, file), 'utf8')
    database.transaction(() => {
      database.exec(sql)
      database.pragma(`user_version = ${i + 1}`)
    })()
    console.log(`[db] migration aplicada: ${file}`)
  }
}

export function openDatabase(path: string): Database.Database {
  const database = new Database(path)
  database.pragma('journal_mode = WAL')
  database.pragma('foreign_keys = ON')
  applyMigrations(database)
  return database
}

mkdirSync(BLOB_DIR, { recursive: true })

/**
 * Migrado no carregamento do módulo, de propósito: os módulos de rota preparam
 * statements no topo e o ESM os executa antes de qualquer chamada em index.ts.
 */
export const db = openDatabase(join(DATA_DIR, 'canvasz.db'))
