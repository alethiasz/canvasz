import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Sobrescrevível para apontar o front a outra instância da API.
    proxy: { '/api': process.env.CANVASZ_API ?? 'http://localhost:8787' },
  },
})
