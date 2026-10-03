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
})
