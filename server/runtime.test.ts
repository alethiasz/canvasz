import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Em produção o servidor roda com `node server/index.ts`: o Node só remove os
 * tipos, sem transpilar. Algumas sintaxes do TypeScript (enum, namespace,
 * `constructor(readonly x)`) passam no tsc e no vitest — que transpilam — mas
 * derrubam o processo nessa hora. Este teste carrega o servidor inteiro do
 * mesmo jeito que o container carrega.
 */
describe('runtime de produção', () => {
  it('o servidor inteiro carrega no Node sem transpilação', () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'canvasz-runtime-'))
    try {
      const saida = execFileSync(
        process.execPath,
        [
          '--input-type=module',
          '-e',
          "const { createApp } = await import('./server/app.ts'); createApp(); console.log('carregou')",
        ],
        {
          encoding: 'utf8',
          env: { ...process.env, CANVASZ_DATA: dataDir, NODE_OPTIONS: '' },
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      )
      expect(saida).toContain('carregou')
    } finally {
      rmSync(dataDir, { recursive: true, force: true })
    }
  })
})
