import { Hono } from 'hono'
import './db.ts'
import { canvases } from './routes/canvases.ts'
import { exportRoutes } from './routes/export.ts'
import { files } from './routes/files.ts'
import { nodes } from './routes/nodes.ts'
import { notes } from './routes/notes.ts'
import { search } from './routes/search.ts'
import { trash } from './routes/trash.ts'
import { tree } from './routes/tree.ts'

/**
 * Só as rotas, sem abrir socket — é isto que os testes exercitam com
 * `app.request()`, o que evita porta, espera e servidor órfão.
 */
export function createApp(): Hono {
  const app = new Hono()

  app.route('/api/canvases', canvases)
  app.route('/api/export', exportRoutes)
  app.route('/api/files', files)
  app.route('/api/nodes', nodes)
  app.route('/api/notes', notes)
  app.route('/api/tree', tree)
  app.route('/api/search', search)
  app.route('/api/trash', trash)
  app.get('/api/health', (c) => c.json({ ok: true }))

  return app
}
