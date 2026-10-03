/**
 * UI audit toolkit for the real Electron app (hidden window, TIGER_E2E=1).
 *
 *  - contrast sweep: every visible text run, input value, placeholder, icon
 *    and form-control boundary on screen. Colors come from computed styles;
 *    the background is MEASURED: a second screenshot is taken with all text
 *    and currentColor made transparent, and the median pixel under each text
 *    run is the real backdrop (glass, blur, saturate, gradients included).
 *  - focus probe: Tab through the page, diff the pixels around each focused
 *    element (no visible change = no focus indicator) and check the outline
 *    against the nearest clipping ancestor.
 *  - layout probes: hover row shift, clipped/overflowing text, toolbar height
 *    mismatches, off-screen elements.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { dirname, join } from 'node:path'
import type { Page } from '@playwright/test'

const requireCjs = createRequire(import.meta.url)
// pngjs ships inside playwright-core: no extra dependency.
const { PNG } = requireCjs(join(dirname(requireCjs.resolve('playwright-core/package.json')), 'lib', 'utilsBundle.js')) as {
  PNG: { sync: { read: (b: Buffer) => { width: number; height: number; data: Buffer } } }
}

export const AUDIT_OUT =
  process.env.AUDIT_OUT ?? join(process.cwd(), 'test-results', 'audit-ui')

export function outPath(...parts: string[]): string {
  const p = join(AUDIT_OUT, ...parts)
  mkdirSync(dirname(p), { recursive: true })
  return p
}

export type RGB = [number, number, number]
export type RGBA = [number, number, number, number]

/* ------------------------------------------------------------------ */
/* color math                                                          */
/* ------------------------------------------------------------------ */

function chan(c: number): number {
  const s = c / 255
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
}
export function lum(c: RGB | RGBA): number {
  return 0.2126 * chan(c[0]) + 0.7152 * chan(c[1]) + 0.0722 * chan(c[2])
}
export function ratio(a: RGB | RGBA, b: RGB | RGBA): number {
  const la = lum(a)
  const lb = lum(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}
export function over(fg: RGBA, bg: RGB): RGB {
  const a = fg[3]
  return [fg[0] * a + bg[0] * (1 - a), fg[1] * a + bg[1] * (1 - a), fg[2] * a + bg[2] * (1 - a)]
}
export function hex(c: RGB | RGBA): string {
  const h = (n: number) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, '0')
  const base = `#${h(c[0])}${h(c[1])}${h(c[2])}`
  return c.length === 4 && c[3] < 0.999 ? `${base}/${c[3].toFixed(2)}` : base
}

/* ------------------------------------------------------------------ */
/* in-page collection                                                  */
/* ------------------------------------------------------------------ */

export interface Item {
  kind: 'text' | 'value' | 'placeholder' | 'icon' | 'boundary'
  x: number
  y: number
  w: number
  h: number
  fg: RGBA
  opacity: number
  fontSize: number
  fontWeight: number
  sel: string
  text: string
  disabled: boolean
  /** DOM-only estimate of the backdrop (alpha-composited ancestors). */
  domBg: RGB
  /** DOM-only estimate of the text color after group opacity. */
  domFg: RGB
  borderW?: number
  tag: string
}

/**
 * Runs in the renderer. `rootSel` limits the sweep to one subtree (hover
 * probe); `topOnly` skips everything under an open dialog's backdrop.
 */
export function collectInPage(arg: { rootSel?: string | null }): { items: Item[]; vw: number; vh: number } {
  const ctx = document.createElement('canvas').getContext('2d')!
  const parse = (s: string): [number, number, number, number] => {
    s = (s || '').trim()
    let m = s.match(/^rgba?\(([^)]+)\)$/)
    if (m) {
      const p = m[1].split(/[\s,/]+/).filter(Boolean).map((v) => (v.endsWith('%') ? parseFloat(v) / 100 : parseFloat(v)))
      return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1]
    }
    m = s.match(/^color\(srgb\s+([^)]+)\)$/)
    if (m) {
      const p = m[1].split(/[\s/]+/).filter(Boolean).map((v) => (v === 'none' ? 0 : parseFloat(v)))
      return [p[0] * 255, p[1] * 255, p[2] * 255, p.length > 3 ? p[3] : 1]
    }
    if (!s || s === 'transparent') return [0, 0, 0, 0]
    ctx.clearRect(0, 0, 1, 1)
    ctx.fillStyle = 'rgba(0,0,0,0)'
    ctx.fillStyle = s
    ctx.fillRect(0, 0, 1, 1)
    const d = ctx.getImageData(0, 0, 1, 1).data
    return [d[0], d[1], d[2], d[3] / 255]
  }
  const overC = (fg: number[], bg: number[]) => {
    const a = fg[3]
    return [fg[0] * a + bg[0] * (1 - a), fg[1] * a + bg[1] * (1 - a), fg[2] * a + bg[2] * (1 - a)]
  }
  const lerp = (a: number[], b: number[], t: number) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
  const vw = innerWidth
  const vh = innerHeight

  // Base canvas: the body's linear gradient end stops, averaged.
  const bodyImg = getComputedStyle(document.body).backgroundImage
  const lin = bodyImg.slice(bodyImg.lastIndexOf('linear-gradient'))
  const stops = [...lin.matchAll(/(rgba?\([^)]*\)|color\([^)]*\))/g)].map((m) => parse(m[1]))
  const base = stops.length
    ? [0, 1, 2].map((i) => stops.reduce((s, c) => s + c[i], 0) / stops.length)
    : [255, 255, 255]

  const domColors = (el: Element, fgColor: number[]) => {
    const chain: Element[] = []
    for (let e: Element | null = el; e; e = e.parentElement) chain.unshift(e)
    let under = base
    const unders: number[][] = []
    const ops: number[] = []
    for (const e of chain) {
      const cs = getComputedStyle(e)
      unders.push(under)
      ops.push(parseFloat(cs.opacity))
      if (e === document.body || e === document.documentElement) continue
      under = overC(parse(cs.backgroundColor), under)
      const img = cs.backgroundImage
      if (img && img !== 'none' && !img.includes('url(')) {
        const st = [...img.matchAll(/(rgba?\([^)]*\)|color\([^)]*\))/g)].map((m) => parse(m[1]))
        if (st.length) {
          const avg = [0, 1, 2, 3].map((i) => st.reduce((s, c) => s + c[i], 0) / st.length)
          under = overC(avg, under)
        }
      }
    }
    let B = under
    let T = overC(fgColor, under)
    for (let i = chain.length - 1; i >= 0; i--) {
      if (ops[i] < 1) {
        B = lerp(unders[i], B, ops[i])
        T = lerp(unders[i], T, ops[i])
      }
    }
    return { B, T }
  }
  const opacityOf = (el: Element) => {
    let o = 1
    for (let e: Element | null = el; e; e = e.parentElement) o *= parseFloat(getComputedStyle(e).opacity)
    return o
  }
  const sel = (el: Element) => {
    const parts: string[] = []
    for (let e: Element | null = el, i = 0; e && i < 4 && e !== document.body; e = e.parentElement, i++) {
      let s = e.tagName.toLowerCase()
      const cls = [...e.classList].filter((c) => !/^lucide/.test(c)).slice(0, 3)
      if (cls.length) s += '.' + cls.join('.')
      const role = e.getAttribute('role')
      if (role && !cls.length) s += `[role=${role}]`
      parts.unshift(s)
    }
    return parts.join(' > ')
  }
  // Clip rect from overflow ancestors (hidden/clip/auto/scroll) and the viewport.
  const clipOf = (el: Element) => {
    let r = { l: 0, t: 0, r: vw, b: vh }
    for (let e: Element | null = el.parentElement; e && e !== document.documentElement; e = e.parentElement) {
      const cs = getComputedStyle(e)
      if (cs.overflowX !== 'visible' || cs.overflowY !== 'visible' || cs.contain.includes('paint')) {
        const b = e.getBoundingClientRect()
        const l = b.left + e.clientLeft
        const t = b.top + e.clientTop
        r = { l: Math.max(r.l, l), t: Math.max(r.t, t), r: Math.min(r.r, l + e.clientWidth), b: Math.min(r.b, t + e.clientHeight) }
      }
      if (cs.position === 'fixed') break
    }
    return r
  }
  const disabledOf = (el: Element) => !!el.closest('[disabled], [aria-disabled="true"], fieldset:disabled')
  const visibleEl = (el: Element) =>
    (el as HTMLElement).checkVisibility
      ? (el as HTMLElement).checkVisibility({ checkOpacity: true, checkVisibilityCSS: true } as never)
      : true
  // Hidden by an open dialog or menu? Only the topmost overlay's content
  // counts (a menu's drop shadow darkens what is under it).
  const overlays = [...document.querySelectorAll('.modal-backdrop, .ctx-menu')]
  const topOverlay = overlays.length ? overlays[overlays.length - 1] : null
  const alwaysOnTop = (el: Element) => !!el.closest('.toasts, .ctx-menu, .update-ready, .skip-link, .import-drop, .lazy-loading.overlay')
  const hitOK = (el: Element, cx: number, cy: number) => {
    if (topOverlay && !topOverlay.contains(el) && !alwaysOnTop(el)) return false
    const h = document.elementFromPoint(cx, cy)
    if (!h) return false
    if (h === el || el.contains(h) || h.contains(el)) return true
    if (alwaysOnTop(el)) return true
    // a sibling label/span inside the same button or row
    const host = el.closest('button, [role=tab], [role=treeitem], label, a, li, tr')
    return !!host && (host.contains(h) || h.contains(host))
  }
  const root: Element | null = arg.rootSel ? document.querySelector(arg.rootSel) : document.body
  const items: Item[] = []
  if (!root) return { items, vw, vh }

  const push = (el: Element, kind: Item['kind'], rect: { x: number; y: number; w: number; h: number }, fg: number[], text: string, extra: Partial<Item> = {}) => {
    const cs = getComputedStyle(el)
    const dom = domColors(el, fg)
    items.push({
      kind,
      ...rect,
      fg: fg as Item['fg'],
      opacity: opacityOf(el),
      fontSize: parseFloat(cs.fontSize),
      fontWeight: parseInt(cs.fontWeight, 10) || 400,
      sel: sel(el),
      text: text.replace(/\s+/g, ' ').trim().slice(0, 70),
      disabled: disabledOf(el),
      domBg: dom.B as Item['domBg'],
      domFg: dom.T as Item['domFg'],
      tag: el.tagName.toLowerCase(),
      ...extra
    })
  }

  // 1) text runs (grouped per parent element)
  const groups = new Map<Element, { rects: DOMRect[]; text: string }>()
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let node: Node | null
  while ((node = walker.nextNode())) {
    const s = node.nodeValue ?? ''
    if (!s.trim()) continue
    const el = node.parentElement
    if (!el || el.closest('script, style, noscript, template, select, option, textarea, .sr-only, .tg-sr-only, [aria-hidden="true"] svg')) continue
    if (!visibleEl(el)) continue
    const range = document.createRange()
    range.selectNodeContents(node)
    const rects = [...range.getClientRects()].filter((r) => r.width > 1.5 && r.height > 3)
    if (!rects.length) continue
    const g = groups.get(el) ?? { rects: [], text: '' }
    g.rects.push(...rects)
    g.text += s
    groups.set(el, g)
  }
  for (const [el, g] of groups) {
    const clip = clipOf(el)
    const cs = getComputedStyle(el)
    if (cs.color === 'rgba(0, 0, 0, 0)') continue
    // keep the visible part of each line box; one item per element (first visible line)
    let best: { x: number; y: number; w: number; h: number } | null = null
    for (const r of g.rects) {
      const l = Math.max(r.left, clip.l)
      const t = Math.max(r.top, clip.t)
      const rr = Math.min(r.right, clip.r)
      const b = Math.min(r.bottom, clip.b)
      if (rr - l < 2 || b - t < 3) continue
      const cand = { x: l, y: t, w: rr - l, h: b - t }
      if (!best || cand.w * cand.h > best.w * best.h) best = cand
    }
    if (!best) continue
    if (!hitOK(el, best.x + best.w / 2, best.y + best.h / 2)) continue
    push(el, 'text', best, parse(cs.color), g.text)
  }

  // 2) form control values and placeholders
  const controls = [...root.querySelectorAll('input, textarea, select')] as HTMLInputElement[]
  for (const el of controls) {
    const type = (el.getAttribute('type') || 'text').toLowerCase()
    if (['checkbox', 'radio', 'hidden', 'range', 'file', 'color', 'submit', 'button'].includes(type) && el.tagName !== 'SELECT') {
      if (type === 'checkbox' || type === 'radio') {
        if (!visibleEl(el)) continue
        const b = el.getBoundingClientRect()
        if (b.width < 4 || b.right < 0 || b.left > vw || b.bottom < 0 || b.top > vh) continue
        if (!hitOK(el, b.x + b.width / 2, b.y + b.height / 2)) continue
        push(el, 'boundary', { x: b.x, y: b.y, w: b.width, h: b.height }, [0, 0, 0, 1], `${type}${el.checked ? ' (checked)' : ''}`, { borderW: 1 })
      }
      continue
    }
    if (!visibleEl(el)) continue
    const b = el.getBoundingClientRect()
    if (b.width < 8 || b.height < 8) continue
    const clip = clipOf(el)
    if (b.right <= clip.l || b.left >= clip.r || b.bottom <= clip.t || b.top >= clip.b) continue
    if (!hitOK(el, b.x + b.width / 2, b.y + Math.min(b.height / 2, 14))) continue
    const cs = getComputedStyle(el)
    const bl = parseFloat(cs.borderLeftWidth) + parseFloat(cs.paddingLeft)
    const br = parseFloat(cs.borderRightWidth) + parseFloat(cs.paddingRight)
    const bt = parseFloat(cs.borderTopWidth) + parseFloat(cs.paddingTop)
    const lh = Math.min(b.height - bt - parseFloat(cs.borderBottomWidth) - parseFloat(cs.paddingBottom), parseFloat(cs.fontSize) * 1.4)
    const content = {
      x: Math.max(b.x + bl, clip.l),
      y: Math.max(b.y + bt, clip.t),
      w: Math.min(b.width - bl - br, clip.r - (b.x + bl)),
      h: Math.max(4, Math.min(lh, clip.b - (b.y + bt)))
    }
    const value = el.tagName === 'SELECT' ? (el as unknown as HTMLSelectElement).selectedOptions[0]?.text ?? '' : el.value
    if (value) push(el, 'value', content, parse(cs.color), value)
    else if (el.placeholder) push(el, 'placeholder', content, parse(getComputedStyle(el, '::placeholder').color), el.placeholder)
    const bw = parseFloat(cs.borderTopWidth)
    // Borderless fields live inside a bordered wrapper (search, env combo) or
    // are inline titles/editors: their boundary is the wrapper's.
    if (bw >= 0.5) push(el, 'boundary', { x: b.x, y: b.y, w: b.width, h: b.height }, parse(cs.borderTopColor), `${el.tagName.toLowerCase()} ${el.getAttribute('aria-label') ?? el.name ?? ''}`, { borderW: bw })
  }
  // switches, the env combo wrapper
  for (const el of root.querySelectorAll('.switch, .env-combo, .sidebar-search')) {
    if (!visibleEl(el)) continue
    const b = el.getBoundingClientRect()
    if (!hitOK(el, b.x + b.width / 2, b.y + b.height / 2)) continue
    const cs = getComputedStyle(el)
    push(el, 'boundary', { x: b.x, y: b.y, w: b.width, h: b.height }, parse(cs.borderTopColor), el.className, { borderW: parseFloat(cs.borderTopWidth) })
  }

  // 3) icons (lucide svg, stroke = currentColor)
  for (const svg of root.querySelectorAll('svg')) {
    if (!visibleEl(svg)) continue
    const b = svg.getBoundingClientRect()
    if (b.width < 9 || b.height < 9 || b.width > 64) continue
    const clip = clipOf(svg)
    if (b.right <= clip.l + 2 || b.left >= clip.r - 2 || b.bottom <= clip.t + 2 || b.top >= clip.b - 2) continue
    if (!hitOK(svg, b.x + b.width / 2, b.y + b.height / 2)) continue
    const cs = getComputedStyle(svg)
    const stroke = svg.getAttribute('stroke')
    const color = stroke && stroke !== 'currentColor' && stroke !== 'none' ? parse(stroke) : parse(cs.color)
    const host = svg.closest('button, a, [role=tab], [role=menuitem]')
    const label = host?.getAttribute('aria-label') ?? host?.getAttribute('title') ?? host?.textContent ?? ''
    push(svg, 'icon', { x: b.x, y: b.y, w: b.width, h: b.height }, color, `icon ${label}`)
  }
  return { items, vw, vh }
}

/* ------------------------------------------------------------------ */
/* pixel sampling                                                      */
/* ------------------------------------------------------------------ */

interface Img {
  width: number
  height: number
  data: Buffer
  dpr: number
  ox: number
  oy: number
}

export function decode(buf: Buffer, cssWidth: number, ox = 0, oy = 0): Img {
  const png = PNG.sync.read(buf)
  return { width: png.width, height: png.height, data: png.data, dpr: png.width / cssWidth, ox, oy }
}

function px(img: Img, x: number, y: number): RGB | null {
  const X = Math.floor((x - img.ox) * img.dpr)
  const Y = Math.floor((y - img.oy) * img.dpr)
  if (X < 0 || Y < 0 || X >= img.width || Y >= img.height) return null
  const i = (Y * img.width + X) * 4
  return [img.data[i], img.data[i + 1], img.data[i + 2]]
}

/** Median (by luminance) of the pixels inside a CSS-px rect. */
export function medianIn(img: Img, x: number, y: number, w: number, h: number): RGB | null {
  const out: RGB[] = []
  const X0 = Math.floor((x - img.ox) * img.dpr)
  const Y0 = Math.floor((y - img.oy) * img.dpr)
  const X1 = Math.ceil((x + w - img.ox) * img.dpr)
  const Y1 = Math.ceil((y + h - img.oy) * img.dpr)
  const total = Math.max(1, (X1 - X0) * (Y1 - Y0))
  const step = Math.max(1, Math.floor(Math.sqrt(total / 3000)))
  for (let Y = Math.max(0, Y0); Y < Math.min(img.height, Y1); Y += step) {
    for (let X = Math.max(0, X0); X < Math.min(img.width, X1); X += step) {
      const i = (Y * img.width + X) * 4
      out.push([img.data[i], img.data[i + 1], img.data[i + 2]])
    }
  }
  if (!out.length) return null
  out.sort((a, b) => lum(a) - lum(b))
  return out[Math.floor(out.length / 2)]
}

/** Pixels on a ring around a rect: d0..d1 CSS px outside (positive) or inside (negative). */
export function ring(img: Img, x: number, y: number, w: number, h: number, d0: number, d1: number, sideTrim = 0.2): RGB[][] {
  const sides: RGB[][] = [[], [], [], []]
  const step = 1 / img.dpr
  for (let d = d0; d < d1; d += step) {
    // top / bottom
    for (let xx = x + w * sideTrim; xx < x + w * (1 - sideTrim); xx += step) {
      const a = px(img, xx, y - d - step / 2)
      const b = px(img, xx, y + h + d - step / 2)
      if (a) sides[0].push(a)
      if (b) sides[1].push(b)
    }
    for (let yy = y + h * sideTrim; yy < y + h * (1 - sideTrim); yy += step) {
      const a = px(img, x - d - step / 2, yy)
      const b = px(img, x + w + d - step / 2, yy)
      if (a) sides[2].push(a)
      if (b) sides[3].push(b)
    }
  }
  return sides
}

/**
 * Per side, the strongest pixel in a band from 1 CSS px outside to 2.5 px
 * inside the border box (wherever the border was snapped or anti-aliased),
 * then the median along the middle half of that side.
 */
export function edgeBand(img: Img, x: number, y: number, w: number, h: number, outerMed: RGB): number[] {
  const step = 1 / img.dpr
  const res: number[] = []
  const sideVals = (pos0: number, pos1: number, sample: (pos: number, d: number) => RGB | null) => {
    const vals: number[] = []
    for (let pos = pos0; pos < pos1; pos += step) {
      let best = 1
      for (let d = -1; d <= 2.5; d += step) {
        const p = sample(pos, d)
        if (p) best = Math.max(best, ratio(p, outerMed))
      }
      vals.push(best)
    }
    return vals
  }
  const sides = [
    sideVals(x + w * 0.25, x + w * 0.75, (p, d) => px(img, p, y + d + step / 2)),
    sideVals(x + w * 0.25, x + w * 0.75, (p, d) => px(img, p, y + h - d - step / 2)),
    sideVals(y + h * 0.3, y + h * 0.7, (p, d) => px(img, x + d + step / 2, p)),
    sideVals(y + h * 0.3, y + h * 0.7, (p, d) => px(img, x + w - d - step / 2, p))
  ]
  for (const s of sides) if (s.length) res.push(median(s))
  return res
}

function median(xs: number[]): number {
  if (!xs.length) return NaN
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)]
}
function pct(xs: number[], p: number): number {
  if (!xs.length) return NaN
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.floor(s.length * p))]
}

export interface Measured extends Item {
  bg: RGB
  fgEff: RGB
  ratio: number
  domRatio: number
  need: number
  large: boolean
  fail: boolean
}

export function measure(items: Item[], bgImg: Img, _inkImg?: Img): Measured[] {
  const out: Measured[] = []
  for (const it of items) {
    if (it.kind === 'boundary') {
      // outside backdrop vs the component's edge (border) and its fill
      const outer = ring(bgImg, it.x, it.y, it.w, it.h, 3, 5).flat()
      if (!outer.length) continue
      const outerMed = [...outer].sort((a, b) => lum(a) - lum(b))[Math.floor(outer.length / 2)]
      const sides = edgeBand(bgImg, it.x, it.y, it.w, it.h, outerMed)
      // the boundary reads when at least two sides show it
      const edge = sides.length >= 2 ? [...sides].sort((a, b) => b - a)[1] : sides[0] ?? 1
      const fill = medianIn(bgImg, it.x + it.w * 0.3, it.y + it.h * 0.3, it.w * 0.4, it.h * 0.4)
      const fillRatio = fill ? ratio(fill, outerMed) : 1
      const r = Math.max(edge, fillRatio)
      out.push({ ...it, bg: outerMed, fgEff: fill ?? outerMed, ratio: r, domRatio: NaN, need: 3, large: false, fail: r < 3 })
      continue
    }
    // text / icons: backdrop from the text-less screenshot
    const bg = medianIn(bgImg, it.x, it.y, it.w, it.h)
    if (!bg) continue
    const a = it.fg[3] * it.opacity
    const fgEff = over([it.fg[0], it.fg[1], it.fg[2], a], bg)
    const r = ratio(fgEff, bg)
    const large = it.fontSize >= 24 || (it.fontSize >= 18.66 && it.fontWeight >= 700)
    const need = it.kind === 'icon' ? 3 : large ? 3 : 4.5
    out.push({ ...it, bg, fgEff, ratio: r, domRatio: ratio(it.domFg, it.domBg), need, large, fail: r < need })
  }
  return out
}

/* ------------------------------------------------------------------ */
/* sweep orchestration                                                 */
/* ------------------------------------------------------------------ */

const HIDE_TEXT = `
*, *::before, *::after { color: transparent !important; -webkit-text-fill-color: transparent !important;
  text-shadow: none !important; caret-color: transparent !important; transition: none !important; }
::placeholder { color: transparent !important; -webkit-text-fill-color: transparent !important; }
`

export async function settle(page: Page, ms = 280): Promise<void> {
  await page.waitForTimeout(ms)
  await page.evaluate(() => {
    for (const a of document.getAnimations()) {
      try {
        const timing = a.effect?.getComputedTiming()
        if (timing && timing.iterations !== Infinity) a.finish()
      } catch {
        /* infinite or detached */
      }
    }
  })
  await page.waitForTimeout(40)
}

async function injectStyle(page: Page, id: string, css: string): Promise<void> {
  await page.evaluate(
    ({ id, css }) => {
      const s = document.createElement('style')
      s.id = id
      s.textContent = css
      document.head.appendChild(s)
    },
    { id, css }
  )
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
}
async function removeStyle(page: Page, id: string): Promise<void> {
  await page.evaluate((id) => document.getElementById(id)?.remove(), id)
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
}

export interface SweepResult {
  screen: string
  theme: string
  state: string
  shot: string
  annotated?: string
  measured: Measured[]
  failures: Measured[]
}

/** Draw labelled boxes on the failures and save an annotated screenshot. */
async function annotate(page: Page, fails: Measured[], path: string, clip?: { x: number; y: number; width: number; height: number }): Promise<void> {
  await page.evaluate((boxes) => {
    const host = document.createElement('div')
    host.id = '__audit_marks'
    host.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483647'
    for (const b of boxes) {
      const d = document.createElement('div')
      d.style.cssText = `position:fixed;left:${b.x - 2}px;top:${b.y - 2}px;width:${b.w + 4}px;height:${b.h + 4}px;outline:2px solid #ff00d4;`
      const l = document.createElement('span')
      l.textContent = b.label
      l.style.cssText = 'position:absolute;left:0;top:-13px;font:600 10px/12px monospace;background:#ff00d4;color:#fff;padding:0 3px;white-space:nowrap'
      d.appendChild(l)
      host.appendChild(d)
    }
    document.body.appendChild(host)
  }, fails.map((f) => ({ x: f.x, y: f.y, w: f.w, h: f.h, label: `${f.ratio.toFixed(2)}` })))
  await page.screenshot({ path, clip })
  await page.evaluate(() => document.getElementById('__audit_marks')?.remove())
}

export async function sweep(
  page: Page,
  screen: string,
  theme: string,
  opts: { state?: string; rootSel?: string; clip?: { x: number; y: number; width: number; height: number }; noShot?: boolean } = {}
): Promise<SweepResult> {
  const state = opts.state ?? 'default'
  await settle(page)
  const { items, vw } = await page.evaluate(collectInPage, { rootSel: opts.rootSel ?? null })
  const tag = `${theme}-${screen}${state === 'default' ? '' : '-' + state}`.replace(/[^\w.-]+/g, '_')
  const shot = outPath('shots', `${tag}.png`)
  const ink = await page.screenshot({ path: opts.noShot ? undefined : shot, clip: opts.clip })
  await injectStyle(page, '__audit_hide_text', HIDE_TEXT)
  const bgBuf = await page.screenshot({ clip: opts.clip })
  await removeStyle(page, '__audit_hide_text')
  const cssW = opts.clip ? opts.clip.width : vw
  const ox = opts.clip?.x ?? 0
  const oy = opts.clip?.y ?? 0
  const measured = measure(items, decode(bgBuf, cssW, ox, oy), decode(ink, cssW, ox, oy))
  const failures = measured.filter((m) => m.fail)
  const res: SweepResult = { screen, theme, state, shot, measured, failures }
  if (failures.length) {
    res.annotated = outPath('shots', `${tag}-annotated.png`)
    await annotate(page, failures, res.annotated, opts.clip)
  }
  return res
}

/** Hover each matching element (first `max` visible ones) and sweep its subtree. */
export async function hoverSweep(page: Page, screen: string, theme: string, selectors: string[], max = 1): Promise<SweepResult[]> {
  const results: SweepResult[] = []
  for (const s of selectors) {
    const loc = page.locator(s)
    const n = Math.min(await loc.count(), Math.max(6, max + 6))
    let done = 0
    for (let i = 0; i < n && done < max; i++) {
      const el = loc.nth(i)
      if (!(await el.isVisible().catch(() => false))) continue
      try {
        await el.hover({ timeout: 1500, force: true })
      } catch {
        continue
      }
      const box = await el.boundingBox()
      const vp0 = page.viewportSize() ?? (await page.evaluate(() => ({ width: innerWidth, height: innerHeight })))
      if (!box || box.width < 4 || box.y >= vp0.height - 2 || box.x >= vp0.width - 2 || box.y + box.height <= 0) continue
      await page.evaluate((idx) => {
        document.querySelectorAll('[data-audit-root]').forEach((e) => e.removeAttribute('data-audit-root'))
        return idx
      }, i)
      await el.evaluate((e) => e.setAttribute('data-audit-root', '1'))
      const pad = 10
      const x0 = Math.max(0, Math.floor(box.x - pad))
      const y0 = Math.max(0, Math.floor(box.y - pad))
      const x1 = Math.min(vp0.width, Math.ceil(box.x + box.width + pad))
      const y1 = Math.min(vp0.height, Math.ceil(box.y + box.height + pad))
      if (x1 - x0 < 4 || y1 - y0 < 4) continue
      const clip = { x: x0, y: y0, width: x1 - x0, height: y1 - y0 }
      const r = await sweep(page, screen, theme, { state: `hover-${s.replace(/[^\w]+/g, '_').slice(0, 40)}${done ? '-' + done : ''}`, rootSel: '[data-audit-root]', clip })
      results.push(r)
      await el.evaluate((e) => e.removeAttribute('data-audit-root')).catch(() => {})
      done++
    }
  }
  await page.mouse.move(1, 1)
  return results
}

/* ------------------------------------------------------------------ */
/* focus probe                                                         */
/* ------------------------------------------------------------------ */

export interface FocusStep {
  sel: string
  label: string
  rect: { x: number; y: number; w: number; h: number }
  changed: number
  ringRatio: number
  outline: string
  clipped: string | null
}

export async function focusProbe(page: Page, _screen: string, _theme: string, steps = 60, startSel?: string): Promise<FocusStep[]> {
  const out: FocusStep[] = []
  if (startSel) {
    await page.locator(startSel).first().focus().catch(() => {})
  }
  await settle(page, 120)
  const vw = await page.evaluate(() => innerWidth)
  let before = decode(await page.screenshot(), vw)
  const seen = new Set<string>()
  for (let i = 0; i < steps; i++) {
    await page.keyboard.press('Tab')
    await page.waitForTimeout(170)
    const info = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null
      if (!el || el === document.body) return null
      const b = el.getBoundingClientRect()
      const cs = getComputedStyle(el)
      let s = el.tagName.toLowerCase()
      if (el.className && typeof el.className === 'string') s += '.' + el.className.trim().split(/\s+/).slice(0, 3).join('.')
      const parentCls = el.parentElement?.className
      if (typeof parentCls === 'string' && parentCls) s = parentCls.split(/\s+/)[0] + ' > ' + s
      const width = cs.outlineStyle !== 'none' ? parseFloat(cs.outlineWidth) : 0
      const off = parseFloat(cs.outlineOffset) || 0
      const ext = width > 0 ? Math.max(0, off + width) : 0
      // the ring vs. the nearest clipping ancestor
      let clipped: string | null = null
      if (ext > 0) {
        for (let e = el.parentElement; e && e !== document.documentElement; e = e.parentElement) {
          const ecs = getComputedStyle(e)
          if (ecs.overflowX !== 'visible' || ecs.overflowY !== 'visible') {
            const r = e.getBoundingClientRect()
            const l = r.left + e.clientLeft
            const t = r.top + e.clientTop
            const rr = l + e.clientWidth
            const bb = t + e.clientHeight
            const cut: string[] = []
            if (b.left - ext < l - 0.5) cut.push(`left ${(l - (b.left - ext)).toFixed(1)}px`)
            if (b.top - ext < t - 0.5) cut.push(`top ${(t - (b.top - ext)).toFixed(1)}px`)
            if (b.right + ext > rr + 0.5) cut.push(`right ${(b.right + ext - rr).toFixed(1)}px`)
            if (b.bottom + ext > bb + 0.5) cut.push(`bottom ${(b.bottom + ext - bb).toFixed(1)}px`)
            if (cut.length) {
              const ec = typeof e.className === 'string' ? e.className.split(/\s+/).slice(0, 2).join('.') : ''
              clipped = `by ${e.tagName.toLowerCase()}.${ec}: ${cut.join(', ')}`
            }
            break
          }
        }
      }
      const label = (el.getAttribute('aria-label') ?? el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 50)
      return {
        sel: s,
        label,
        rect: { x: b.x, y: b.y, w: b.width, h: b.height },
        outline: `${cs.outlineStyle} ${cs.outlineWidth} ${cs.outlineColor} off ${cs.outlineOffset}; shadow ${cs.boxShadow === 'none' ? 'none' : 'yes'}`,
        clipped,
        key: s + '|' + label + '|' + Math.round(b.x) + ',' + Math.round(b.y)
      }
    })
    const after = decode(await page.screenshot(), vw)
    if (!info) {
      before = after
      continue
    }
    if (seen.has(info.key)) break // wrapped around
    seen.add(info.key)
    // pixel diff around the element (wide enough for a ring drawn on a
    // :focus-within wrapper, e.g. the sidebar search box)
    const pad = 14
    let changed = 0
    const ratios: number[] = []
    const { x, y, w, h } = info.rect
    const step = 1 / after.dpr
    for (let yy = y - pad; yy < y + h + pad; yy += step) {
      for (let xx = x - pad; xx < x + w + pad; xx += step) {
        const inner = xx > x + 4 && xx < x + w - 4 && yy > y + 4 && yy < y + h - 4
        if (inner) continue // only the edge band: content changes (text) are not a ring
        const a = px(before, xx, yy)
        const b = px(after, xx, yy)
        if (!a || !b) continue
        const r = ratio(a, b)
        if (r > 1.3) {
          changed++
          ratios.push(r)
        }
      }
    }
    out.push({
      sel: info.sel,
      label: info.label,
      rect: info.rect,
      changed: Math.round(changed / (after.dpr * after.dpr)),
      ringRatio: ratios.length ? pct(ratios, 0.9) : 1,
      outline: info.outline,
      clipped: info.clipped
    })
    before = after
  }
  return out
}

/* ------------------------------------------------------------------ */
/* layout probes                                                       */
/* ------------------------------------------------------------------ */

export interface OverflowHit {
  sel: string
  text: string
  kind: 'clipped' | 'ellipsis' | 'spill' | 'offscreen'
  over: number
}

/** Text cut without an ellipsis, text spilling out of its box, boxes past the viewport. */
export async function overflowScan(page: Page, rootSel?: string): Promise<OverflowHit[]> {
  return page.evaluate((rootSel) => {
    const hits: { sel: string; text: string; kind: 'clipped' | 'ellipsis' | 'spill' | 'offscreen'; over: number }[] = []
    const root = rootSel ? document.querySelector(rootSel) : document.body
    if (!root) return hits
    const vw = innerWidth
    const vh = innerHeight
    const name = (e: Element) => {
      const parts: string[] = []
      for (let x: Element | null = e, i = 0; x && i < 3 && x !== document.body; x = x.parentElement, i++) {
        let s = x.tagName.toLowerCase()
        const c = [...x.classList].slice(0, 2)
        if (c.length) s += '.' + c.join('.')
        parts.unshift(s)
      }
      return parts.join(' > ')
    }
    const overlays = [...document.querySelectorAll('.modal-backdrop')]
    const top = overlays.length ? overlays[overlays.length - 1] : null
    for (const el of root.querySelectorAll('*')) {
      const he = el as HTMLElement
      if (top && !top.contains(el) && !el.closest('.toasts, .ctx-menu, .update-ready')) continue
      if (!he.checkVisibility?.({ checkOpacity: true, checkVisibilityCSS: true } as never)) continue
      if (el.closest('.sr-only, .tg-sr-only, svg, .titlebar .btn-label')) continue
      const cs = getComputedStyle(el)
      const hasText = [...el.childNodes].some((n) => n.nodeType === 3 && n.nodeValue!.trim())
      if (!hasText) continue
      const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 60)
      const sw = he.scrollWidth
      const cw = he.clientWidth
      if (cw > 0 && sw > cw + 1) {
        if (cs.overflowX === 'hidden' || cs.overflowX === 'clip') {
          hits.push({ sel: name(el), text, kind: cs.textOverflow === 'ellipsis' ? 'ellipsis' : 'clipped', over: sw - cw })
        } else if (cs.overflowX === 'visible' && cs.display !== 'inline') {
          hits.push({ sel: name(el), text, kind: 'spill', over: sw - cw })
        }
      }
      // vertical clipping of text by its own box (e.g. tall scripts in fixed-height controls)
      const sh = he.scrollHeight
      const ch = he.clientHeight
      if (ch > 0 && sh > ch + 2 && (cs.overflowY === 'hidden' || cs.overflowY === 'clip') && cs.whiteSpace === 'nowrap') {
        hits.push({ sel: name(el), text, kind: 'clipped', over: sh - ch })
      }
      const b = el.getBoundingClientRect()
      if (b.width > 0 && (b.right > vw + 1 || b.bottom > vh + 1 || b.left < -1) && cs.position !== 'static') {
        hits.push({ sel: name(el), text, kind: 'offscreen', over: Math.max(b.right - vw, b.bottom - vh, -b.left) })
      }
    }
    return hits
  }, rootSel ?? null)
}

/** Heights and vertical centers of the controls in each toolbar. */
export async function toolbarScan(page: Page, toolbars: string[]): Promise<{ bar: string; items: { sel: string; h: number; cy: number; top: number }[]; spread: number; centerSpread: number }[]> {
  return page.evaluate((toolbars) => {
    const out: { bar: string; items: { sel: string; h: number; cy: number; top: number }[]; spread: number; centerSpread: number }[] = []
    for (const t of toolbars) {
      for (const bar of document.querySelectorAll(t)) {
        if (!(bar as HTMLElement).checkVisibility?.()) continue
        const kids = [...bar.children].filter((k) => {
          const he = k as HTMLElement
          if (!he.checkVisibility?.()) return false
          return k.matches('button, select, input, .env-combo, .seg, a, [role=button], [role=tablist], [role=group], .btn')
        })
        if (kids.length < 2) continue
        const items = kids.map((k) => {
          const b = k.getBoundingClientRect()
          let s = k.tagName.toLowerCase()
          const c = [...k.classList].slice(0, 3)
          if (c.length) s += '.' + c.join('.')
          const label = (k.getAttribute('aria-label') ?? k.textContent ?? '').trim().slice(0, 20)
          return { sel: `${s} "${label}"`, h: Math.round(b.height * 10) / 10, cy: Math.round((b.top + b.height / 2) * 10) / 10, top: Math.round(b.top * 10) / 10 }
        })
        const hs = items.map((i) => i.h)
        const cys = items.map((i) => i.cy)
        out.push({ bar: t, items, spread: Math.max(...hs) - Math.min(...hs), centerSpread: Math.max(...cys) - Math.min(...cys) })
      }
    }
    return out
  }, toolbars)
}

/* ------------------------------------------------------------------ */
/* fixtures: a richer collection and server                            */
/* ------------------------------------------------------------------ */

export interface AuditServer {
  url: string
  close: () => Promise<void>
}

export async function startAuditServer(): Promise<AuditServer> {
  const server: Server = createServer((req, res) => {
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => chunks.push(c))
    req.on('end', () => {
      const u = new URL(req.url ?? '/', 'http://local')
      const path = u.pathname
      const json = (status: number, data: unknown, headers: Record<string, string | string[]> = {}) => {
        res.writeHead(status, { 'Content-Type': 'application/json', 'X-Request-Id': 'a'.repeat(180), ...headers })
        res.end(req.method === 'HEAD' ? undefined : JSON.stringify(data, null, 0))
      }
      const st = /^\/status\/(\d{3})$/.exec(path)
      if (st) return json(Number(st[1]), { status: Number(st[1]), message: `status ${st[1]}` })
      if (path === '/slow') {
        setTimeout(() => json(200, { slow: true }), Number(u.searchParams.get('ms') ?? 6000))
        return
      }
      if (path === '/cookies') {
        return json(200, { ok: true }, { 'Set-Cookie': ['session=abc123; Path=/; HttpOnly', 'pref=dark-mode-enabled; Max-Age=3600; SameSite=Lax'] })
      }
      if (path === '/long') {
        return json(200, Array.from({ length: 300 }, (_, i) => ({ id: i, title: `item ${i} `.repeat(30), ok: i % 2 === 0, n: null })))
      }
      if (path === '/html') {
        res.writeHead(200, { 'Content-Type': 'text/html' })
        return res.end('<!doctype html><h1>Hello</h1><p>preview</p>')
      }
      return json(200, {
        method: req.method,
        path,
        ok: true,
        count: 3,
        nothing: null,
        items: [{ id: 1, name: 'alpha' }, { id: 2, name: 'beta' }]
      })
    })
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  const { port } = server.address() as AddressInfo
  return { url: `http://127.0.0.1:${port}`, close: () => new Promise<void>((r) => server.close(() => r())) }
}

const req = (name: string, seq: number, method: string, url: string, extra = ''): string =>
  `meta {\n  name: ${name}\n  seq: ${seq}\n}\n\n${method} {\n  url: ${url}\n}\n${extra ? '\n' + extra + '\n' : ''}`

/** A collection that exercises every method pill, status family, tests, long names. */
export function writeAuditCollection(dir: string, baseUrl: string): void {
  const f = (p: string, s: string) => {
    mkdirSync(dirname(join(dir, p)), { recursive: true })
    writeFileSync(join(dir, p), s)
  }
  f('environments/local.tiger', `meta {\n  name: local\n}\n\nvars {\n  baseUrl: ${baseUrl}\n  userId: 1\n  token: secret-token\n}\n`)
  f('environments/a very long environment name for staging eu west.tiger', `meta {\n  name: a very long environment name for staging eu west\n}\n\nvars {\n  baseUrl: ${baseUrl}\n}\n`)
  const methods = ['get', 'post', 'put', 'patch', 'delete', 'options', 'head']
  methods.forEach((m, i) =>
    f(
      `methods/${m}.tiger`,
      req(`${m.toUpperCase()} echo`, i + 1, m, '{{baseUrl}}/echo', m === 'post' || m === 'put' || m === 'patch' ? 'headers {\n  Content-Type: application/json\n}\n\nbody:json {\n  { "name": "tiger", "n": 1 }\n}' : '')
    )
  )
  const statuses = [200, 201, 301, 404, 500]
  statuses.forEach((s, i) => f(`statuses/status-${s}.tiger`, req(`Status ${s}`, i + 1, 'get', `{{baseUrl}}/status/${s}`)))
  f('statuses/slow.tiger', req('Slow response', 10, 'get', '{{baseUrl}}/slow?ms=8000'))
  f('statuses/refused.tiger', req('Connection refused', 11, 'get', 'http://127.0.0.1:9/nothing'))
  f('statuses/cookies.tiger', req('Sets cookies', 12, 'get', '{{baseUrl}}/cookies'))
  f('statuses/long.tiger', req('Long body', 13, 'get', '{{baseUrl}}/long'))
  f(
    'statuses/tests.tiger',
    req(
      'Tests pass and fail',
      14,
      'get',
      '{{baseUrl}}/echo',
      "script:post {\n  tiger.test('status is 200', () => tiger.expect(tiger.response.status === 200))\n  tiger.test('body has 99 items', () => tiger.expect(false, 'expected 99 items, got 2'))\n  tiger.log('done', 42)\n}"
    )
  )
  f('statuses/missing-var.tiger', req('Missing variable', 15, 'get', '{{baseUrl}}/echo/{{undefinedThing}}'))
  f(
    'long/a folder with a really long name that does not fit the sidebar/very-long.tiger',
    req(
      'A request with a very long name that should truncate nicely in every list and tab',
      1,
      'get',
      '{{baseUrl}}/echo/' + 'segment/'.repeat(30) + '?q=' + 'x'.repeat(120),
      'headers {\n  X-Very-Long-Header-Name-For-Testing-Overflow: ' + 'value-'.repeat(60) + '\n  Accept: application/json\n}\n\ndocs {\n  # Notes\n  Some documentation text.\n}'
    )
  )
  f('nested/level1/level2/level3/deep.tiger', req('Deep request', 1, 'get', '{{baseUrl}}/echo/deep'))
  f('bodies/json-bad.tiger', req('Invalid JSON body', 1, 'post', '{{baseUrl}}/echo', 'body:json {\n  { "broken": tru\n}'))
  f('bodies/xml.tiger', req('XML body', 2, 'post', '{{baseUrl}}/echo', 'body:xml {\n  <a><b>1</b></a>\n}'))
  f('bodies/graphql.tiger', req('GraphQL body', 3, 'post', '{{baseUrl}}/echo', 'body:graphql {\n  query { me { id } }\n}\n\ngraphqlvars {\n  { "id": 1 }\n}'))
  f('auth/bearer.tiger', req('Bearer auth', 1, 'get', '{{baseUrl}}/echo', 'auth:bearer {\n  token: {{token}}\n}'))
  f('auth/basic.tiger', req('Basic auth', 2, 'get', '{{baseUrl}}/echo', 'auth:basic {\n  username: me\n  password: secret\n}'))
  f('auth/apikey.tiger', req('API key auth', 3, 'get', '{{baseUrl}}/echo', 'auth:apikey {\n  key: X-Api-Key\n  value: abc\n  in: header\n}'))
  f(
    'auth/oauth2.tiger',
    req('OAuth2 auth', 4, 'get', '{{baseUrl}}/echo', 'auth:oauth2 {\n  grant_type: client_credentials\n  token_url: {{baseUrl}}/token\n  client_id: id\n  client_secret: secret\n}')
  )
}
