import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    // Disable warnings for large chunks
    chunkSizeWarningLimit: 2000,
    // Simple rollup config - let Vite handle the splitting automatically
    rollupOptions: {
      output: {
        // Optimize file naming
        entryFileNames: 'js/[name]-[hash].js',
        chunkFileNames: 'js/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
    // Target modern browsers
    target: 'esnext',
    // Use esbuild (faster and simpler)
    minify: 'esbuild',
  },
  server: {
    // Proxy API requests to the Flask backend during development
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        secure: false,
      },
      '/get_report_data': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        secure: false,
      },
      '/get_zones': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        secure: false,
      },
      '/set_zones': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        secure: false,
      },
      '/video_feed': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        secure: false,
      },
      '/snapshot': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        secure: false,
      },
      '/public_video_feed': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        secure: false,
      }
    }
  },
})
