import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['server/**/*.test.ts', 'src/**/*.test.ts'],
    // Cada arquivo abre seu próprio SQLite num diretório temporário; isolar os
    // arquivos em processos evita que compartilhem o módulo `db` já aberto.
    isolate: true,
  },
})
