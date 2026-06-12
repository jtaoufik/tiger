import { useState } from 'react'
import { generateCode, type CodegenTarget } from '@core/codegen'
import type { BuiltRequest } from '@core/request'
import { CheckIcon, CopyIcon } from './Icons'

const TARGETS: CodegenTarget[] = ['curl', 'fetch', 'python']

const TARGET_LABELS: Record<CodegenTarget, string> = {
  curl: 'cURL',
  fetch: 'JavaScript fetch',
  python: 'Python requests'
}

/** Generated-code tab: the request as curl / fetch / python, ready to copy. */
export function CodePane({ getBuilt }: { getBuilt: () => BuiltRequest | null }) {
  const [target, setTarget] = useState<CodegenTarget>('curl')
  const [copied, setCopied] = useState(false)
  const built = getBuilt()
  const code = built ? generateCode(built, target) : ''

  const copy = async () => {
    await navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 1200)
  }

  if (!built) return <div className="cv-dim">Nothing to generate yet.</div>

  return (
    <div className="code-pane">
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
        <div className="seg">
          {TARGETS.map((t) => (
            <button key={t} className={target === t ? 'on' : ''} onClick={() => setTarget(t)}>
              {TARGET_LABELS[t]}
            </button>
          ))}
        </div>
        <button className="btn" onClick={copy} title="Copy the generated snippet">
          {copied ? (
            <>
              <CheckIcon size={14} /> Copied
            </>
          ) : (
            <>
              <CopyIcon size={14} /> Copy
            </>
          )}
        </button>
      </div>
      <div className="code-block">{code}</div>
    </div>
  )
}
