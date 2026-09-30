// @vitest-environment node
/**
 * Guards the startup chunk. Bundles the renderer entry with code splitting
 * (esbuild, in memory, ~1 s) and checks what the entry chunk statically pulls
 * in: the rarely used surfaces, Firebase and the WSDL parser must stay in
 * their own chunks, and the minified entry must stay under a size budget.
 */
import { resolve } from 'node:path'
import { build, type Metafile } from 'esbuild'
import { describe, expect, it } from 'vitest'

const root = resolve(__dirname, '../..')

async function entryChunk(): Promise<{ inputs: string[]; bytes: number }> {
  const result = await build({
    entryPoints: [resolve(root, 'src/renderer/src/main.tsx')],
    bundle: true,
    splitting: true,
    format: 'esm',
    minify: true,
    write: false,
    metafile: true,
    outdir: resolve(root, 'out/bundle-test'),
    jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"production"' },
    alias: { '@core': resolve(root, 'src/core') },
    loader: { '.png': 'file', '.css': 'empty' },
    logLevel: 'silent'
  })
  const meta: Metafile = result.metafile
  const [, entry] = Object.entries(meta.outputs).find(([, o]) => o.entryPoint?.endsWith('main.tsx'))!
  // The entry chunk plus the chunks it imports statically (shared code).
  const seen = new Set<string>()
  const inputs = new Set<string>()
  let bytes = 0
  const visit = (name: string) => {
    if (seen.has(name)) return
    seen.add(name)
    const out = meta.outputs[name]
    bytes += out.bytes
    for (const i of Object.keys(out.inputs)) inputs.add(i)
    for (const imp of out.imports) if (imp.kind === 'import-statement' && !imp.external) visit(imp.path)
  }
  const entryName = Object.keys(meta.outputs).find((k) => meta.outputs[k] === entry)!
  visit(entryName)
  return { inputs: [...inputs], bytes }
}

describe('renderer startup chunk', () => {
  it('keeps rare surfaces, Firebase and the WSDL parser out, and stays under budget', async () => {
    const { inputs, bytes } = await entryChunk()
    const has = (pattern: RegExp) => inputs.some((i) => pattern.test(i))

    // Sanity: the chunk is the app.
    expect(has(/src\/renderer\/src\/App\.tsx$/)).toBe(true)
    expect(has(/components\/Sidebar\.tsx$/)).toBe(true)

    for (const lazy of [
      'SettingsView',
      'RunnerModal',
      'GitModal',
      'ImportExportModal',
      'HistoryModal',
      'ShortcutsModal',
      'EnvironmentsModal',
      'PerfPane',
      'CodePane'
    ]) {
      expect(has(new RegExp(`components/${lazy}\\.tsx$`)), lazy).toBe(false)
    }
    expect(has(/node_modules\/(@firebase|firebase)\//)).toBe(false)
    expect(has(/node_modules\/fast-xml-parser\//)).toBe(false)
    expect(has(/src\/core\/import\/wsdl\.ts$/)).toBe(false)

    if (process.env.TIGER_PERF_REPORT) {
      console.log(`[perf] startup chunk (esbuild, minified): ${(bytes / 1024).toFixed(1)} KB`)
    }
    // ~410 KB today; the single unminified chunk this replaced was 1,248 KB.
    expect(bytes).toBeLessThan(480 * 1024)
  }, 60_000)
})
