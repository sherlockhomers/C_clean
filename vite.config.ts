import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return

          if (
            id.includes('react-dom') ||
            id.includes('react-router-dom') ||
            id.includes('react/jsx-runtime') ||
            id.includes('node_modules/react/')
          ) {
            return 'react-vendor'
          }

          if (id.includes('lucide-react')) {
            return 'icons-vendor'
          }

          return
        },
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
