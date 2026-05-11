import { defineConfig } from 'vite'

export default defineConfig({
  optimizeDeps: {
    exclude: ['web-ifc']
  },
  assetsInclude: ['**/*.wasm'],
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin'
    }
  },
  preview: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin'
    }
  }
})
