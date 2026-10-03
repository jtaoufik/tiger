import { BrowserWindow, dialog } from 'electron'
import { readdir } from 'node:fs/promises'
import { readTextFile } from './textFile'
import { basename, extname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { parse as parseYaml } from 'yaml'
import { stat } from 'node:fs/promises'
import {
  detectFormat,
  importBrunoCollection,
  importBrunoEnvironment,
  importBrunoRequest,
  isBrunoEnvironment,
  importInsomnia,
  importOpenApi,
  importPostman,
  importWsdl,
  isPostmanV1,
  type BrunoFile,
  type DetectedFormat,
  type ImportResult,
  type ImportSource,
  type ImportWarning
} from '../core/import'
import { safeFileName } from '../core/collectionFiles'
import { expandPaths, mergeImports, rootNameFor, scanDroppedFolder } from './importHelpers'
import { mainT } from './i18n'
import { targetAppWindow } from './windows'

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
  return targetAppWindow()
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
  const text = await readTextFile(path)
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
  const failures = failureWarnings(files, settled)
  if (results.length === 0) {
    if (failures.length === 0) return null
    throw new Error(failures[0].message)
  }
  return withWarnings(combine(results, source, paths), failures)
}

function combine(
  results: { name: string; result: ImportResult }[],
  source: ImportSource,
  paths: string[]
): ImportResult {
  if (results.length === 1) return results[0].result
  return mergeImports(results, source, rootNameFor(paths))
}

function failureWarnings(
  files: string[],
  settled: PromiseSettledResult<unknown>[]
): ImportWarning[] {
  return settled.flatMap((r, i) =>
    r.status === 'rejected'
      ? [
          {
            request: basename(files[i]),
            message: mainT('main.import.failed', {
              reason: r.reason instanceof Error ? r.reason.message : String(r.reason)
            })
          }
        ]
      : []
  )
}

function withWarnings(result: ImportResult, extra: ImportWarning[]): ImportResult {
  if (extra.length === 0) return result
  return { ...result, warnings: [...(result.warnings ?? []), ...extra] }
}

async function importBrunoFolder(): Promise<ImportResult | null> {
  const result = await dialog.showOpenDialog(parentWindow()!, {
    title: mainT('main.import.brunoFolder'),
    properties: ['openDirectory']
  })
  if (result.canceled || !result.filePaths[0]) return null
  return readBrunoFolder(result.filePaths[0])
}

/**
 * Read every `.bru` file (and `bruno.json`) under a Bruno collection folder
 * and hand them to the pure collection importer, which classifies requests,
 * `collection.bru` / `folder.bru` settings and `environments/*.bru`.
 */
export async function readBrunoFolder(root: string): Promise<ImportResult> {
  const files: BrunoFile[] = []
  const collect = async (dir: string): Promise<void> => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        if (!entry.name.startsWith('.') && entry.name !== 'node_modules') await collect(full)
        continue
      }
      if (!entry.isFile()) continue
      const isRootConfig = dir === root && entry.name === 'bruno.json'
      // Bruno reads {{process.env.NAME}} from the root .env file.
      const isRootDotenv = dir === root && entry.name === '.env'
      if (!entry.name.endsWith('.bru') && !isRootConfig && !isRootDotenv) continue
      files.push({ segments: relative(root, full).split(sep), text: await readTextFile(full) })
    }
  }
  await collect(root)
  // Bruno reads a relative @file() path from the collection folder.
  return importBrunoCollection(files, basename(root), (p) => (isAbsolute(p) ? p : resolve(root, p)))
}

async function isBrunoFolder(dir: string): Promise<boolean> {
  const has = async (name: string) => !!(await stat(join(dir, name)).catch(() => null))
  if ((await has('bruno.json')) || (await has('collection.bru'))) return true
  const entries = await readdir(dir).catch(() => [] as string[])
  return entries.some((n) => n.endsWith('.bru'))
}

const DETECTABLE = ['json', 'yaml', 'yml', 'wsdl', 'xml']

/** A Postman file. A v1 collection is refused with how to export it as v2.1. */
function importPostmanFile(doc: unknown): ImportResult {
  if (isPostmanV1(doc)) throw new Error(mainT('imports.postmanV1'))
  return importPostman(doc)
}

/** Import one file by its content; null when it is not an export Tiger knows. */
async function importDetected(file: string): Promise<ImportResult | null> {
  if (file.endsWith('.bru')) {
    const text = await readTextFile(file)
    const name = basename(file, '.bru')
    // An environment file dropped on its own, not a request.
    if (isBrunoEnvironment(text)) {
      return { name, source: 'bruno', requests: [], environments: [importBrunoEnvironment(text, name)] }
    }
    const imported = importBrunoRequest(text)
    return { name: imported.request.name || name, source: 'bruno', requests: [imported] }
  }
  const text = await readTextFile(file)
  const isXml = /\.(wsdl|xml)$/i.test(file)
  const parsed = isXml ? undefined : /\.ya?ml$/i.test(file) ? parseYaml(text) : JSON.parse(text)
  const format: DetectedFormat | null = detectFormat(basename(file), parsed, text)
  if (format === 'postman') return importPostmanFile(parsed)
  if (format === 'insomnia') return importInsomnia(parsed)
  if (format === 'openapi') return importOpenApi(parsed)
  if (format === 'wsdl') return importWsdl(text)
  return null
}

/**
 * Import whatever was dropped on the window: export files of any supported
 * tool, a Bruno collection folder, or a folder of exports. The format is
 * detected per file, so a Postman collection dropped with its environment
 * files lands as one collection with those environments. A dropped project
 * folder works too: a Bruno collection inside it is read whole, and its own
 * files that are not exports (package.json) are skipped without a word.
 */
export async function importPaths(paths: string[]): Promise<ImportResult | null> {
  const results: { name: string; result: ImportResult }[] = []
  const warnings: ImportWarning[] = []
  for (const p of paths) {
    const st = await stat(p).catch(() => null)
    if (!st) continue
    if (st.isDirectory() && (await isBrunoFolder(p))) {
      results.push({ name: basename(p), result: await readBrunoFolder(p) })
      continue
    }
    const inFolder = st.isDirectory()
    const { files, brunoRoots } = inFolder
      ? await scanDroppedFolder(p, [...DETECTABLE, 'bru'])
      : { files: [p], brunoRoots: [] }
    const collections = await Promise.allSettled(brunoRoots.map((root) => readBrunoFolder(root)))
    collections.forEach((r, i) => {
      if (r.status === 'fulfilled') results.push({ name: basename(brunoRoots[i]), result: r.value })
    })
    warnings.push(...failureWarnings(brunoRoots, collections))
    // Outside a collection, collection.bru and folder.bru are settings, not requests.
    const candidates = inFolder ? files.filter((f) => !/^(collection|folder)\.bru$/i.test(basename(f))) : files
    const settled = await Promise.allSettled(
      candidates.map(async (f) => {
        const result = await importDetected(f)
        if (!result && !inFolder) throw new Error('not a Postman, Insomnia, Bruno, OpenAPI or WSDL export')
        return result
      })
    )
    settled.forEach((r, i) => {
      if (r.status === 'fulfilled' && r.value) {
        results.push({ name: basename(candidates[i], extname(candidates[i])), result: r.value })
      }
    })
    warnings.push(...failureWarnings(candidates, settled))
  }
  if (results.length === 0) {
    if (warnings.length === 0) return null
    throw new Error(`${warnings[0].request}: ${warnings[0].message}`)
  }
  const sources = new Set(results.map((r) => r.result.source))
  const source = sources.size === 1 ? results[0].result.source : 'postman'
  return withWarnings(combine(results, source, paths), warnings)
}

export async function importFromDisk(kind: ImportKind): Promise<ImportResult | null> {
  if (kind === 'bruno') return importBrunoFolder()

  if (kind === 'postman') {
    return importManyFiles(mainT('main.import.postman'), ['json'], 'postman', async (f) =>
      importPostmanFile(await readStructured(f))
    )
  }
  if (kind === 'insomnia') {
    return importManyFiles(
      mainT('main.import.insomnia'),
      ['json', 'yaml', 'yml'],
      'insomnia',
      async (f) => importInsomnia(await readStructured(f))
    )
  }
  if (kind === 'wsdl') {
    return importManyFiles(mainT('main.import.wsdl'), ['wsdl', 'xml'], 'wsdl', async (f) =>
      importWsdl(await readTextFile(f))
    )
  }
  return importManyFiles(
    mainT('main.import.openapi'),
    ['json', 'yaml', 'yml'],
    'openapi',
    async (f) => importOpenApi(await readStructured(f))
  )
}

/** The end of an export's file name, kept as is: `.postman_collection.json`, `.openapi.json`, `.tiger`... */
const EXPORT_SUFFIX = /(?:\.(?:postman_collection|postman_environment|openapi))?\.[a-z]+$/i

/** Save exported content to a user-chosen file. Returns the path, or null. */
export async function saveExport(
  defaultName: string,
  content: string
): Promise<string | null> {
  // The name comes from a collection, environment or request name, which can
  // hold what Windows refuses: "a/b?", CON (even as CON.json), a trailing dot.
  const suffix = EXPORT_SUFFIX.exec(defaultName)?.[0] ?? ''
  const safeName = `${safeFileName(defaultName.slice(0, defaultName.length - suffix.length), 'export')}${suffix}`
  const result = await dialog.showSaveDialog(parentWindow()!, {
    title: mainT('main.export.title'),
    defaultPath: safeName
  })
  if (result.canceled || !result.filePath) return null
  const { writeFile } = await import('node:fs/promises')
  await writeFile(result.filePath, content, 'utf8')
  return result.filePath
}
