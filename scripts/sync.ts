import Database from 'better-sqlite3'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = process.env.CANVASZ_DATA ?? join(here, '..', 'data')
const NOTES_DIR = join(DATA_DIR, 'notes')

const args = new Set(process.argv.slice(2))
const keepMine = args.has('--keep-mine')
const keepTheirs = args.has('--keep-theirs')

function git(...argv: string[]): string {
  // stderr capturado em vez de vazar: quem decide o que o usuário lê é este
  // script, não o git.
  return execFileSync('git', ['-C', DATA_DIR, ...argv], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim()
}

function gitQuiet(...argv: string[]): { ok: boolean; out: string } {
  try {
    return { ok: true, out: git(...argv) }
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string }
    return { ok: false, out: `${e.stdout ?? ''}${e.stderr ?? ''}`.trim() }
  }
}

function morrer(mensagem: string): never {
  console.error(`\n[sync] ${mensagem}\n`)
  process.exit(1)
}

if (!existsSync(join(DATA_DIR, '.git'))) {
  morrer(
    `${DATA_DIR} não é um repositório git.\n` +
      `Configure uma vez com:  npm run sync:init  (veja o README)`,
  )
}

// ---------------------------------------------------------------------------
// 1. Deixar o arquivo .db completo antes de versioná-lo
// ---------------------------------------------------------------------------

/**
 * Em modo WAL as gravações recentes vivem no `-wal`, que não vai para o git.
 * Sem este checkpoint, o `.db` commitado estaria faltando justamente o
 * trabalho mais novo — o pior tipo de backup, o que parece ter funcionado.
 */
const db = new Database(join(DATA_DIR, 'canvasz.db'))
db.pragma('wal_checkpoint(TRUNCATE)')

const integridade = db.pragma('integrity_check', { simple: true }) as string
if (integridade !== 'ok') {
  db.close()
  morrer(`o banco não passou no integrity_check ("${integridade}"). Nada foi enviado.`)
}

// ---------------------------------------------------------------------------
// 2. Espelho legível: as notas em .md, com a mesma hierarquia
// ---------------------------------------------------------------------------

type Linha = {
  id: string
  parent_id: string | null
  kind: 'folder' | 'note' | 'file'
  title: string
  markdown: string | null
  blob_sha: string | null
  original_name: string | null
  size: number | null
}

const linhas = db
  .prepare<[], Linha>(`
    WITH RECURSIVE walk(id, depth) AS (
      SELECT id, 0 FROM nodes WHERE parent_id IS NULL AND deleted_at IS NULL
      UNION ALL
      SELECT n.id, walk.depth + 1 FROM nodes n JOIN walk ON n.parent_id = walk.id
      WHERE n.deleted_at IS NULL
    )
    SELECT n.id, n.parent_id, n.kind, n.title,
           nt.markdown, f.blob_sha, f.original_name, f.size
    FROM walk
    JOIN nodes n ON n.id = walk.id
    LEFT JOIN notes nt ON nt.node_id = n.id
    LEFT JOIN files f ON f.node_id = n.id
    ORDER BY walk.depth
  `)
  .all()

db.close()

const nomeSeguro = (bruto: string, reserva: string) =>
  bruto.replace(/[/\\?%*:|"<>]/g, '-').replace(/^\.+/, '').trim() || reserva

// O espelho é derivado: apagar e refazer garante que nota removida some daqui
// também. Conteúdo idêntico regrava os mesmos bytes, então o git não vê diff.
rmSync(NOTES_DIR, { recursive: true, force: true })
mkdirSync(NOTES_DIR, { recursive: true })

const pastaDe = new Map<string, string>()
const arquivos: string[] = []
let quantasNotas = 0

for (const linha of linhas) {
  const pai = linha.parent_id ? (pastaDe.get(linha.parent_id) ?? '') : ''

  if (linha.kind === 'folder') {
    const dir = join(pai, nomeSeguro(linha.title, linha.id))
    pastaDe.set(linha.id, dir)
    mkdirSync(join(NOTES_DIR, dir), { recursive: true })
    continue
  }

  if (linha.kind === 'note') {
    writeFileSync(
      join(NOTES_DIR, pai, `${nomeSeguro(linha.title, linha.id)}.md`),
      linha.markdown ?? '',
      'utf8',
    )
    quantasNotas++
    continue
  }

  // Arquivos não são duplicados: o conteúdo já está em blobs/, endereçado pelo
  // sha. O índice abaixo é o que liga o nome original ao arquivo lá dentro.
  if (linha.blob_sha) {
    const caminho = `blobs/${linha.blob_sha.slice(0, 2)}/${linha.blob_sha}`
    arquivos.push(
      `| ${join(pai, linha.original_name ?? linha.title) || linha.title} | ${linha.size ?? 0} B | \`${caminho}\` |`,
    )
  }
}

if (arquivos.length > 0) {
  writeFileSync(
    join(NOTES_DIR, '_arquivos.md'),
    [
      '# Arquivos enviados',
      '',
      'O conteúdo está em `blobs/`, nomeado pelo SHA-256. Esta tabela liga o',
      'nome original ao arquivo correspondente — útil para achar algo sem abrir',
      'o canvasz.',
      '',
      '| nome | tamanho | onde está |',
      '| --- | --- | --- |',
      ...arquivos,
      '',
    ].join('\n'),
    'utf8',
  )
}

console.log(`[sync] ${quantasNotas} nota(s) e ${arquivos.length} arquivo(s) espelhados`)

// ---------------------------------------------------------------------------
// 3. Commit local
// ---------------------------------------------------------------------------

git('add', '-A')
const temMudancaLocal = !gitQuiet('diff', '--cached', '--quiet').ok
if (temMudancaLocal) {
  const quando = new Date().toLocaleString('pt-BR')
  git('commit', '-m', `conteúdo: ${quando}`)
  console.log('[sync] mudanças locais salvas em commit')
} else {
  console.log('[sync] nada mudou por aqui')
}

// ---------------------------------------------------------------------------
// 4. Conciliar com o remoto — sem jamais descartar nada em silêncio
// ---------------------------------------------------------------------------

const fetched = gitQuiet('fetch', 'origin')
if (!fetched.ok) morrer(`não consegui falar com o remoto:\n${fetched.out}`)

const ramo = git('rev-parse', '--abbrev-ref', 'HEAD')
const upstream = gitQuiet('rev-parse', '--verify', `origin/${ramo}`)

if (!upstream.ok) {
  git('push', '-u', 'origin', ramo)
  console.log(`[sync] ramo ${ramo} publicado no remoto`)
  process.exit(0)
}

const atras = Number(git('rev-list', '--count', `HEAD..origin/${ramo}`))
const afrente = Number(git('rev-list', '--count', `origin/${ramo}..HEAD`))

if (atras > 0 && afrente > 0) {
  /**
   * Os dois lados andaram. O banco é binário: o git não tem como mesclar duas
   * versões dele, e adivinhar aqui significaria apagar o trabalho de alguém.
   * Então paramos e deixamos a escolha explícita.
   */
  if (!keepMine && !keepTheirs) {
    morrer(
      `este PC e o remoto têm alterações diferentes (${afrente} daqui, ${atras} de lá).\n` +
        `Como o banco é binário, não dá para juntar os dois — é preciso escolher:\n\n` +
        `  npm run sync -- --keep-mine     mantém o deste PC e descarta o remoto\n` +
        `  npm run sync -- --keep-theirs   mantém o remoto e descarta o deste PC\n\n` +
        `Na dúvida, faça uma cópia antes:  npm run backup`,
    )
  }

  if (keepMine) {
    git('push', '--force-with-lease', 'origin', ramo)
    console.log('[sync] versão deste PC enviada, sobrescrevendo o remoto')
    process.exit(0)
  }

  git('reset', '--hard', `origin/${ramo}`)
  console.log('[sync] versão do remoto adotada; o que havia só aqui foi descartado')
  process.exit(0)
}

if (atras > 0) {
  git('merge', '--ff-only', `origin/${ramo}`)
  console.log(`[sync] ${atras} atualização(ões) trazidas do remoto`)
}

if (afrente > 0 || (temMudancaLocal && atras === 0)) {
  git('push', 'origin', ramo)
  console.log('[sync] enviado para o GitHub')
}

console.log('[sync] tudo em dia')
