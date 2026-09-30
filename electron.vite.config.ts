import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: { '@core': resolve('src/core') }
    },
    build: {
      lib: { entry: resolve('src/main/index.ts') }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      lib: { entry: resolve('src/preload/index.ts') }
    }
  },
  renderer: {
    root: resolve('src/renderer'),
    resolve: {
      alias: { '@core': resolve('src/core') }
    },
    plugins: [react()],
    build: {
      rollupOptions: {
        input: {
          index: resolve('src/renderer/index.html'),
          // Isolated script host page, loaded by src/main/scriptHost.ts.
          'script-host': resolve('src/renderer/script-host.html')
        }
      }
    }
  }
})
