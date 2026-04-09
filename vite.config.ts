import { defineConfig } from 'vite'
import path from 'path'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import cesium from 'vite-plugin-cesium'
import ViteRails from 'vite-plugin-rails'

export default defineConfig({
  plugins: [
    ViteRails({
      fullReload: {
        additionalPaths: ['config/routes.rb', 'app/views/**/*'],
      },
    }),
    react(),
    cesium(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '~': path.resolve(__dirname, 'app/frontend'),
    },
  },
  optimizeDeps: {
    exclude: ['@tailwindcss/oxide', 'lightningcss', 'fsevents'],
  },
  ssr: {
    noExternal: ['@tailwindcss/vite'],
    external: ['@tailwindcss/oxide', 'lightningcss'],
  },
})
