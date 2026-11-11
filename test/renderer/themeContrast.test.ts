import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC = join(__dirname, '../../src/renderer/src')
const styles = readFileSync(join(SRC, 'styles.css'), 'utf8')

/** The first rule block for a selector, e.g. `:root` or `[data-theme='dark']`. */
function block(selector: string): string {
  const start = styles.indexOf(`${selector} {`)
  if (start === -1) throw new Error(`no ${selector} block`)
  return styles.slice(start, styles.indexOf('\n}', start))
}

function token(css: string, name: string): string {
  const match = css.match(new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})\\b`))
  if (!match) throw new Error(`${name} is not a #rrggbb color`)
  return match[1]
}

const channels = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)

function luminance(hex: string): number {
  const [r, g, b] = channels(hex).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

/** `color-mix(in srgb, a p%, b)`, as the primary button's hover state uses. */
function mix(a: string, b: string, p: number): string {
  const [ca, cb] = [channels(a), channels(b)]
  return `#${ca.map((v, i) => Math.round((v * p + cb[i] * (1 - p)) * 255).toString(16).padStart(2, '0')).join('')}`
}

function cssFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return cssFiles(path)
    return name.endsWith('.css') ? [path] : []
  })
}

const themes = { light: block(':root'), dark: block("[data-theme='dark']") }

describe('dark theme before the attribute is set', () => {
  it('declares the same tokens under prefers-color-scheme as under data-theme', () => {
    // The media block paints the first frame dark for dark users; it must
    // never drift from the block the renderer switches to afterwards.
    const declarations = (css: string) =>
      css
        .split('\n')
        .slice(1)
        .map((l) => l.trim())
        .filter((l) => l.startsWith('--') || l.startsWith('color-scheme'))
    const media = block(":root:not([data-theme='light'])")
    expect(declarations(media)).toEqual(declarations(themes.dark))
    expect(styles).toMatch(/@media \(prefers-color-scheme: dark\) \{\s*:root:not\(\[data-theme='light'\]\) \{/)
  })
})

describe('high contrast before the attribute is set', () => {
  // The slice of the file inside @media (prefers-contrast: more).
  const start = styles.indexOf('@media (prefers-contrast: more) {')
  // Comments stripped: the block's own comment names the old selector.
  const hc = styles.slice(start, styles.indexOf('\n}\n', start)).replace(/\/\*[\s\S]*?\*\//g, '')
  const declarations = (css: string) =>
    css
      .split('\n')
      .slice(1)
      .map((l) => l.trim())
      .filter((l) => l.startsWith('--'))
  const rule = (selector: string) => {
    const i = hc.indexOf(`${selector} {`)
    if (i === -1) throw new Error(`no ${selector} rule in the high-contrast block`)
    return hc.slice(i, hc.indexOf('\n  }', i))
  }

  it('does not let the light tokens match the attribute-less first frame on a dark OS', () => {
    // :root:not([data-theme='dark']) has the same specificity as the dark
    // first-frame block and comes later, so it used to override it.
    expect(hc).not.toContain(":not([data-theme='dark'])")
    expect(hc).toMatch(/@media \(prefers-color-scheme: light\) \{\s*:root:not\(\[data-theme\]\) \{/)
    expect(hc.indexOf(":root[data-theme='light'] {")).toBeLessThan(hc.indexOf(":root:not([data-theme]) {"))
  })

  it('declares the same light tokens for data-theme=light and the attribute-less light frame', () => {
    expect(declarations(rule(':root:not([data-theme])'))).toEqual(declarations(rule(":root[data-theme='light']")))
    expect(declarations(rule(":root[data-theme='light']")).length).toBeGreaterThan(0)
  })
})

describe('crash panel (ErrorBoundary.css)', () => {
  const crash = readFileSync(join(SRC, 'ErrorBoundary.css'), 'utf8')
  const used = [...new Set([...crash.matchAll(/var\((--[a-z0-9-]+)/g)].map((m) => m[1]))]

  it('only references tokens that styles.css declares', () => {
    // It once used --bg/--panel, which do not exist: white surfaces under the
    // dark theme's light text.
    for (const name of used) expect(styles, name).toMatch(new RegExp(`\\n\\s*${name}:`))
  })

  it('takes its surfaces and text from tokens that flip with the theme', () => {
    const themed = ['--bg-1', '--glass-strong-solid', '--code-surface-solid', '--text', '--text-dim', '--border']
    for (const name of themed) {
      expect(used, name).toContain(name)
      for (const [theme, css] of Object.entries(themes)) expect(css, `${name} in ${theme}`).toContain(`${name}:`)
    }
    for (const [theme, css] of Object.entries(themes)) {
      const panel = token(css, '--glass-strong-solid')
      expect(contrast(token(css, '--text'), panel), `${theme} text on the panel`).toBeGreaterThanOrEqual(4.5)
      expect(contrast(token(css, '--text-dim'), panel), `${theme} dim text on the panel`).toBeGreaterThanOrEqual(4.5)
      expect(contrast(token(css, '--text'), token(css, '--bg-1')), `${theme} text on the page`).toBeGreaterThanOrEqual(4.5)
    }
  })
})

describe('text on the orange accent', () => {
  for (const [theme, css] of Object.entries(themes)) {
    it(`is light text on a deep orange in the ${theme} theme, at least 4.5:1 (hover included)`, () => {
      const solid = token(css, '--accent-solid')
      const ink = token(css, '--accent-solid-ink')
      expect(luminance(ink), 'ink must be lighter than the orange').toBeGreaterThan(luminance(solid))
      expect(contrast(ink, solid)).toBeGreaterThanOrEqual(4.5)
      // .btn.accent:hover darkens the orange by 12%.
      expect(contrast(ink, mix(solid, '#000000', 0.88))).toBeGreaterThanOrEqual(4.5)
    })

    it(`puts light text on a deep red for danger buttons in the ${theme} theme`, () => {
      const fill = token(css, '--danger-fill')
      const ink = token(css, '--danger-ink')
      expect(luminance(ink), 'ink must be lighter than the red').toBeGreaterThan(luminance(fill))
      expect(contrast(ink, fill)).toBeGreaterThanOrEqual(4.5)
      expect(contrast(ink, mix(fill, '#000000', 0.88))).toBeGreaterThanOrEqual(4.5)
    })
  }

  it('puts every text-bearing orange surface on the solid pair, never dark ink on bright orange', () => {
    const all = cssFiles(SRC).map((file) => [file, readFileSync(file, 'utf8')] as const)
    for (const [file, css] of all) {
      expect(css, file).not.toMatch(/var\(--accent-(fill-)?ink\)/)
      // Chromium draws a black checkmark on the bright orange.
      expect(css, file).not.toMatch(/accent-color:\s*var\(--accent(-fill)?\)/)
    }
    expect(styles).toMatch(/\.btn\.accent:hover\s*\{[^}]*color-mix\(in srgb, var\(--accent-solid\) 88%, #000\)/)
    expect(styles).toMatch(/\.btn\.danger:hover\s*\{[^}]*color-mix\(in srgb, var\(--danger-fill\) 88%, #000\)/)
  })

  it('lets no rule override the white text on orange buttons or selected segments (Send included)', () => {
    for (const file of cssFiles(SRC)) {
      const css = readFileSync(file, 'utf8')
      for (const [, selector, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        if (!/\.btn\.accent|\.seg button(\.on|\[aria-(selected|pressed)='true'\])/.test(selector)) continue
        const color = body.match(/(?:^|[;\s])color:\s*([^;]+)/)?.[1].trim()
        const background = body.match(/(?:^|[;\s])background:\s*([^;]+)/)?.[1].trim()
        // A disabled primary button drops the orange altogether (its own, readable pair).
        if (/:disabled/.test(selector) && background && !/accent/.test(background)) continue
        // Windows High Contrast (forced-colors) rules use system colors, which are right there.
        if (color && !/^(HighlightText|ButtonText|CanvasText|LinkText|GrayText)$/.test(color)) {
          expect(color, `${file}: ${selector.trim()}`).toBe('var(--accent-solid-ink)')
        }
      }
    }
  })

  it('gives the section tabs a background, so dark mode shows no grey browser button face', () => {
    // Without one, Chromium paints ButtonFace (#6b6b6b in dark) behind the
    // dim tab text: about 2.9:1.
    expect(styles).toMatch(/\n\.tab \{[^}]*background:\s*transparent/)
  })

  it('draws the switch knob on the deep orange, at least 3:1 for a control', () => {
    expect(styles).toMatch(/\.switch\.on\s*\{\s*background:\s*var\(--accent-solid\)/)
    for (const css of Object.values(themes)) {
      expect(contrast('#ffffff', token(css, '--accent-solid'))).toBeGreaterThanOrEqual(3)
    }
  })
})
