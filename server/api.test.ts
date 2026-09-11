import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Hono } from 'hono'
import { fromBuffer, type Entry, type ZipFile } from 'yauzl'
import { api, createTestApp, makeNode, uploadFile } from './testHarness.ts'

/** Lê o zip de verdade: o conteúdo vai comprimido, não dá para procurar no cru. */
function lerZip(buffer: Buffer): Promise<Map<string, string>> {
  return new Promise((resolve, reject) => {
    const saida = new Map<string, string>()
    fromBuffer(buffer, { lazyEntries: true }, (err, zip: ZipFile) => {
      if (err) return reject(err)
      zip.readEntry()
      zip.on('entry', (entry: Entry) => {
        zip.openReadStream(entry, (streamErr, stream) => {
          if (streamErr) return reject(streamErr)
          const partes: Buffer[] = []
          stream.on('data', (c: Buffer) => partes.push(c))
          stream.on('end', () => {
            saida.set(entry.fileName, Buffer.concat(partes).toString('utf8'))
            zip.readEntry()
          })
        })
      })
      zip.on('end', () => resolve(saida))
      zip.on('error', reject)
    })
  })
}

let app: Hono
let reset: () => void
let cleanup: () => void
let http: ReturnType<typeof api>

beforeAll(async () => {
  const harness = await createTestApp()
  app = harness.app
  reset = harness.reset
  cleanup = harness.cleanup
  http = api(app)
})

afterAll(() => cleanup())
beforeEach(() => reset())

describe('hierarquia de nós', () => {
  it('cria pasta e nota, e conta os filhos', async () => {
    const pasta = await makeNode(app, '__root__', 'folder', 'Projeto')
    await makeNode(app, pasta, 'note', 'Ata')

    const { body } = await http.get('/api/nodes?parent=__root__')
    const nodes = body.nodes as { title: string; child_count: number }[]
    expect(nodes).toHaveLength(1)
    expect(nodes[0]).toMatchObject({ title: 'Projeto', child_count: 1 })
  })

  it('recusa criar em pasta inexistente', async () => {
    const { status } = await http.post('/api/nodes', {
      parent: 'nao-existe',
      kind: 'note',
      title: 'x',
    })
    expect(status).toBe(404)
  })

  it('recusa kind desconhecido', async () => {
    const { status } = await http.post('/api/nodes', { parent: '__root__', kind: 'arquivo' })
    expect(status).toBe(400)
  })

  it('impede mover uma pasta para dentro dela mesma', async () => {
    const pai = await makeNode(app, '__root__', 'folder', 'Pai')
    const filho = await makeNode(app, pai, 'folder', 'Filho')
    const neto = await makeNode(app, filho, 'folder', 'Neto')

    // Mover o avô para dentro do neto quebraria a árvore em ciclo.
    expect((await http.patch(`/api/nodes/${pai}`, { parent: neto })).status).toBe(409)
    expect((await http.patch(`/api/nodes/${pai}`, { parent: pai })).status).toBe(409)
  })

  it('move um nó entre pastas', async () => {
    const a = await makeNode(app, '__root__', 'folder', 'A')
    const b = await makeNode(app, '__root__', 'folder', 'B')
    const nota = await makeNode(app, a, 'note', 'Nota')

    await http.patch(`/api/nodes/${nota}`, { parent: b })

    const emA = (await http.get(`/api/nodes?parent=${a}`)).body.nodes as unknown[]
    const emB = (await http.get(`/api/nodes?parent=${b}`)).body.nodes as { id: string }[]
    expect(emA).toHaveLength(0)
    expect(emB.map((n) => n.id)).toEqual([nota])
  })

  it('apagar leva a subárvore junto, e restaurar traz de volta', async () => {
    const pasta = await makeNode(app, '__root__', 'folder', 'Projeto')
    const sub = await makeNode(app, pasta, 'folder', 'Sub')
    const nota = await makeNode(app, sub, 'note', 'Fundo')

    await http.del(`/api/nodes/${pasta}`)
    expect((await http.get(`/api/nodes/${nota}/path`)).status).toBe(404)
    // O canvas de uma pasta na lixeira também some.
    expect((await http.get(`/api/canvases/${sub}`)).status).toBe(404)

    await http.patch(`/api/nodes/${pasta}`, { restore: true })
    const { body } = await http.get(`/api/nodes/${nota}/path`)
    expect((body.path as { title: string }[]).map((p) => p.title)).toEqual([
      'Projeto',
      'Sub',
      'Fundo',
    ])
  })
})

describe('notas', () => {
  it('salva e devolve o markdown', async () => {
    const nota = await makeNode(app, '__root__', 'note', 'Ideias')
    expect((await http.get(`/api/notes/${nota}`)).body.markdown).toBe('')

    await http.raw(`/api/notes/${nota}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ markdown: '# Oi\n\ncorpo' }),
    })
    expect((await http.get(`/api/notes/${nota}`)).body.markdown).toBe('# Oi\n\ncorpo')
  })

  it('resolve wikilink por título, sem diferenciar caixa', async () => {
    const alvo = await makeNode(app, '__root__', 'note', 'Referências')
    const { body } = await http.get('/api/notes/by-title?title=referências')
    expect((body.node as { id: string }).id).toBe(alvo)

    expect((await http.get('/api/notes/by-title?title=nada')).body.node).toBeNull()
  })
})

describe('arquivos', () => {
  it('aceita qualquer formato e deduplica pelo conteúdo', async () => {
    const bytes = new Uint8Array([1, 2, 3, 4, 5])
    const um = await uploadFile(app, '__root__', 'a.desconhecido', bytes)
    const dois = await uploadFile(app, '__root__', 'b.desconhecido', bytes)

    expect(um.status).toBe(201)
    expect(dois.status).toBe(201)
    expect(um.id).not.toBe(dois.id)

    const { db } = await import('./db.ts')
    const blobs = db.prepare('SELECT sha, refcount FROM blobs').all() as { refcount: number }[]
    // Mesmo conteúdo, dois nós: um blob só, com refcount 2.
    expect(blobs).toHaveLength(1)
    expect(blobs[0]!.refcount).toBe(2)
  })

  it('formato desconhecido vira octet-stream em vez de ser recusado', async () => {
    const { id } = await uploadFile(app, '__root__', 'modelo.blend', new Uint8Array([9, 9]))
    const { body } = await http.get(`/api/files/${id}`)
    expect((body.file as { mime: string }).mime).toBe('application/octet-stream')
  })

  it('recusa arquivo vazio e pasta inexistente', async () => {
    expect((await uploadFile(app, '__root__', 'v.txt', new Uint8Array([]))).status).toBe(400)
    expect((await uploadFile(app, 'nao-existe', 'a.txt', 'oi')).status).toBe(404)
  })

  it('serve o conteúdo íntegro e responde a Range', async () => {
    const conteudo = 'abcdefghijklmnopqrstuvwxyz'
    const { id } = await uploadFile(app, '__root__', 'letras.txt', conteudo, 'text/plain')

    const inteiro = await http.raw(`/api/files/${id}/raw`)
    expect(inteiro.status).toBe(200)
    expect(await inteiro.text()).toBe(conteudo)

    const parcial = await http.raw(`/api/files/${id}/raw`, { headers: { range: 'bytes=0-4' } })
    expect(parcial.status).toBe(206)
    expect(parcial.headers.get('content-range')).toBe(`bytes 0-4/${conteudo.length}`)
    expect(await parcial.text()).toBe('abcde')

    const fora = await http.raw(`/api/files/${id}/raw`, { headers: { range: 'bytes=999-' } })
    expect(fora.status).toBe(416)
  })
})

describe('busca', () => {
  it('acha por título e por corpo da nota', async () => {
    const nota = await makeNode(app, '__root__', 'note', 'Reunião')
    await http.raw(`/api/notes/${nota}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ markdown: 'combinamos revisar o orçamento' }),
    })

    const porTitulo = (await http.get('/api/search?q=reuni')).body.hits as unknown[]
    const porCorpo = (await http.get('/api/search?q=orçamento')).body.hits as { title: string }[]
    expect(porTitulo).toHaveLength(1)
    expect(porCorpo[0]!.title).toBe('Reunião')
  })

  it('acha dentro do texto de um arquivo indexado', async () => {
    const { id } = await uploadFile(app, '__root__', 'notas.txt', 'palavra rara: xilofone', 'text/plain')
    // A extração roda numa fila fora do ciclo da requisição.
    await new Promise((r) => setTimeout(r, 300))

    const hits = (await http.get('/api/search?q=xilofone')).body.hits as { node_id: string }[]
    expect(hits.map((h) => h.node_id)).toContain(id)
  })

  it('não quebra com sintaxe do FTS na consulta', async () => {
    await makeNode(app, '__root__', 'note', 'Qualquer')
    for (const q of ['AND', 'NEAR*', '"( )"', '*', '   ', 'OR OR OR']) {
      const { status, body } = await http.get(`/api/search?q=${encodeURIComponent(q)}`)
      expect(status).toBe(200)
      expect(Array.isArray(body.hits)).toBe(true)
    }
  })

  it('nó na lixeira sai do índice e volta ao ser restaurado', async () => {
    const pasta = await makeNode(app, '__root__', 'folder', 'Sumido')
    await http.del(`/api/nodes/${pasta}`)
    expect((await http.get('/api/search?q=sumido')).body.hits).toHaveLength(0)

    await http.patch(`/api/nodes/${pasta}`, { restore: true })
    expect((await http.get('/api/search?q=sumido')).body.hits).toHaveLength(1)
  })
})

describe('lixeira', () => {
  it('mostra um item por subárvore, não um por nó', async () => {
    const pasta = await makeNode(app, '__root__', 'folder', 'Projeto')
    const sub = await makeNode(app, pasta, 'folder', 'Sub')
    await makeNode(app, sub, 'note', 'Nota')

    await http.del(`/api/nodes/${pasta}`)
    const itens = (await http.get('/api/trash')).body.items as { descendants: number }[]
    expect(itens).toHaveLength(1)
    expect(itens[0]!.descendants).toBe(2)
  })

  it('apagar de vez remove os registros e o blob órfão', async () => {
    const pasta = await makeNode(app, '__root__', 'folder', 'Some')
    await uploadFile(app, pasta, 'x.bin', new Uint8Array([7, 7, 7]))

    await http.del(`/api/nodes/${pasta}`)
    expect((await http.del(`/api/trash/${pasta}`)).status).toBe(200)

    const { db } = await import('./db.ts')
    expect(db.prepare('SELECT COUNT(*) c FROM nodes').get()).toMatchObject({ c: 0 })
    expect(db.prepare('SELECT COUNT(*) c FROM files').get()).toMatchObject({ c: 0 })
    expect(db.prepare('SELECT COUNT(*) c FROM blobs').get()).toMatchObject({ c: 0 })
  })

  it('mantém o blob enquanto outro nó ainda usa o mesmo conteúdo', async () => {
    const a = await makeNode(app, '__root__', 'folder', 'A')
    const b = await makeNode(app, '__root__', 'folder', 'B')
    const mesmo = new Uint8Array([4, 2])
    await uploadFile(app, a, 'copia1.bin', mesmo)
    const emB = await uploadFile(app, b, 'copia2.bin', mesmo)

    await http.del(`/api/nodes/${a}`)
    await http.del(`/api/trash/${a}`)

    const { db } = await import('./db.ts')
    const blobs = db.prepare('SELECT refcount FROM blobs').all() as { refcount: number }[]
    expect(blobs).toHaveLength(1)
    expect(blobs[0]!.refcount).toBe(1)
    // E o arquivo que sobrou continua servível.
    expect((await http.raw(`/api/files/${emB.id}/raw`)).status).toBe(200)
  })

  it('recusa apagar de vez um nó que não está na lixeira', async () => {
    const vivo = await makeNode(app, '__root__', 'folder', 'Vivo')
    expect((await http.del(`/api/trash/${vivo}`)).status).toBe(404)
  })
})

describe('export', () => {
  it('monta um zip com a hierarquia, as notas em .md e os arquivos originais', async () => {
    const pasta = await makeNode(app, '__root__', 'folder', 'Projeto')
    const sub = await makeNode(app, pasta, 'folder', 'Sub')
    const nota = await makeNode(app, sub, 'note', 'Ata')
    await http.raw(`/api/notes/${nota}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ markdown: 'conteudo' }),
    })
    await uploadFile(app, pasta, 'anexo.bin', new Uint8Array([1, 2, 3]))

    const res = await http.raw(`/api/export/${pasta}`)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('application/zip')

    const entradas = await lerZip(Buffer.from(await res.arrayBuffer()))
    expect([...entradas.keys()].sort()).toEqual(['Projeto/Sub/Ata.md', 'Projeto/anexo.bin'])
    expect(entradas.get('Projeto/Sub/Ata.md')).toBe('conteudo')
    expect(Buffer.from(entradas.get('Projeto/anexo.bin')!, 'utf8').length).toBeGreaterThan(0)
  })

  it('404 para nó inexistente', async () => {
    expect((await http.raw('/api/export/nao-existe')).status).toBe(404)
  })
})

describe('canvases', () => {
  it('guarda e devolve o snapshot, e recusa canvas inexistente', async () => {
    const pasta = await makeNode(app, '__root__', 'folder', 'Com canvas')
    expect((await http.get(`/api/canvases/${pasta}`)).body.snapshot).toBeNull()

    await http.raw(`/api/canvases/${pasta}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ snapshot: { store: {}, schema: { schemaVersion: 2 } } }),
    })
    expect((await http.get(`/api/canvases/${pasta}`)).body.snapshot).toMatchObject({
      schema: { schemaVersion: 2 },
    })

    expect((await http.get('/api/canvases/nao-existe')).status).toBe(404)
  })
})

describe('migrations', () => {
  it('deixa o schema completo no banco novo', () => {
    const nomes = readFileSync('server/migrations/001_init.sql', 'utf8')
    for (const tabela of ['nodes', 'notes', 'blobs', 'files', 'canvases', 'node_fts']) {
      expect(nomes).toContain(tabela)
    }
  })
})
