import { memo, useMemo, type Ref } from 'react'
import { splitByRanges, type MatchRange } from '@core/textSearch'
import { JsonView } from './JsonView'
import './BodyText.css'

/** Bodies are cut into blocks of about this many characters, at line breaks. */
export const CHUNK_CHARS = 16_000

/** One block of the body: text[start, end), without the line break that ends it. */
export interface TextChunk {
  start: number
  end: number
  lines: number
}

/**
 * Split text into blocks of roughly `size` characters, always at a line break
 * (the break itself becomes the boundary between blocks, so rendering the
 * blocks one per line box reproduces the text). A single line longer than
 * `size` stays whole.
 */
export function chunkText(text: string, size = CHUNK_CHARS): TextChunk[] {
  const chunks: TextChunk[] = []
  let start = 0
  while (start < text.length) {
    let end = start + size
    if (end >= text.length) end = text.length
    else {
      const nl = text.indexOf('\n', end)
      end = nl === -1 ? text.length : nl
    }
    let lines = 1
    for (let i = text.indexOf('\n', start); i !== -1 && i < end; i = text.indexOf('\n', i + 1)) lines++
    chunks.push({ start, end, lines })
    start = end + 1
  }
  return chunks
}

interface ChunkProps {
  text: string
  lines: number
  highlight: boolean
  /** Matches inside this chunk, relative to its start. */
  ranges: MatchRange[] | null
  /** Global index of this chunk's first match. */
  firstMatch: number
  activeMatch: number
  activeRef?: Ref<HTMLElement>
}

const Chunk = memo(function Chunk({
  text,
  lines,
  highlight,
  ranges,
  firstMatch,
  activeMatch,
  activeRef
}: ChunkProps) {
  return (
    <div
      className="resp-chunk"
      // Off-screen blocks skip layout and paint; this is their placeholder
      // height until they have been rendered once (then the real one is kept).
      style={{ containIntrinsicSize: `auto ${(lines * 1.55).toFixed(2)}em` }}
    >
      {ranges && ranges.length
        ? splitByRanges(text, ranges).map((seg, i) => {
            if (seg.match === null) return seg.text
            const index = firstMatch + seg.match
            return (
              <mark
                key={i}
                ref={index === activeMatch ? activeRef : undefined}
                className={index === activeMatch ? 'hit active' : 'hit'}
              >
                {seg.text}
              </mark>
            )
          })
        : highlight
          ? <JsonView text={text} />
          : text}
    </div>
  )
})

interface Props {
  text: string
  /** JSON syntax highlighting (callers only enable it for small bodies). */
  highlight: boolean
  /** Search matches over `text`, in order; null when search is off. */
  ranges: MatchRange[] | null
  activeMatch: number
  activeRef?: Ref<HTMLElement>
}

/**
 * The response body as a column of blocks with `content-visibility: auto`, so
 * the browser lays out and paints only what is on screen. A 1 MB pretty body
 * used to be one text node whose every relayout (open, wrap toggle, tab
 * switch, search) blocked the main thread for 300 ms or more.
 */
export function BodyText({ text, highlight, ranges, activeMatch, activeRef }: Props) {
  const chunks = useMemo(() => chunkText(text), [text])
  // Hand each chunk its own matches (ranges never cross a line break: the
  // search box cannot contain one).
  const perChunk = useMemo(() => {
    if (!ranges) return null
    const out: Array<{ ranges: MatchRange[]; first: number }> = []
    let r = 0
    for (const c of chunks) {
      const first = r
      const local: MatchRange[] = []
      while (r < ranges.length && ranges[r].start < c.end) {
        if (ranges[r].start >= c.start) {
          local.push({ start: ranges[r].start - c.start, end: Math.min(ranges[r].end, c.end) - c.start })
        }
        r++
      }
      out.push({ ranges: local, first })
    }
    return out
  }, [chunks, ranges])

  return (
    <>
      {chunks.map((c, i) => {
        const own = perChunk?.[i]
        return (
          <Chunk
            key={c.start}
            text={text.slice(c.start, c.end)}
            lines={c.lines}
            highlight={highlight}
            ranges={own ? own.ranges : null}
            firstMatch={own ? own.first : 0}
            // Only the chunk holding the active match needs to know it.
            activeMatch={
              own && activeMatch >= own.first && activeMatch < own.first + own.ranges.length
                ? activeMatch
                : -1
            }
            activeRef={activeRef}
          />
        )
      })}
    </>
  )
}
