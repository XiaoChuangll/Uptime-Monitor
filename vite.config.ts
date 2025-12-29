import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [vue()],
    test: {
      environment: 'jsdom',
    },
    define: {
      'process.env': env
    },
    server: {
      proxy: {
        '/api': {
          target: `http://localhost:${env.PORT || 3001}`,
          changeOrigin: true,
        },
        '/uploads': {
          target: `http://localhost:${env.PORT || 3001}`,
          changeOrigin: true,
        },
        '/ws': {
          target: `http://localhost:${env.PORT || 3001}`,
          ws: true,
          changeOrigin: true,
        }
      }
    }
  }
})
