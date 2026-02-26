import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
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

