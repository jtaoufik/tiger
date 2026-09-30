import { Fragment, type ReactNode } from 'react'

/** Placeholder value that marks where a rendered node goes inside a translated sentence. */
export const NODE_MARK = '\u0001'

/**
 * Renders a translated sentence with one inline element (a <code> or token
 * chip). Translate with `t(key, { name: NODE_MARK })` and pass the result:
 * the sentence stays one message, and the element lands wherever the
 * language puts it.
 */
export function withNode(text: string, node: ReactNode): ReactNode {
  const parts = text.split(NODE_MARK)
  return parts.map((part, i) => (
    <Fragment key={i}>
      {i > 0 && node}
      {part}
    </Fragment>
  ))
}
