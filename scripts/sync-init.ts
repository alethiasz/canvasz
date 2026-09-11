import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = process.env.CANVASZ_DATA ?? join(here, '..', 'data')

const repo = process.argv[2] ?? process.env.CANVASZ_SYNC_REPO ?? 'canvasz-data'

function run(cmd: string, argv: string[], cwd?: string): string {
  return execFileSync(cmd, argv, {
    encoding: 'utf8',
    cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim()
}

function tentar(cmd: string, argv: string[], cwd?: string): { ok: boolean; out: string } {
  try {
    return { ok: true, out: run(cmd, argv, cwd) }
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string }
    return { ok: false, out: `${e.stdout ?? ''}${e.stderr ?? ''}`.trim() }
  }
}

function morrer(mensagem: string): never {
  console.error(`\n[sync:init] ${mensagem}\n`)
  process.exit(1)
}

if (existsSync(join(DATA_DIR, '.git'))) {
  const remoto = tentar('git', ['-C', DATA_DIR, 'remote', 'get-url', 'origin'])
  morrer(
    `${DATA_DIR} já é um repositório git` +
      (remoto.ok ? `, apontando para ${remoto.out}` : '') +
      `.\nUse  npm run sync  para sincronizar.`,
  )
}

if (!tentar('gh', ['auth', 'status']).ok) {
  morrer('o GitHub CLI não está autenticado. Rode  gh auth login  e tente de novo.')
}

const dono = run('gh', ['api', 'user', '--jq', '.login'])
const alvo = repo.includes('/') ? repo : `${dono}/${repo}`

console.log(`[sync:init] conteúdo: ${DATA_DIR}`)
console.log(`[sync:init] repositório: ${alvo}`)

// ---------------------------------------------------------------------------
// Repositório remoto — privado, sempre
// ---------------------------------------------------------------------------

const existe = tentar('gh', ['repo', 'view', alvo, '--json', 'isPrivate,url'])

if (existe.ok) {
  const { isPrivate, url } = JSON.parse(existe.out) as { isPrivate: boolean; url: string }
  if (!isPrivate) {
    // Suas notas não vão para um repositório aberto por acidente.
    morrer(
      `${url} existe mas é PÚBLICO.\n` +
        `Torne-o privado (gh repo edit ${alvo} --visibility private) ou escolha outro nome:\n` +
        `  npm run sync:init -- outro-nome`,
    )
  }
  console.log(`[sync:init] usando o repositório privado que já existe: ${url}`)
} else {
  const criado = tentar('gh', ['repo', 'create', alvo, '--private', '--description',
    'Conteúdo do canvasz (notas, arquivos e desenhos) — privado'])
  if (!criado.ok) morrer(`não consegui criar ${alvo}:\n${criado.out}`)
  console.log(`[sync:init] repositório privado criado: ${alvo}`)
}

// ---------------------------------------------------------------------------
// Repositório local dentro de data/
// ---------------------------------------------------------------------------

mkdirSync(DATA_DIR, { recursive: true })

writeFileSync(
  join(DATA_DIR, '.gitignore'),
  [
    '# Arquivos de apoio do SQLite: são estado transitório e o `npm run sync`',
    '# já dobra o conteúdo deles no .db antes de versionar. Versioná-los seria',
    '# pedir corrupção.',
    'canvasz.db-wal',
    'canvasz.db-shm',
    '',
  ].join('\n'),
  'utf8',
)

writeFileSync(
  join(DATA_DIR, 'README.md'),
  [
    '# Conteúdo do canvasz',
    '',
    'Repositório **privado** com as notas, arquivos e desenhos do canvasz.',
    'Ele é sincronizado pelo `npm run sync` lá no projeto — não edite nada aqui',
    'à mão enquanto o app estiver aberto.',
    '',
    '| o quê | onde |',
    '| --- | --- |',
    '| banco (tudo, inclusive os desenhos) | `canvasz.db` |',
    '| arquivos enviados, pelo SHA-256 | `blobs/` |',
    '| espelho legível das notas | `notes/` |',
    '',
    'O `notes/` é derivado do banco a cada sincronia: serve para ler e buscar',
    'pelo site do GitHub, e para os diffs mostrarem o que mudou. A fonte da',
    'verdade é o `canvasz.db`.',
    '',
    '## Em outro PC',
    '',
    '```bash',
    'git clone https://github.com/<você>/canvasz.git',
    'cd canvasz',
    'git clone <url deste repositório> data',
    'docker compose up',
    '```',
    '',
    '> Um PC de cada vez: o banco é binário e o git não mescla duas versões',
    '> dele. Sincronize ao começar e ao terminar.',
    '',
  ].join('\n'),
  'utf8',
)

run('git', ['init', '-b', 'main'], DATA_DIR)
run('git', ['remote', 'add', 'origin', `https://github.com/${alvo}.git`], DATA_DIR)

console.log('\n[sync:init] pronto. Agora rode:\n')
console.log('    npm run sync\n')
console.log('para enviar seu conteúdo pela primeira vez.')
