/**
 * The single registry of user-facing actions.
 *
 * Every place that names an action (native menu, command palette, shortcuts
 * overlay, context menus, tooltips) reads its label, one-line description and
 * shortcut from here, so the same action can never be called two different
 * things in two places. Pure data: imported by both the main process
 * (src/main/menu.ts) and the renderer.
 */

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
  id: string
  /** Sentence case, no trailing ellipsis. Menus add "…" when `opensDialog`. */
  label: string
  /** One line, plain words: what happens when you pick it. */
  description: string
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
    label: 'New request',
    description: 'Add a request to the collection you are working in',
    group: 'file',
    shortcut: { mod: true, key: 'T' },
    rendererKey: true,
    docs: 'first-request'
  },
  {
    id: 'new-folder',
    label: 'New folder',
    description: 'Group related requests in a folder of the current collection',
    group: 'file',
    opensDialog: true,
    docs: 'collections'
  },
  {
    id: 'new-collection',
    label: 'New collection',
    description: 'Create an empty collection folder on your machine',
    group: 'file',
    shortcut: { mod: true, key: 'N' },
    opensDialog: true,
    docs: 'collections'
  },
  {
    id: 'new-environment',
    label: 'New environment',
    description: 'Add a named set of variables, like dev, staging or prod',
    group: 'file',
    opensDialog: true,
    docs: 'environments'
  },
  {
    id: 'open-collection',
    label: 'Open collection',
    description: 'Open a folder of .tiger files from disk',
    group: 'file',
    shortcut: { mod: true, key: 'O' },
    opensDialog: true,
    docs: 'collections'
  },
  // Team sync (git). Plain words; the git term is in the description.
  {
    id: 'join-team',
    label: 'Join a team collection',
    description: 'Get a collection your team shares in a git repository (git clone)',
    group: 'file',
    opensDialog: true,
    docs: 'git',
    keywords: 'git clone repository team github gitlab'
  },
  {
    id: 'team-sync',
    label: 'Team sync',
    description: 'See your changes, the history and the team status of this collection',
    group: 'file',
    opensDialog: true,
    docs: 'git',
    keywords: 'git status diff history branch changes'
  },
  {
    id: 'sync',
    label: 'Sync with team',
    description: "Get your team's changes, then share yours (git pull and push)",
    group: 'file',
    docs: 'git',
    keywords: 'git pull push fetch upload download'
  },
  {
    id: 'save-version',
    label: 'Save a version',
    description: 'Keep a version of this collection on your computer without sharing it (git commit)',
    group: 'file',
    opensDialog: true,
    docs: 'git',
    keywords: 'git commit snapshot'
  },
  {
    id: 'share-collection',
    label: 'Share with your team',
    description: 'Turn on version tracking and connect a shared repository (git init and remote)',
    group: 'file',
    opensDialog: true,
    docs: 'git',
    keywords: 'git init remote publish repository'
  },
  {
    id: 'import',
    label: 'Import',
    description: 'Bring in Postman, Insomnia, Bruno, OpenAPI, WSDL or a curl command',
    group: 'file',
    opensDialog: true,
    docs: 'importing',
    keywords: 'postman insomnia bruno openapi swagger curl wsdl'
  },
  {
    id: 'export',
    label: 'Export',
    description: 'Save the collection, environment or request as Postman, OpenAPI or curl',
    group: 'file',
    opensDialog: true,
    docs: 'importing',
    keywords: 'postman openapi swagger curl'
  },
  {
    id: 'settings',
    label: 'Settings',
    description: 'Theme, network, certificates, AI assistants and privacy',
    group: 'file',
    shortcut: { mod: true, key: ',' },
    keywords: 'preferences options proxy ssl'
  },
  {
    id: 'close-tab',
    label: 'Close tab',
    description: 'Close the tab you are looking at',
    group: 'tabs',
    shortcut: { mod: true, key: 'W' }
  },

  // Request: act on the open request.
  {
    id: 'send',
    label: 'Send',
    description: 'Send the open request and show the response',
    group: 'request',
    shortcut: { mod: true, key: 'Enter' },
    rendererKey: true,
    docs: 'first-request'
  },
  {
    id: 'save',
    label: 'Save',
    description: 'Write the open request to its .tiger file',
    group: 'request',
    shortcut: { mod: true, key: 'S' },
    rendererKey: true
  },
  {
    id: 'duplicate-request',
    label: 'Duplicate request',
    description: 'Make a copy of the open request next to it',
    group: 'request'
  },
  {
    id: 'copy-curl',
    label: 'Copy as curl',
    description: 'Copy the open request as a curl command, with variables filled in',
    group: 'request',
    keywords: 'curl command clipboard'
  },
  {
    id: 'load-test',
    label: 'Load test',
    description: 'Send the open request many times at once and measure response times',
    group: 'request',
    docs: 'runner',
    keywords: 'performance perf benchmark concurrency'
  },
  {
    id: 'run-collection',
    label: 'Run collection',
    description: 'Send every request of the collection in order and check their tests',
    group: 'request',
    opensDialog: true,
    docs: 'runner',
    keywords: 'runner tests'
  },
  {
    id: 'focus-url',
    label: 'Go to URL bar',
    description: 'Put the cursor in the request URL',
    group: 'request',
    shortcut: { mod: true, key: 'L' },
    rendererKey: true
  },
  {
    id: 'search-response',
    label: 'Search in response',
    description: 'Find text in the response body',
    group: 'request',
    shortcut: { mod: true, key: 'F' },
    rendererKey: true,
    paletteHidden: true,
    docs: 'response'
  },
  {
    id: 'rename',
    label: 'Rename',
    description: 'Rename the selected request or folder in the sidebar',
    group: 'request',
    shortcut: { key: 'F2' },
    rendererKey: true,
    paletteHidden: true
  },

  // View: where you look.
  {
    id: 'command-palette',
    label: 'Command palette',
    description: 'Jump to any request or run any command by typing its name',
    group: 'view',
    shortcut: { mod: true, key: 'K' },
    rendererKey: true,
    keywords: 'search find go to jump'
  },
  {
    id: 'environments',
    label: 'Manage environments',
    description: 'Edit the variables of dev, staging, prod and pick the active one',
    group: 'view',
    opensDialog: true,
    docs: 'environments',
    keywords: 'variables env'
  },
  {
    id: 'history',
    label: 'History',
    description: 'Your last sends with status and timing, to reopen any of them',
    group: 'view'
  },
  {
    id: 'toggle-sidebar',
    label: 'Toggle sidebar',
    description: 'Show or hide the collections sidebar',
    group: 'view',
    shortcut: { mod: true, key: 'B' },
    rendererKey: true
  },
  {
    id: 'theme-system',
    label: 'Match system theme',
    description: 'Follow the light or dark setting of your computer',
    group: 'view',
    keywords: 'appearance dark light mode'
  },
  {
    id: 'theme-light',
    label: 'Light theme',
    description: 'Always use the light glass theme',
    group: 'view',
    keywords: 'appearance mode'
  },
  {
    id: 'theme-dark',
    label: 'Dark theme',
    description: 'Always use the dark glass theme',
    group: 'view',
    keywords: 'appearance mode'
  },
  {
    id: 'zoom-in',
    label: 'Zoom in',
    description: 'Make everything bigger',
    group: 'view',
    shortcut: { mod: true, key: '=' },
    paletteHidden: true
  },
  {
    id: 'zoom-out',
    label: 'Zoom out',
    description: 'Make everything smaller',
    group: 'view',
    shortcut: { mod: true, key: '-' },
    paletteHidden: true
  },
  {
    id: 'zoom-reset',
    label: 'Actual size',
    description: 'Reset the zoom level',
    group: 'view',
    shortcut: { mod: true, key: '0' },
    paletteHidden: true
  },

  // Tabs: keyboard navigation between open tabs.
  {
    id: 'next-tab',
    label: 'Next tab',
    description: 'Move to the tab on the right',
    group: 'tabs',
    shortcut: { ctrl: true, key: 'Tab' },
    rendererKey: true,
    paletteHidden: true
  },
  {
    id: 'previous-tab',
    label: 'Previous tab',
    description: 'Move to the tab on the left',
    group: 'tabs',
    shortcut: { ctrl: true, shift: true, key: 'Tab' },
    rendererKey: true,
    paletteHidden: true
  },
  {
    id: 'jump-tab',
    label: 'Go to tab 1 to 9',
    description: 'Jump to a tab by position, 9 is always the last tab',
    group: 'tabs',
    shortcut: { mod: true, key: '1-9' },
    rendererKey: true,
    paletteHidden: true
  },

  // Help.
  {
    id: 'getting-started',
    label: 'Getting started',
    description: 'The home screen: open a collection, pick a request, send it',
    group: 'help',
    docs: 'getting-started',
    keywords: 'home welcome'
  },
  {
    id: 'shortcuts',
    label: 'Keyboard shortcuts',
    description: 'Every shortcut on one screen',
    group: 'help',
    shortcut: { mod: true, key: '/' },
    rendererKey: true
  },
  {
    id: 'docs',
    label: 'Documentation',
    description: 'Open the Tiger guides in your browser',
    group: 'help',
    keywords: 'help guide manual'
  },
  {
    id: 'report-issue',
    label: 'Report an issue',
    description: 'Open a bug report on GitHub',
    group: 'help',
    keywords: 'bug feedback'
  },
  {
    id: 'check-update',
    label: 'Check for updates',
    description: 'See whether a newer version of Tiger is out',
    group: 'help',
    opensDialog: true
  },
  {
    id: 'about',
    label: 'About Tiger',
    description: 'Version and project link',
    group: 'help',
    paletteHidden: true
  }
] as const satisfies readonly ActionDef[]

export type ActionId = (typeof ACTIONS)[number]['id']

const BY_ID: ReadonlyMap<string, ActionDef> = new Map(ACTIONS.map((a) => [a.id, a as ActionDef]))

export function getAction(id: ActionId): ActionDef {
  return BY_ID.get(id)!
}

/** Label as a menu shows it: "…" when the action asks for more input first. */
export function menuLabel(id: ActionId): string {
  const a = getAction(id)
  return a.opensDialog ? `${a.label}…` : a.label
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
export function tooltip(id: ActionId, mod: string): string {
  const keys = shortcutKeys(id, mod)
  const label = getAction(id).label
  return keys.length ? `${label} (${keys.join('+')})` : label
}

/** Actions the command palette may offer. */
export function paletteActions(): ActionDef[] {
  return (ACTIONS as readonly ActionDef[]).filter((a) => !a.paletteHidden)
}

/**
 * Rank palette actions against a query. Every word must appear in the label,
 * description or keywords; label hits rank first.
 */
export function matchActions(query: string, limit = 8): ActionDef[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  const all = paletteActions()
  if (!words.length) return all.slice(0, limit)
  const scored: Array<{ a: ActionDef; score: number }> = []
  for (const a of all) {
    const label = a.label.toLowerCase()
    const hay = `${label} ${a.description.toLowerCase()} ${a.keywords ?? ''}`
    if (!words.every((w) => hay.includes(w))) continue
    let score = 0
    for (const w of words) {
      if (label.startsWith(w)) score += 3
      else if (label.includes(w)) score += 2
      else score += 1
    }
    scored.push({ a, score })
  }
  scored.sort((x, y) => y.score - x.score)
  return scored.slice(0, limit).map((s) => s.a)
}

/** Headings of the shortcuts overlay, in display order. */
export const SHORTCUT_GROUPS: Array<{ title: string; ids: ActionId[] }> = [
  {
    title: 'General',
    ids: ['command-palette', 'new-collection', 'open-collection', 'settings', 'toggle-sidebar', 'shortcuts']
  },
  {
    title: 'Request',
    ids: ['send', 'save', 'new-request', 'focus-url', 'search-response', 'rename']
  },
  {
    title: 'Tabs',
    ids: ['close-tab', 'next-tab', 'previous-tab', 'jump-tab']
  },
  { title: 'Zoom', ids: ['zoom-in', 'zoom-out', 'zoom-reset'] }
]

/** Request editor sections, in display order (most used first). */
export const REQUEST_SECTIONS = [
  { id: 'params', label: 'Params', description: 'Query string parameters added to the URL' },
  { id: 'body', label: 'Body', description: 'What the request sends: JSON, form, file upload…' },
  { id: 'headers', label: 'Headers', description: 'HTTP headers sent with the request' },
  { id: 'auth', label: 'Auth', description: 'How the request proves who you are', docs: 'requests-auth' },
  {
    id: 'capture',
    label: 'Save values',
    description: 'Store a value from the response into a variable for later requests',
    docs: 'scripts'
  },
  {
    id: 'scripts',
    label: 'Scripts & tests',
    description: 'JavaScript that runs before sending or checks the response after',
    docs: 'scripts'
  },
  { id: 'docs', label: 'Notes', description: 'Markdown notes about this request, saved in its file' },
  {
    id: 'code',
    label: 'Code snippet',
    description: 'This request as ready-to-paste curl, JavaScript fetch or Python code'
  },
  {
    id: 'perf',
    label: 'Load test',
    description: 'Send this request many times at once and measure response times',
    docs: 'runner'
  }
] as const satisfies ReadonlyArray<{ id: string; label: string; description: string; docs?: DocsPage }>

export type RequestSectionId = (typeof REQUEST_SECTIONS)[number]['id']
