import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const locustTarget = env.VITE_LOCUST_URL || 'http://localhost:8089'

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
