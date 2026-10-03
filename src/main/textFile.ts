import { readFile } from 'node:fs/promises'
import { decodeText } from '../core/text'

/**
 * Read a text file the way Windows tools may have saved it: UTF-8 with or
 * without a BOM, or UTF-16 (PowerShell's `>`). See core/text.ts.
 */
export async function readTextFile(path: string): Promise<string> {
  return decodeText(await readFile(path))
}
