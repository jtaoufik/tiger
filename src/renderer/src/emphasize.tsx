import type { ReactNode } from 'react'

/**
 * Renders a translated sentence with one value in bold: the message stays a
 * single string (word order is the translator's), and the first occurrence of
 * `value` inside it is wrapped in <b>.
 */
export function emphasize(text: string, value: string): ReactNode {
  const at = value ? text.indexOf(value) : -1
  if (at < 0) return text
  return (
    <>
      {text.slice(0, at)}
      <b>{value}</b>
      {text.slice(at + value.length)}
    </>
  )
}
