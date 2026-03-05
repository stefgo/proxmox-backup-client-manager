import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { execSync } from 'child_process'

// Get version from environment or git
const getVersion = () => {
  if (process.env.VITE_APP_VERSION) {
    return process.env.VITE_APP_VERSION;
  }
  try {
    return execSync('git describe --tags --always --dirty').toString().trim()
  } catch (e) {
    return 'unknown'
  }
}

const APP_VERSION = getVersion()

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(APP_VERSION),
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        secure: false,
        ws: true,
        configure: (proxy, options) => {
          proxy.on('error', (err, req, res) => {
            if (err.code === 'EPIPE') {
              // Ignore EPIPE
              return;
            }
            console.log('proxy error', err);
          });
        }
      },
      '/ws': {
        target: 'ws://localhost:3000',
        changeOrigin: true,
        secure: false,
        ws: true,
        configure: (proxy, options) => {
          proxy.on('error', (err, req, res) => {
            if (err.code === 'EPIPE') {
              // Ignore EPIPE
              return;
            }
            console.log('proxy error', err);
          });
        }
      }
    }
  },
  resolve: {
    dedupe: ['react', 'react-dom']
  }
})

