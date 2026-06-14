import { dialog } from 'electron'
import { readdir, readFile } from 'node:fs/promises'
import { basename, join, relative, sep } from 'node:path'
import { parse as parseYaml } from 'yaml'
import {
  importBrunoRequest,
  importInsomnia,
  importOpenApi,
  importPostman,
  importWsdl,
  type ImportResult
} from '../core/import'

export type ImportKind = 'postman' | 'bruno' | 'openapi' | 'insomnia' | 'wsdl'

async function pickFile(title: string, extensions: string[]): Promise<string | null> {
  const result = await dialog.showOpenDialog({
    title,
    filters: [{ name: title, extensions }],
    properties: ['openFile']
  })
  return result.canceled ? null : (result.filePaths[0] ?? null)
}

async function readStructured(path: string): Promise<unknown> {
  const text = await readFile(path, 'utf8')
  return /\.ya?ml$/i.test(path) ? parseYaml(text) : JSON.parse(text)
}

async function importBrunoFolder(): Promise<ImportResult | null> {
  const result = await dialog.showOpenDialog({
    title: 'Import a Bruno collection folder',
    properties: ['openDirectory']
  })
  if (result.canceled || !result.filePaths[0]) return null
  const root = result.filePaths[0]

  const files: string[] = []
  const collect = async (dir: string): Promise<void> => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name)
      if (entry.isDirectory() && !entry.name.startsWith('.')) await collect(full)
      else if (entry.isFile() && entry.name.endsWith('.bru')) files.push(full)
    }
  }
  await collect(root)

  const requests = await Promise.all(
    files.map(async (file) =>
      importBrunoRequest(await readFile(file, 'utf8'), relative(root, file).split(sep).slice(0, -1))
    )
  )
  return { name: basename(root), source: 'bruno', requests }
}

export async function importFromDisk(kind: ImportKind): Promise<ImportResult | null> {
  if (kind === 'bruno') return importBrunoFolder()

  if (kind === 'postman') {
    const file = await pickFile('Postman collection', ['json'])
    return file ? importPostman(await readStructured(file)) : null
  }
  if (kind === 'insomnia') {
    const file = await pickFile('Insomnia export', ['json', 'yaml', 'yml'])
    return file ? importInsomnia(await readStructured(file)) : null
  }
  if (kind === 'wsdl') {
    const file = await pickFile('WSDL document', ['wsdl', 'xml'])
    return file ? importWsdl(await readFile(file, 'utf8')) : null
  }
  // openapi
  const file = await pickFile('OpenAPI / Swagger document', ['json', 'yaml', 'yml'])
  return file ? importOpenApi(await readStructured(file)) : null
}

/** Save exported content to a user-chosen file. Returns the path, or null. */
export async function saveExport(
  defaultName: string,
  content: string
): Promise<string | null> {
  const result = await dialog.showSaveDialog({ title: 'Export', defaultPath: defaultName })
  if (result.canceled || !result.filePath) return null
  const { writeFile } = await import('node:fs/promises')
  await writeFile(result.filePath, content, 'utf8')
  return result.filePath
}
