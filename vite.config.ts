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
  server: {
    // Proxy API requests to the Flask backend during development
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        secure: false,
      },
      // Some endpoints are not under /api (if any), add them explicitly here
      '/get_report_data': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        secure: false,
      },
      // Forward zone management and direct media endpoints to Flask during dev
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
