import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { visualizer } from 'rollup-plugin-visualizer'

// `npm run analyze` (or ANALYZE=1 electron-vite build) writes
// out/renderer-stats.{html,json}, a treemap plus raw per-module sizes, so
// bundle changes can be measured instead of guessed.
const analyze = process.env.ANALYZE === '1' || process.env.npm_lifecycle_event === 'analyze'

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
    plugins: [
      react(),
      ...(analyze
        ? [
            visualizer({ filename: 'out/renderer-stats.html', gzipSize: true, template: 'treemap' }),
            visualizer({ filename: 'out/renderer-stats.json', gzipSize: true, template: 'raw-data' })
          ]
        : [])
    ],
    build: {
      rollupOptions: {
        input: resolve('src/renderer/index.html')
      }
    }
  }
})
