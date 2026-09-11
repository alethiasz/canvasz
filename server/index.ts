import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { createApp } from './app.ts'

const app = createApp()

// Em produção o próprio Hono serve o front buildado; em dev quem serve é o Vite.
if (process.env.NODE_ENV === 'production') {
  app.use('/*', serveStatic({ root: './dist' }))
  app.get('/*', serveStatic({ path: './dist/index.html' }))
}

const port = Number(process.env.PORT ?? 8787)
serve({ fetch: app.fetch, port }, (info) => {
  console.log(`[canvasz] api em http://localhost:${info.port}`)
})
