import { useState } from 'react'
import { generateCode, type CodegenTarget } from '@core/codegen'
import type { BuiltRequest } from '@core/request'
import { Modal } from './Modal'
import { CheckIcon } from './Icons'

const TARGETS: CodegenTarget[] = ['curl', 'fetch', 'python']

const TARGET_LABELS: Record<CodegenTarget, string> = {
  curl: 'cURL',
  fetch: 'JavaScript fetch',
  python: 'Python requests'
}

export function CodeModal({ built, onClose }: { built: BuiltRequest; onClose: () => void }) {
  const [target, setTarget] = useState<CodegenTarget>('curl')
  const [copied, setCopied] = useState(false)
  const code = generateCode(built, target)

  const copy = async () => {
    await navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 1200)
  }

  return (
    <Modal title="Generate code" onClose={onClose} width={620}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
        <div className="seg">
          {TARGETS.map((t) => (
            <button key={t} className={target === t ? 'on' : ''} onClick={() => setTarget(t)}>
              {TARGET_LABELS[t]}
            </button>
          ))}
        </div>
        <button className="btn" onClick={copy}>
          {copied ? (
            <>
              <CheckIcon size={14} /> Copied
            </>
          ) : (
            'Copy'
          )}
        </button>
      </div>
      <div className="code-block">{code}</div>
    </Modal>
  )
}
