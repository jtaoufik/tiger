/**
 * Lossless JSON tokenizer for syntax highlighting. Splits text into typed
 * tokens whose concatenation reproduces the input exactly, so the renderer can
 * wrap each in a styled span without altering the body.
 */

export interface JsonToken {
  text: string
  type: 'key' | 'string' | 'number' | 'literal' | 'punct' | 'plain'
}

const TOKEN =
  /("(?:[^"\\]|\\.)*")(\s*:)?|(\btrue\b|\bfalse\b|\bnull\b)|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|([{}[\],:])/g

export function tokenizeJson(text: string): JsonToken[] {
  const tokens: JsonToken[] = []
  let last = 0

  for (const match of text.matchAll(TOKEN)) {
    const index = match.index ?? 0
    if (index > last) tokens.push({ text: text.slice(last, index), type: 'plain' })

    const [, str, colonAfter, literal, number, punct] = match
    if (str !== undefined) {
      tokens.push({ text: str, type: colonAfter !== undefined ? 'key' : 'string' })
      if (colonAfter !== undefined) tokens.push({ text: colonAfter, type: 'punct' })
    } else if (literal !== undefined) {
      tokens.push({ text: literal, type: 'literal' })
    } else if (number !== undefined) {
      tokens.push({ text: number, type: 'number' })
    } else if (punct !== undefined) {
      tokens.push({ text: punct, type: 'punct' })
    }
    last = index + match[0].length
  }

  if (last < text.length) tokens.push({ text: text.slice(last), type: 'plain' })
  return tokens
}

export function formatJsonText(text: string): { ok: boolean; formatted?: string } {
  if (!text.trim()) return { ok: false }
  try {
    return { ok: true, formatted: JSON.stringify(JSON.parse(text), null, 2) }
  } catch {
    return { ok: false }
  }
}

/** Collapse valid JSON onto a single line with no insignificant whitespace. */
export function minifyJsonText(text: string): { ok: boolean; formatted?: string } {
  if (!text.trim()) return { ok: false }
  try {
    return { ok: true, formatted: JSON.stringify(JSON.parse(text)) }
  } catch {
    return { ok: false }
  }
}

/** Cheap validity check (parse only, no re-stringify) for the editor badge. */
export function isValidJson(text: string): boolean {
  if (!text.trim()) return false
  try {
    JSON.parse(text)
    return true
  } catch {
    return false
  }
}
