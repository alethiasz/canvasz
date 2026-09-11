import { rm } from 'node:fs/promises'
import { Hono } from 'hono'
import { blobPath } from '../blobs.ts'
import { db } from '../db.ts'

type TrashRow = {
  id: string
  kind: 'folder' | 'note' | 'file'
  title: string
  deleted_at: number
  descendants: number
}

/**
 * Só os topos de cada subárvore apagada. Apagar "Projeto" joga fora vinte
 * notas, mas a lixeira deve mostrar um item, não vinte.
 */
const selectTrash = db.prepare<[], TrashRow>(`
  SELECT n.id, n.kind, n.title, n.deleted_at,
         (WITH RECURSIVE sub(id) AS (
            SELECT id FROM nodes WHERE parent_id = n.id
            UNION ALL
            SELECT c.id FROM nodes c JOIN sub ON c.parent_id = sub.id
          ) SELECT COUNT(*) FROM sub) AS descendants
  FROM nodes n
  LEFT JOIN nodes p ON p.id = n.parent_id
  WHERE n.deleted_at IS NOT NULL
    AND (n.parent_id IS NULL OR p.deleted_at IS NULL)
  ORDER BY n.deleted_at DESC
`)

const selectSubtreeIds = db.prepare<[string], { id: string }>(`
  WITH RECURSIVE sub(id) AS (
    SELECT id FROM nodes WHERE id = ?
    UNION ALL
    SELECT n.id FROM nodes n JOIN sub ON n.parent_id = sub.id
  )
  SELECT id FROM sub
`)

const selectSubtreeBlobs = db.prepare<[string], { blob_sha: string }>(`
  WITH RECURSIVE sub(id) AS (
    SELECT id FROM nodes WHERE id = ?
    UNION ALL
    SELECT n.id FROM nodes n JOIN sub ON n.parent_id = sub.id
  )
  SELECT f.blob_sha FROM files f WHERE f.node_id IN (SELECT id FROM sub)
`)

const decrementBlob = db.prepare('UPDATE blobs SET refcount = refcount - 1 WHERE sha = ?')
const selectOrphanBlobs = db.prepare<[], { sha: string }>(
  'SELECT sha FROM blobs WHERE refcount <= 0',
)
const deleteOrphanBlobs = db.prepare('DELETE FROM blobs WHERE refcount <= 0')
const deleteNode = db.prepare('DELETE FROM nodes WHERE id = ?')
const deleteFts = db.prepare('DELETE FROM node_fts WHERE node_id = ?')
const deleteCanvas = db.prepare('DELETE FROM canvases WHERE node_id = ?')
const selectDeletedRoot = db.prepare<[string], { id: string }>(
  'SELECT id FROM nodes WHERE id = ? AND deleted_at IS NOT NULL',
)

/**
 * Apaga de vez uma subárvore e devolve os blobs que ficaram sem dono.
 *
 * A ordem destes quatro passos não é arbitrária:
 *  1. anotar os blobs enquanto as linhas de `files` ainda existem;
 *  2. apagar os nós — `ON DELETE CASCADE` leva `notes` e `files` junto;
 *  3. só então baixar o refcount e remover blobs zerados, porque apagar a
 *     linha de `blobs` antes esbarra na chave estrangeira de `files` e
 *     desfaz a transação inteira em silêncio.
 */
const purgeSubtree = db.transaction((rootId: string): string[] => {
  const ids = selectSubtreeIds.all(rootId).map((r) => r.id)
  const shas = selectSubtreeBlobs.all(rootId).map((r) => r.blob_sha)

  for (const id of ids) {
    deleteFts.run(id)
    deleteCanvas.run(id)
  }
  deleteNode.run(rootId)

  for (const sha of shas) decrementBlob.run(sha)
  const orphans = selectOrphanBlobs.all().map((r) => r.sha)
  deleteOrphanBlobs.run()

  return orphans
})

/** O disco é limpo fora da transação: apagar arquivo não dá para desfazer. */
async function removeBlobFiles(shas: string[]): Promise<void> {
  for (const sha of shas) {
    await rm(blobPath(sha), { force: true }).catch((err) =>
      console.warn(`[canvasz] blob órfão ${sha} não pôde ser removido`, err),
    )
  }
}

export const trash = new Hono()

trash.get('/', (c) => c.json({ items: selectTrash.all() }))

trash.delete('/:id', async (c) => {
  const id = c.req.param('id')
  if (!selectDeletedRoot.get(id)) return c.json({ error: 'não está na lixeira' }, 404)

  await removeBlobFiles(purgeSubtree(id))
  return c.json({ ok: true })
})

trash.delete('/', async (c) => {
  const orphans: string[] = []
  for (const item of selectTrash.all()) orphans.push(...purgeSubtree(item.id))
  await removeBlobFiles(orphans)
  return c.json({ ok: true })
})
