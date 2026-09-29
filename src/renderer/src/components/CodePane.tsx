import { useState } from 'react'
import { generateCode, type CodegenTarget } from '@core/codegen'
import type { BuiltRequest } from '@core/request'
import { CheckIcon, CopyIcon } from './Icons'
import './a11y.css'
import './CodePane.css'

const TARGETS: CodegenTarget[] = ['curl', 'fetch', 'python']

const TARGET_LABELS: Record<CodegenTarget, string> = {
  curl: 'curl',
  fetch: 'JavaScript fetch',
  python: 'Python requests'
}

/** Generated-code tab: the request as curl / fetch / python, ready to copy. */
export function CodePane({ getBuilt }: { getBuilt: () => BuiltRequest | null }) {
  const [target, setTarget] = useState<CodegenTarget>('curl')
  const [copied, setCopied] = useState<'ok' | 'fail' | null>(null)
  const built = getBuilt()
  const code = built ? generateCode(built, target) : ''

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied('ok')
    } catch {
      setCopied('fail')
    }
    setTimeout(() => setCopied(null), 1400)
  }

  if (!built) {
    return <div className="cv-dim">Nothing to generate yet. Enter a URL to see the request as code.</div>
  }

  return (
    <div className="code-pane">
      <div className="code-pane-bar">
        <div className="seg" role="group" aria-label="Language">
          {TARGETS.map((t) => (
            <button
              key={t}
              type="button"
              className={target === t ? 'on' : ''}
              aria-pressed={target === t}
              onClick={() => setTarget(t)}
            >
              {TARGET_LABELS[t]}
            </button>
          ))}
        </div>
        <button type="button" className="btn" onClick={copy} title="Copy the generated snippet">
          {copied === 'ok' ? (
            <>
              <CheckIcon size={14} /> Copied
            </>
          ) : (
            <>
              <CopyIcon size={14} /> Copy
            </>
          )}
        </button>
        <span className="tg-sr-only" role="status" aria-live="polite">
          {copied === 'ok'
            ? `${TARGET_LABELS[target]} snippet copied`
            : copied === 'fail'
              ? 'Copy failed: clipboard unavailable'
              : ''}
        </span>
      </div>
      <pre
        className="code-block"
        tabIndex={0}
        role="region"
        aria-label={`Generated ${TARGET_LABELS[target]} code`}
      >
        {code}
      </pre>
    </div>
  )
}
