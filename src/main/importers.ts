import { BrowserWindow, dialog } from 'electron'
import { readdir, readFile } from 'node:fs/promises'
import { basename, extname, join, relative, sep } from 'node:path'
import { parse as parseYaml } from 'yaml'
import {
  importBrunoEnvironment,
  importBrunoRequest,
  importInsomnia,
  importOpenApi,
  importPostman,
  importWsdl,
  type ImportResult,
  type ImportSource
} from '../core/import'
import type { TigerEnvironment } from '../core/types'
import { expandPaths, mergeImports, rootNameFor } from './importHelpers'

export type ImportKind = 'postman' | 'bruno' | 'openapi' | 'insomnia' | 'wsdl'

// Mixing file + directory selection in a single dialog only works on macOS;
// Windows/Linux would silently downgrade to directory-only and break single-
// file imports. Multi-selection is universally supported.
const FILE_PICKER_PROPS: ('openFile' | 'openDirectory' | 'multiSelections')[] =
  process.platform === 'darwin'
    ? ['openFile', 'openDirectory', 'multiSelections']
    : ['openFile', 'multiSelections']

/** Dialogs are parented to the app window so they can't pop up behind it (Windows). */
function parentWindow(): BrowserWindow | undefined {
  return BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
}

async function pickPaths(title: string, extensions: string[]): Promise<string[] | null> {
  const result = await dialog.showOpenDialog(parentWindow()!, {
    title,
    filters: [{ name: title, extensions }],
    properties: FILE_PICKER_PROPS
  })
  return result.canceled || result.filePaths.length === 0 ? null : result.filePaths
}

async function readStructured(path: string): Promise<unknown> {
  const text = await readFile(path, 'utf8')
  return /\.ya?ml$/i.test(path) ? parseYaml(text) : JSON.parse(text)
}

/**
 * Run a file-based importer over the user's selection: a single file, many
 * files, or any mix of files and folders. A single matching file passes
 * through unchanged; multiple results get nested under per-file folders so
 * collections from sibling files don't collapse together.
 */
async function importManyFiles(
  title: string,
  exts: string[],
  source: ImportSource,
  parseFile: (path: string) => Promise<ImportResult>
): Promise<ImportResult | null> {
  const paths = await pickPaths(title, exts)
  if (!paths) return null
  const files = await expandPaths(paths, exts)
  if (files.length === 0) return null

  const settled = await Promise.allSettled(
    files.map(async (file) => ({
      name: basename(file, extname(file)),
      result: await parseFile(file)
    }))
  )
  const results = settled.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []))
  if (results.length === 0) return null
  if (results.length === 1) return { ...results[0].result, source }
  return mergeImports(results, source, rootNameFor(paths))
}

async function importBrunoFolder(): Promise<ImportResult | null> {
  const result = await dialog.showOpenDialog(parentWindow()!, {
    title: 'Import a Bruno collection folder',
    properties: ['openDirectory']
  })
  if (result.canceled || !result.filePaths[0]) return null
  const root = result.filePaths[0]

  // Bruno mixes three kinds of `.bru` files in one tree:
  //   * request files        — anywhere, at any nesting depth
  //   * collection.bru / folder.bru — metadata for the containing folder
  //   * environments/<n>.bru — variable sets, by convention at root only
  // The walker picks up everything; classification happens per-file below so
  // that nested `environments/` (rare but valid) also resolves correctly.
  const requestFiles: { full: string; folder: string[] }[] = []
  const envFiles: string[] = []
  const collect = async (dir: string): Promise<void> => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name)
      if (entry.isDirectory() && !entry.name.startsWith('.')) {
        await collect(full)
        continue
      }
      if (!entry.isFile() || !entry.name.endsWith('.bru')) continue
      const segments = relative(root, full).split(sep)
      const folder = segments.slice(0, -1)
      if (folder.includes('environments')) envFiles.push(full)
      else if (entry.name !== 'collection.bru' && entry.name !== 'folder.bru') {
        requestFiles.push({ full, folder })
      }
    }
  }
  await collect(root)

  // Parse per-file so a single malformed `.bru` does not abort the whole
  // import. With the line-based Bruno tokenizer real-world failures are rare,
  // but we still isolate them defensively.
  const reqSettled = await Promise.allSettled(
    requestFiles.map(async ({ full, folder }) =>
      importBrunoRequest(await readFile(full, 'utf8'), folder)
    )
  )
  const requests = reqSettled.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []))

  const envSettled = await Promise.allSettled(
    envFiles.map(async (file) =>
      importBrunoEnvironment(await readFile(file, 'utf8'), basename(file, '.bru'))
    )
  )
  const environments: TigerEnvironment[] = envSettled.flatMap((r) =>
    r.status === 'fulfilled' ? [r.value] : []
  )

  return { name: basename(root), source: 'bruno', requests, environments }
}

export async function importFromDisk(kind: ImportKind): Promise<ImportResult | null> {
  if (kind === 'bruno') return importBrunoFolder()

  if (kind === 'postman') {
    return importManyFiles('Postman collection', ['json'], 'postman', async (f) =>
      importPostman(await readStructured(f))
    )
  }
  if (kind === 'insomnia') {
    return importManyFiles(
      'Insomnia export',
      ['json', 'yaml', 'yml'],
      'insomnia',
      async (f) => importInsomnia(await readStructured(f))
    )
  }
  if (kind === 'wsdl') {
    return importManyFiles('WSDL document', ['wsdl', 'xml'], 'wsdl', async (f) =>
      importWsdl(await readFile(f, 'utf8'))
    )
  }
  return importManyFiles(
    'OpenAPI / Swagger document',
    ['json', 'yaml', 'yml'],
    'openapi',
    async (f) => importOpenApi(await readStructured(f))
  )
}

/** Save exported content to a user-chosen file. Returns the path, or null. */
export async function saveExport(
  defaultName: string,
  content: string
): Promise<string | null> {
  // Request names can contain characters Windows filenames forbid.
  const safeName = defaultName.replace(/[\\/:*?"<>|]/g, '-')
  const result = await dialog.showSaveDialog(parentWindow()!, {
    title: 'Export',
    defaultPath: safeName
  })
  if (result.canceled || !result.filePath) return null
  const { writeFile } = await import('node:fs/promises')
  await writeFile(result.filePath, content, 'utf8')
  return result.filePath
}
