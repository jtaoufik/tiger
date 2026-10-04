/**
 * The single registry of user-facing actions.
 *
 * Every place that names an action (native menu, command palette, shortcuts
 * overlay, context menus, tooltips) reads its label, one-line description and
 * shortcut from here, so the same action can never be called two different
 * things in two places. Pure data: imported by both the main process
 * (src/main/menu.ts) and the renderer.
 *
 * Labels and descriptions live in the i18n catalogs under
 * `actions.<id>.label` and `actions.<id>.description`; every helper that
 * returns text takes the caller's translator.
 */

import type { MessageKey, Translator } from './i18n'

export type ActionGroup = 'file' | 'request' | 'view' | 'tabs' | 'help'

/** A keyboard shortcut, platform-neutral. `mod` is Cmd on macOS, Ctrl elsewhere. */
export interface Shortcut {
  mod?: boolean
  shift?: boolean
  /** Literal Ctrl on every platform (Ctrl+Tab), not the platform modifier. */
  ctrl?: boolean
  /** The key as shown to the user: 'K', 'Enter', '/', ',', 'F2', '1-9'. */
  key: string
}

export interface ActionDef {
  /** Also names its text: actions.<id>.label (sentence case, no trailing
   * ellipsis, menus add "…" when `opensDialog`) and actions.<id>.description
   * (one line, plain words: what happens when you pick it). */
  id: string
  group: ActionGroup
  shortcut?: Shortcut
  /** True when the renderer's own keydown listener owns the shortcut, so the
   * native menu shows it without registering it (no double trigger). */
  rendererKey?: boolean
  /** The action asks for more input first (dialog, prompt, file picker). */
  opensDialog?: boolean
  /** Hidden from the command palette (tab navigation, native-only roles). */
  paletteHidden?: boolean
  /** Website docs page slug under /tiger/docs/, when one explains it. */
  docs?: DocsPage
  /** Extra words the palette should match (synonyms from other tools). */
  keywords?: string
}

/** Docs pages that exist in website/docs. A test checks each one is real. */
export const DOCS_PAGES = [
  'getting-started',
  'first-request',
  'collections',
  'environments',
  'variables',
  'requests-auth',
  'response',
  'scripts',
  'runner',
  'importing',
  'mcp',
  'git'
] as const
export type DocsPage = (typeof DOCS_PAGES)[number]

export const DOCS_BASE = 'https://jtaoufik.github.io/tiger/docs/'
export const REPO_URL = 'https://github.com/jtaoufik/tiger'

export function docsUrl(page: DocsPage): string {
  return `${DOCS_BASE}${page}/`
}

export const ACTIONS = [
  // File: create, open, bring in, send out.
  {
    id: 'new-request',
    group: 'file',
    shortcut: { mod: true, key: 'T' },
    rendererKey: true,
    docs: 'first-request'
  },
  {
    id: 'new-websocket',
    group: 'file',
    docs: 'first-request',
    keywords: 'ws wss socket realtime live postman insomnia'
  },
  {
    id: 'new-sse',
    group: 'file',
    docs: 'first-request',
    keywords: 'sse eventsource event stream server-sent realtime live'
  },
  {
    id: 'new-folder',
    group: 'file',
    opensDialog: true,
    docs: 'collections'
  },
  {
    id: 'new-collection',
    group: 'file',
    shortcut: { mod: true, key: 'N' },
    opensDialog: true,
    docs: 'collections'
  },
  {
    id: 'new-environment',
    group: 'file',
    opensDialog: true,
    docs: 'environments'
  },
  {
    id: 'open-collection',
    group: 'file',
    shortcut: { mod: true, key: 'O' },
    opensDialog: true,
    docs: 'collections'
  },
  // Team sync (git). Plain words; the git term is in the description.
  {
    id: 'join-team',
    group: 'file',
    opensDialog: true,
    docs: 'git',
    keywords: 'git clone repository team github gitlab'
  },
  {
    id: 'team-sync',
    group: 'file',
    opensDialog: true,
    docs: 'git',
    keywords: 'git status diff history branch changes'
  },
  {
    id: 'sync',
    group: 'file',
    docs: 'git',
    keywords: 'git pull push fetch upload download'
  },
  {
    id: 'save-version',
    group: 'file',
    opensDialog: true,
    docs: 'git',
    keywords: 'git commit snapshot'
  },
  {
    id: 'share-collection',
    group: 'file',
    opensDialog: true,
    docs: 'git',
    keywords: 'git init remote publish repository'
  },
  {
    id: 'import',
    group: 'file',
    opensDialog: true,
    docs: 'importing',
    keywords: 'postman insomnia bruno openapi swagger curl wsdl'
  },
  {
    id: 'export',
    group: 'file',
    opensDialog: true,
    docs: 'importing',
    keywords: 'postman openapi swagger curl'
  },
  {
    id: 'settings',
    group: 'file',
    shortcut: { mod: true, key: ',' },
    keywords: 'preferences options proxy ssl'
  },
  {
    id: 'close-tab',
    group: 'tabs',
    shortcut: { mod: true, key: 'W' }
  },

  // Request: act on the open request.
  {
    id: 'send',
    group: 'request',
    shortcut: { mod: true, key: 'Enter' },
    rendererKey: true,
    docs: 'first-request'
  },
  {
    id: 'connect',
    group: 'request',
    shortcut: { mod: true, shift: true, key: 'Enter' },
    rendererKey: true,
    docs: 'first-request',
    keywords: 'websocket ws sse open close disconnect live'
  },
  {
    id: 'clear-timeline',
    group: 'request',
    keywords: 'websocket sse messages log reset'
  },
  {
    id: 'save',
    group: 'request',
    shortcut: { mod: true, key: 'S' },
    rendererKey: true
  },
  {
    id: 'duplicate-request',
    group: 'request'
  },
  {
    id: 'copy-curl',
    group: 'request',
    keywords: 'curl command clipboard'
  },
  {
    id: 'load-test',
    group: 'request',
    docs: 'runner',
    keywords: 'performance perf benchmark concurrency'
  },
  {
    id: 'run-collection',
    group: 'request',
    opensDialog: true,
    docs: 'runner',
    keywords: 'runner tests'
  },
  {
    id: 'focus-url',
    group: 'request',
    shortcut: { mod: true, key: 'L' },
    rendererKey: true
  },
  {
    id: 'search-response',
    group: 'request',
    shortcut: { mod: true, key: 'F' },
    rendererKey: true,
    paletteHidden: true,
    docs: 'response'
  },
  {
    id: 'rename',
    group: 'request',
    shortcut: { key: 'F2' },
    rendererKey: true,
    paletteHidden: true
  },

  // View: where you look.
  {
    id: 'command-palette',
    group: 'view',
    shortcut: { mod: true, key: 'K' },
    rendererKey: true,
    keywords: 'search find go to jump'
  },
  {
    id: 'environments',
    group: 'view',
    opensDialog: true,
    docs: 'environments',
    keywords: 'variables env'
  },
  {
    id: 'history',
    group: 'view'
  },
  {
    id: 'toggle-sidebar',
    group: 'view',
    shortcut: { mod: true, key: 'B' },
    rendererKey: true
  },
  {
    id: 'theme-system',
    group: 'view',
    keywords: 'appearance dark light mode'
  },
  {
    id: 'theme-light',
    group: 'view',
    keywords: 'appearance mode'
  },
  {
    id: 'theme-dark',
    group: 'view',
    keywords: 'appearance mode'
  },
  {
    id: 'zoom-in',
    group: 'view',
    shortcut: { mod: true, key: '=' },
    paletteHidden: true
  },
  {
    id: 'zoom-out',
    group: 'view',
    shortcut: { mod: true, key: '-' },
    paletteHidden: true
  },
  {
    id: 'zoom-reset',
    group: 'view',
    shortcut: { mod: true, key: '0' },
    paletteHidden: true
  },

  // Tabs: keyboard navigation between open tabs.
  {
    id: 'next-tab',
    group: 'tabs',
    shortcut: { ctrl: true, key: 'Tab' },
    rendererKey: true,
    paletteHidden: true
  },
  {
    id: 'previous-tab',
    group: 'tabs',
    shortcut: { ctrl: true, shift: true, key: 'Tab' },
    rendererKey: true,
    paletteHidden: true
  },
  {
    id: 'jump-tab',
    group: 'tabs',
    shortcut: { mod: true, key: '1-9' },
    rendererKey: true,
    paletteHidden: true
  },

  // Help.
  {
    id: 'getting-started',
    group: 'help',
    docs: 'getting-started',
    keywords: 'home welcome'
  },
  {
    id: 'shortcuts',
    group: 'help',
    shortcut: { mod: true, key: '/' },
    rendererKey: true
  },
  {
    id: 'docs',
    group: 'help',
    keywords: 'help guide manual'
  },
  {
    id: 'report-issue',
    group: 'help',
    keywords: 'bug feedback'
  },
  {
    id: 'check-update',
    group: 'help',
    opensDialog: true
  },
  {
    id: 'about',
    group: 'help',
    paletteHidden: true
  }
] as const satisfies readonly ActionDef[]

export type ActionId = (typeof ACTIONS)[number]['id']

const BY_ID: ReadonlyMap<string, ActionDef> = new Map(ACTIONS.map((a) => [a.id, a as ActionDef]))

export function getAction(id: ActionId): ActionDef {
  return BY_ID.get(id)!
}

type ActionLabelKey = `actions.${ActionId}.label`
type ActionDescriptionKey = `actions.${ActionId}.description`
// Compile-time check: every registry action has its label and description in
// the English catalog. A new action without text fails the typecheck here.
const _actionKeysExist: [ActionLabelKey, ActionDescriptionKey] extends [MessageKey, MessageKey] ? true : never =
  true
void _actionKeysExist

export function actionLabelKey(id: ActionId): MessageKey {
  return `actions.${id}.label` as ActionLabelKey
}

export function actionDescriptionKey(id: ActionId): MessageKey {
  return `actions.${id}.description` as ActionDescriptionKey
}

/** The action's name in the translator's language. */
export function actionLabel(id: ActionId, t: Translator): string {
  return t(actionLabelKey(id))
}

/** One line, plain words: what happens when you pick it. */
export function actionDescription(id: ActionId, t: Translator): string {
  return t(actionDescriptionKey(id))
}

/** Label as a menu shows it: "…" when the action asks for more input first. */
export function menuLabel(id: ActionId, t: Translator): string {
  const label = actionLabel(id, t)
  return getAction(id).opensDialog ? `${label}…` : label
}

/** Electron accelerator string, or undefined when the shortcut has none. */
export function accelerator(id: ActionId): string | undefined {
  const s = getAction(id).shortcut
  if (!s || s.key === '1-9') return undefined
  const parts: string[] = []
  if (s.ctrl) parts.push('Ctrl')
  if (s.mod) parts.push('CmdOrCtrl')
  if (s.shift) parts.push('Shift')
  parts.push(s.key === 'Enter' ? 'Return' : s.key)
  return parts.join('+')
}

/** Keys for display, e.g. ['Cmd', 'K']. `mod` is the platform modifier label. */
export function shortcutKeys(id: ActionId, mod: string): string[] {
  const s = getAction(id).shortcut
  if (!s) return []
  const keys: string[] = []
  if (s.ctrl) keys.push('Ctrl')
  if (s.mod) keys.push(mod)
  if (s.shift) keys.push('Shift')
  keys.push(s.key)
  return keys
}

/** "New request (Cmd+T)": the tooltip form of an action. */
export function tooltip(id: ActionId, mod: string, t: Translator): string {
  const keys = shortcutKeys(id, mod)
  const label = actionLabel(id, t)
  return keys.length ? `${label} (${keys.join('+')})` : label
}

/** Actions the command palette may offer. */
export function paletteActions(): ActionDef[] {
  return (ACTIONS as readonly ActionDef[]).filter((a) => !a.paletteHidden)
}

/**
 * Rank palette actions against a query. Every word must appear in the label,
 * description or keywords; label hits rank first. The English label and
 * description are searched too, so "send" still finds Envoyer in French and
 * people can type the command names they know from the docs.
 */
export function matchActions(query: string, t: Translator, limit = 8): ActionDef[] {
  const words = query.toLocaleLowerCase(t.locale).split(/\s+/).filter(Boolean)
  const all = paletteActions()
  if (!words.length) return all.slice(0, limit)
  const scored: Array<{ a: ActionDef; score: number }> = []
  for (const a of all) {
    const id = a.id as ActionId
    const label = actionLabel(id, t).toLocaleLowerCase(t.locale)
    const englishLabel = t.source(actionLabelKey(id)).toLowerCase()
    const hay = [
      label,
      actionDescription(id, t).toLocaleLowerCase(t.locale),
      t.locale === 'en' ? '' : `${englishLabel} ${t.source(actionDescriptionKey(id)).toLowerCase()}`,
      a.keywords ?? ''
    ].join(' ')
    if (!words.every((w) => hay.includes(w))) continue
    let score = 0
    for (const w of words) {
      if (label.startsWith(w) || englishLabel.startsWith(w)) score += 3
      else if (label.includes(w) || englishLabel.includes(w)) score += 2
      else score += 1
    }
    scored.push({ a, score })
  }
  scored.sort((x, y) => y.score - x.score)
  return scored.slice(0, limit).map((s) => s.a)
}

/** Headings of the shortcuts overlay, in display order. */
export const SHORTCUT_GROUPS: Array<{ titleKey: MessageKey; ids: ActionId[] }> = [
  {
    titleKey: 'actions.group.general',
    ids: ['command-palette', 'new-collection', 'open-collection', 'settings', 'toggle-sidebar', 'shortcuts']
  },
  {
    titleKey: 'actions.group.request',
    ids: ['send', 'connect', 'save', 'new-request', 'focus-url', 'search-response', 'rename']
  },
  {
    titleKey: 'actions.group.tabs',
    ids: ['close-tab', 'next-tab', 'previous-tab', 'jump-tab']
  },
  { titleKey: 'actions.group.zoom', ids: ['zoom-in', 'zoom-out', 'zoom-reset'] }
]

/**
 * Request editor sections, in display order (most used first). Text lives in
 * the catalogs: actions.section.<id>.label / .description.
 */
export const REQUEST_SECTIONS = [
  { id: 'params' },
  { id: 'body' },
  { id: 'headers' },
  { id: 'auth', docs: 'requests-auth' },
  { id: 'capture', docs: 'scripts' },
  { id: 'scripts', docs: 'scripts' },
  { id: 'docs' },
  { id: 'code' },
  { id: 'perf', docs: 'runner' }
] as const satisfies ReadonlyArray<{ id: string; docs?: DocsPage }>

export type RequestSectionId = (typeof REQUEST_SECTIONS)[number]['id']

type SectionLabelKey = `actions.section.${RequestSectionId}.label`
type SectionDescriptionKey = `actions.section.${RequestSectionId}.description`
const _sectionKeysExist: [SectionLabelKey, SectionDescriptionKey] extends [MessageKey, MessageKey]
  ? true
  : never = true
void _sectionKeysExist

export function sectionLabel(id: RequestSectionId, t: Translator): string {
  return t(`actions.section.${id}.label` as SectionLabelKey)
}

export function sectionDescription(id: RequestSectionId, t: Translator): string {
  return t(`actions.section.${id}.description` as SectionDescriptionKey)
}
