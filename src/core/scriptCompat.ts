/**
 * Static check of imported scripts against the compatibility shims in
 * `script.ts`. Importers keep every script as-is and use this to tell the user
 * which calls will not work in Tiger, so nothing fails silently.
 */

interface Rule {
  pattern: RegExp
  label: string
}

const RULES: Rule[] = [
  { pattern: /\b(?:pm|insomnia)\.sendRequest\s*\(/, label: 'pm.sendRequest (sending another request)' },
  { pattern: /\b(?:pm|insomnia)\.cookies\b/, label: 'pm.cookies' },
  { pattern: /\b(?:pm|insomnia)\.vault\b/, label: 'pm.vault' },
  { pattern: /\b(?:pm|insomnia)\.require\s*\(/, label: 'pm.require (package library)' },
  { pattern: /\b(?:pm|insomnia)\.visualizer\b/, label: 'pm.visualizer (skipped when run)' },
  { pattern: /\b(?:pm|insomnia)\.iterationData\b/, label: 'pm.iterationData (data files are not supported)' },
  { pattern: /\b(?:pm|insomnia)\.execution\b/, label: 'pm.execution (flow control is skipped)' },
  { pattern: /\bpostman\.setNextRequest\s*\(/, label: 'postman.setNextRequest (flow control is skipped)' },
  { pattern: /\bpm\.response\.to\.have\.jsonSchema\b|\btv4\b/, label: 'JSON schema validation' },
  { pattern: /\bpm\.response\.(?:cookies|size|responseSize)\b/, label: 'pm.response cookies or size' },
  { pattern: /\bpm\.request\.(?:url\.(?:update|addQueryParams|query)|body\.update|auth)\b/, label: 'changing the request URL, body or auth from a script' },
  { pattern: /\brequire\s*\(/, label: 'require() of a library (lodash, moment, crypto-js, ...)' },
  { pattern: /\bCryptoJS\b/, label: 'CryptoJS' },
  { pattern: /\bxml2Json\s*\(/, label: 'xml2Json' },
  { pattern: /\bcheerio\b/, label: 'cheerio' },
  { pattern: /(?<![\w$.])_\.\w+\s*\(/, label: 'lodash (_)' },
  { pattern: /\bmoment\s*\(/, label: 'moment' },
  { pattern: /\bbru\.(?:runRequest|sendRequest|sleep|cookies|runner)\b/, label: 'bru.runRequest / sendRequest / sleep / cookies' },
  { pattern: /\bawait\b|\.then\s*\(/, label: 'asynchronous code (await / .then)' },
  { pattern: /\bsetTimeout\s*\(/, label: 'setTimeout' }
]

/** Plain-language labels of the unsupported calls a script makes. */
export function findUnsupportedScriptApis(source: string | undefined): string[] {
  if (!source?.trim()) return []
  // Ignore comments so a commented-out call is not reported.
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
  return RULES.filter((r) => r.pattern.test(code)).map((r) => r.label)
}
