/**
 * Text as Windows tools save it. Notepad and PowerShell 5 write a byte order
 * mark, PowerShell's `>` writes UTF-16, and Git for Windows checks files out
 * with CRLF line endings. Every file Tiger reads goes through here, so none of
 * that changes what a request, an environment or an import means.
 */

/** Decode file bytes: UTF-8 (BOM dropped), or UTF-16 LE/BE when a BOM says so. */
export function decodeText(bytes: Uint8Array): string {
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder('utf-16le').decode(bytes.subarray(2))
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder('utf-16be').decode(bytes.subarray(2))
  }
  // TextDecoder drops a UTF-8 BOM by itself.
  return new TextDecoder('utf-8').decode(bytes)
}

/** One `\n` per line break and no leading BOM, whatever saved the text. */
export function normalizeText(text: string): string {
  return text.replace(/^﻿/, '').replace(/\r\n?/g, '\n')
}
