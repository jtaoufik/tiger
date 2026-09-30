import { useState } from 'react'
import { generateCode, type CodegenTarget } from '@core/codegen'
import type { BuiltRequest } from '@core/request'
import { useT } from '../i18n'
import { CheckIcon, CopyIcon } from './Icons'
import './a11y.css'
import './CodePane.css'

const TARGETS: CodegenTarget[] = ['curl', 'fetch', 'python']

// Language and library names, not translated.
const TARGET_LABELS: Record<CodegenTarget, string> = {
  curl: 'curl',
  fetch: 'JavaScript fetch',
  python: 'Python requests'
}

/** Generated-code tab: the request as curl / fetch / python, ready to copy. */
export function CodePane({ getBuilt }: { getBuilt: () => BuiltRequest | null }) {
  const t = useT()
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
    return <div className="cv-dim">{t('request.code.empty')}</div>
  }

  return (
    <div className="code-pane">
      <div className="code-pane-bar">
        <div className="seg" role="group" aria-label={t('request.code.language')}>
          {TARGETS.map((tg) => (
            <button
              key={tg}
              type="button"
              className={target === tg ? 'on' : ''}
              aria-pressed={target === tg}
              onClick={() => setTarget(tg)}
            >
              {TARGET_LABELS[tg]}
            </button>
          ))}
        </div>
        <button type="button" className="btn" onClick={copy} title={t('request.code.copyTitle')}>
          {copied === 'ok' ? (
            <>
              <CheckIcon size={14} /> {t('common.copied')}
            </>
          ) : (
            <>
              <CopyIcon size={14} /> {t('common.copy')}
            </>
          )}
        </button>
        <span className="tg-sr-only" role="status" aria-live="polite">
          {copied === 'ok'
            ? t('request.code.snippetCopied', { target: TARGET_LABELS[target] })
            : copied === 'fail'
              ? t('request.code.copyFailed')
              : ''}
        </span>
      </div>
      <pre
        className="code-block"
        tabIndex={0}
        role="region"
        aria-label={t('request.code.region', { target: TARGET_LABELS[target] })}
      >
        {code}
      </pre>
    </div>
  )
}
