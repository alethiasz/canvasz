import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Hono } from 'hono'

/**
 * Prepara um banco descartável e devolve o app já montado.
 *
 * `CANVASZ_DATA` precisa estar no ambiente **antes** de qualquer import de
 * `db.ts`, que abre o arquivo no carregamento do módulo — por isso o import é
 * dinâmico e vem depois de mexer no env.
 */
export async function createTestApp(): Promise<{
  app: Hono
  dataDir: string
  reset: () => void
  cleanup: () => void
}> {
  const dataDir = mkdtempSync(join(tmpdir(), 'canvasz-test-'))
  process.env.CANVASZ_DATA = dataDir

  const { createApp } = await import('./app.ts')
  const { db } = await import('./db.ts')
  const app = createApp()

  const reset = () => {
    db.exec(`
      DELETE FROM node_fts;
      DELETE FROM canvases;
      DELETE FROM files;
      DELETE FROM notes;
      DELETE FROM nodes;
      DELETE FROM blobs;
    `)
  }

  return {
    app,
    dataDir,
    reset,
    cleanup: () => rmSync(dataDir, { recursive: true, force: true }),
  }
}

type Json = Record<string, unknown>

/** Açúcar para as chamadas: devolve status e corpo já em JSON. */
export function api(app: Hono) {
  const call = async (
    method: string,
    path: string,
    body?: unknown,
  ): Promise<{ status: number; body: Json }> => {
    const res = await app.request(path, {
      method,
      ...(body === undefined
        ? {}
        : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
    })
    const text = await res.text()
    let parsed: Json = {}
    try {
      parsed = text ? (JSON.parse(text) as Json) : {}
    } catch {
      parsed = { raw: text }
    }
    return { status: res.status, body: parsed }
  }

  return {
    get: (path: string) => call('GET', path),
    post: (path: string, body?: unknown) => call('POST', path, body ?? {}),
    patch: (path: string, body?: unknown) => call('PATCH', path, body ?? {}),
    del: (path: string) => call('DELETE', path),
    raw: (path: string, init?: RequestInit) => app.request(path, init),
  }
}

/** Cria uma pasta ou nota e devolve o id. */
export async function makeNode(
  app: Hono,
  parent: string,
  kind: 'folder' | 'note',
  title: string,
): Promise<string> {
  const { body } = await api(app).post('/api/nodes', { parent, kind, title })
  return (body.node as { id: string }).id
}

/** Sobe um arquivo com o corpo cru, como o navegador faz. */
export async function uploadFile(
  app: Hono,
  parent: string,
  name: string,
  content: Uint8Array | string,
  type?: string,
): Promise<{ id: string; status: number }> {
  const params = new URLSearchParams({ parent, name })
  if (type) params.set('type', type)
  const res = await app.request(`/api/files/raw?${params.toString()}`, {
    method: 'PUT',
    body: typeof content === 'string' ? content : (content as unknown as BodyInit),
  })
  if (!res.ok) return { id: '', status: res.status }
  const body = (await res.json()) as { node: { id: string } }
  return { id: body.node.id, status: res.status }
}
