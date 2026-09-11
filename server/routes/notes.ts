import { Hono } from 'hono'
import { z } from 'zod'
import { db } from '../db.ts'
import { indexNode } from '../searchIndex.ts'

const selectNote = db.prepare<[string], { markdown: string; title: string }>(
  `SELECT nt.markdown, n.title
   FROM notes nt JOIN nodes n ON n.id = nt.node_id
   WHERE nt.node_id = ? AND n.deleted_at IS NULL`,
)
const updateMarkdown = db.prepare('UPDATE notes SET markdown = ? WHERE node_id = ?')
const touchNode = db.prepare('UPDATE nodes SET updated_at = ? WHERE id = ?')

const saveNote = db.transaction((id: string, markdown: string) => {
  updateMarkdown.run(markdown, id)
  touchNode.run(Date.now(), id)
})

/**
 * Resolve `[[Título]]` para um nó. Casa sem diferenciar maiúsculas nem espaços
 * nas pontas; havendo empate, a nota mexida mais recentemente ganha.
 */
const selectByTitle = db.prepare<[string], { id: string; kind: string }>(
  `SELECT id, kind FROM nodes
   WHERE deleted_at IS NULL AND lower(trim(title)) = lower(trim(?))
   ORDER BY CASE kind WHEN 'note' THEN 0 ELSE 1 END, updated_at DESC
   LIMIT 1`,
)

export const notes = new Hono()

notes.get('/by-title', (c) => {
  const title = c.req.query('title') ?? ''
  if (!title.trim()) return c.json({ node: null })
  return c.json({ node: selectByTitle.get(title) ?? null })
})

notes.get('/:id', (c) => {
  const note = selectNote.get(c.req.param('id'))
  if (!note) return c.json({ error: 'nota inexistente' }, 404)
  return c.json(note)
})

const putBody = z.object({ markdown: z.string() })

notes.put('/:id', async (c) => {
  const id = c.req.param('id')
  if (!selectNote.get(id)) return c.json({ error: 'nota inexistente' }, 404)

  const parsed = putBody.safeParse(await c.req.json().catch(() => ({})))
  if (!parsed.success) return c.json({ error: 'corpo inválido' }, 400)

  saveNote(id, parsed.data.markdown)
  indexNode(id)
  return c.json({ ok: true })
})
