import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolveLocustTarget } from './vite.locust'

// https://vite.dev/config/
export default defineConfig(() => {
  const locustTarget = resolveLocustTarget()

  return {
    plugins: [react()],
    server: {
      proxy: {
        '/locust-api': {
          target: locustTarget,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/locust-api/, ''),
        },
      },
    },
  }
})
