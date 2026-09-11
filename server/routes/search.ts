import { Hono } from 'hono'
import { searchNodes } from '../searchIndex.ts'

export const search = new Hono()

search.get('/', (c) => {
  const q = c.req.query('q') ?? ''
  const limit = Math.min(Number(c.req.query('limit') ?? 30) || 30, 100)
  return c.json({ hits: searchNodes(q, limit) })
})
