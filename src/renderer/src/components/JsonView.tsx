import { useMemo } from 'react'
import { tokenizeJson } from '@core/jsonHighlight'

/** Above this size highlighting would jank the UI; fall back to plain text. */
const HIGHLIGHT_LIMIT = 400_000

export function JsonView({ text }: { text: string }) {
  const tokens = useMemo(
    () => (text.length <= HIGHLIGHT_LIMIT ? tokenizeJson(text) : null),
    [text]
  )

  if (!tokens) return <>{text}</>
  return (
    <>
      {tokens.map((t, i) =>
        t.type === 'plain' ? t.text : <span key={i} className={`jt-${t.type}`}>{t.text}</span>
      )}
    </>
  )
}
