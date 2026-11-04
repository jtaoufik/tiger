import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { visualizer } from 'rollup-plugin-visualizer'

// `npm run analyze` (or ANALYZE=1 electron-vite build) writes
// out/renderer-stats.{html,json}, a treemap plus raw per-module sizes, so
// bundle changes can be measured instead of guessed.
const analyze = process.env.ANALYZE === '1' || process.env.npm_lifecycle_event === 'analyze'

export default defineConfig({
  // Dependencies of the main and preload bundles are externalized by default
  // (build.externalizeDeps: true), which is what externalizeDepsPlugin() did
  // before electron-vite 5 deprecated it.
  main: {
    resolve: {
      alias: { '@core': resolve('src/core') }
    },
    build: {
      lib: { entry: resolve('src/main/index.ts') },
      rolldownOptions: {
        output: {
          // The UI text catalogs get their own chunk. electron-vite used to
          // inject its CommonJS shim after the last thing that looked like an
          // ESM import, found with a regex over the whole chunk: a message such
          // as "Drop to import" followed by a quote read as one, and the shim
          // then landed inside a string. electron-vite 6 parses the chunk
          // instead, but a chunk without __dirname/require is never shimmed,
          // so the catalogs stay in their own chunk as before.
          codeSplitting: {
            groups: [{ name: 'i18n-messages', test: /[\\/]src[\\/]core[\\/]i18n[\\/]messages[\\/]/ }]
          }
        }
      }
    }
  },
  preload: {
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
      // electron-vite leaves the renderer unminified by default; the startup
      // chunk is parsed and compiled on every launch, so ship it minified
      // (Vite 8's default minifier is Oxc; 'esbuild' is deprecated there).
      minify: true,
      rolldownOptions: {
        input: {
          index: resolve('src/renderer/index.html'),
          // Isolated script host page, loaded by src/main/scriptHost.ts.
          'script-host': resolve('src/renderer/script-host.html')
        }
      }
    }
  }
})
