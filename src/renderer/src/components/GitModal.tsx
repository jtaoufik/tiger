import { useCallback, useEffect, useState } from 'react'
import { splitDiff } from '@core/diffView'
import type { GitBranches, GitCommit, GitStatus } from '../../../main/git'
import { Modal } from './Modal'
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CheckIcon,
  DownloadIcon,
  GitBranchIcon,
  RefreshIcon
} from './Icons'

interface Props {
  collectionName: string
  root: string
  onToast: (text: string) => void
  onClose: () => void
}

type Screen = 'loading' | 'no-electron' | 'no-git' | 'no-repo' | 'repo'

export function GitModal({ collectionName, root, onToast, onClose }: Props) {
  const [screen, setScreen] = useState<Screen>('loading')
  const [status, setStatus] = useState<GitStatus | null>(null)
  const [diff, setDiff] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [branches, setBranches] = useState<GitBranches | null>(null)
  const [log, setLog] = useState<GitCommit[]>([])
  const [newBranch, setNewBranch] = useState('')
  const [showHistory, setShowHistory] = useState(false)
  const [confirmDiscard, setConfirmDiscard] = useState(false)

  const refresh = useCallback(async () => {
    if (!window.tiger?.git) {
      setScreen('no-electron')
      return
    }
    const availability = await window.tiger.git.check()
    if (!availability.ok) {
      setScreen('no-git')
      return
    }
    const next = await window.tiger.git.status(root)
    setStatus(next)
    if (!next.isRepo) {
      setScreen('no-repo')
      return
    }
    setDiff(await window.tiger.git.diff(root))
    setBranches(await window.tiger.git.branches(root))
    setLog(await window.tiger.git.log(root))
    setScreen('repo')
  }, [root])

  useEffect(() => {
    refresh()
  }, [refresh])

  const act = useCallback(
    async (label: string, run: () => Promise<{ ok: boolean; message: string }>) => {
      setBusy(label)
      try {
        const result = await run()
        onToast(result.message || (result.ok ? 'Done' : `${label} failed`))
        await refresh()
      } finally {
        setBusy(null)
      }
    },
    [onToast, refresh]
  )

  return (
    <Modal title={`Git · ${collectionName}`} onClose={onClose} width={640}>
      {screen === 'loading' && <div style={{ color: 'var(--text-dim)' }}>Checking repository…</div>}

      {screen === 'no-electron' && (
        <div className="git-empty">
          <GitBranchIcon size={34} />
          <h3>Git sync lives in the desktop app</h3>
          <p>Open this collection in the Tiger desktop app to pull, push and review changes.</p>
        </div>
      )}

      {screen === 'no-git' && (
        <div className="git-empty">
          <GitBranchIcon size={34} />
          <h3>Git is not installed</h3>
          <p>
            Tiger uses the Git you already have to sync collections, so your SSH keys and
            credentials keep working. Install it once and come back, no restart needed.
          </p>
          <p className="git-hint">
            On macOS you can also run <code>xcode-select --install</code> in Terminal.
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className="btn accent"
              onClick={() => window.tiger?.openExternal?.('https://git-scm.com/downloads')}
            >
              <DownloadIcon size={14} /> Download Git
            </button>
            <button className="btn" onClick={refresh}>
              <RefreshIcon size={14} /> Check again
            </button>
          </div>
        </div>
      )}

      {screen === 'no-repo' && (
        <div className="git-empty">
          <GitBranchIcon size={34} />
          <h3>Not a Git repository yet</h3>
          <p>
            Turn this collection into a repository to track every change, review diffs and
            share it with your team.
          </p>
          <button
            className="btn accent"
            disabled={busy !== null}
            onClick={() => act('Initialize', () => window.tiger!.git.init(root))}
          >
            <GitBranchIcon size={14} /> Initialize repository
          </button>
        </div>
      )}

      {screen === 'repo' && status && (
        <>
          <div className="git-simple">
            <div className="git-summary">
              {status.dirtyCount > 0
                ? `You have ${status.dirtyCount} change${status.dirtyCount > 1 ? 's' : ''} not yet shared with the team.`
                : status.behind > 0
                  ? `Your team made ${status.behind} update${status.behind > 1 ? 's' : ''} you don't have yet.`
                  : status.ahead > 0
                    ? `${status.ahead} of your update${status.ahead > 1 ? 's are' : ' is'} ready to share.`
                    : 'Everything is in sync with your team.'}
            </div>
            <button
              className="btn accent"
              disabled={busy !== null}
              onClick={() => {
                act('Sync', () => window.tiger!.git.sync(root, message.trim()))
                setMessage('')
              }}
            >
              {busy === 'Sync' ? 'Syncing…' : 'Sync now'}
            </button>
          </div>
          <div className="git-head">
            <span className="git-branch">
              <GitBranchIcon size={14} /> {status.branch ?? 'detached'}
            </span>
            {status.ahead > 0 && (
              <span className="git-chip ahead" title={`${status.ahead} commit(s) to push`}>
                <ArrowUpIcon size={11} /> {status.ahead}
              </span>
            )}
            {status.behind > 0 && (
              <span className="git-chip behind" title={`${status.behind} commit(s) to pull`}>
                <ArrowDownIcon size={11} /> {status.behind}
              </span>
            )}
            {status.dirtyCount === 0 && status.ahead === 0 && status.behind === 0 && (
              <span className="git-chip synced">
                <CheckIcon size={11} /> Synced
              </span>
            )}
            <span style={{ flex: 1 }} />
            <button className="icon-btn" title="Refresh" onClick={refresh}>
              <RefreshIcon size={14} />
            </button>
            <button
              className="btn"
              disabled={busy !== null || !status.hasUpstream}
              title={status.hasUpstream ? 'git pull --ff-only' : 'No upstream configured'}
              onClick={() => act('Pull', () => window.tiger!.git.pull(root))}
            >
              {busy === 'Pull' ? 'Pulling…' : 'Pull'}
            </button>
            <button
              className="btn accent"
              disabled={busy !== null || (status.ahead === 0 && status.hasUpstream)}
              title={status.hasUpstream ? 'git push' : 'git push (sets upstream if configured)'}
              onClick={() => act('Push', () => window.tiger!.git.push(root))}
            >
              {busy === 'Push' ? 'Pushing…' : 'Push'}
            </button>
          </div>

          <div className="git-toolbar">
            <label className="git-branch-pick">
              <span className="cv-dim">Branch</span>
              <select
                value={branches?.current ?? ''}
                disabled={busy !== null}
                onChange={(e) =>
                  act('Switch', () => window.tiger!.git.checkout(root, e.target.value, false))
                }
              >
                {(branches?.all ?? []).map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </label>
            <input
              className="git-newbranch"
              placeholder="new branch name"
              value={newBranch}
              spellCheck={false}
              onChange={(e) => setNewBranch(e.target.value)}
            />
            <button
              className="btn"
              disabled={busy !== null || !newBranch.trim()}
              onClick={() => {
                act('Create', () => window.tiger!.git.checkout(root, newBranch.trim(), true))
                setNewBranch('')
              }}
            >
              Create
            </button>
            <span style={{ flex: 1 }} />
            <button className="btn ghost" onClick={() => setShowHistory((h) => !h)}>
              {showHistory ? 'Hide history' : 'History'}
            </button>
            {status.dirtyCount > 0 &&
              (confirmDiscard ? (
                <>
                  <span className="cv-dim">Discard everything?</span>
                  <button
                    className="btn danger"
                    disabled={busy !== null}
                    onClick={() => {
                      setConfirmDiscard(false)
                      act('Discard', () => window.tiger!.git.discard(root))
                    }}
                  >
                    Yes, discard
                  </button>
                  <button className="btn ghost" onClick={() => setConfirmDiscard(false)}>
                    Keep
                  </button>
                </>
              ) : (
                <button
                  className="btn ghost"
                  disabled={busy !== null}
                  title="Discard all uncommitted changes"
                  onClick={() => setConfirmDiscard(true)}
                >
                  Discard
                </button>
              ))}
          </div>

          {showHistory && (
            <div className="git-history">
              {log.length === 0 ? (
                <div className="cv-dim">No commits yet.</div>
              ) : (
                log.map((c) => (
                  <div className="git-commit-row" key={c.hash}>
                    <span className="git-hash">{c.hash}</span>
                    <span className="row-label">{c.subject}</span>
                    <span className="cv-dim">{c.author} · {c.at}</span>
                  </div>
                ))
              )}
            </div>
          )}

          {status.dirtyCount > 0 ? (
            <>
              <div className="section-label">
                {status.dirtyCount} changed file{status.dirtyCount > 1 ? 's' : ''}
              </div>
              <div className="git-files">
                {status.changedFiles.map((f) => (
                  <div className="git-file" key={f.path}>
                    <span className={`git-st st-${f.status[0]?.toLowerCase() ?? 'q'}`}>
                      {f.status}
                    </span>
                    <span className="row-label">{f.path}</span>
                  </div>
                ))}
              </div>
              <div className="git-commit">
                <input
                  placeholder="Describe your changes…"
                  value={message}
                  spellCheck={false}
                  onChange={(e) => setMessage(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && message.trim()) {
                      act('Commit', () => window.tiger!.git.commit(root, message.trim()))
                      setMessage('')
                    }
                  }}
                />
                <button
                  className="btn accent"
                  disabled={busy !== null || !message.trim()}
                  onClick={() => {
                    act('Commit', () => window.tiger!.git.commit(root, message.trim()))
                    setMessage('')
                  }}
                >
                  {busy === 'Commit' ? 'Committing…' : 'Commit all'}
                </button>
              </div>
            </>
          ) : (
            <div style={{ color: 'var(--text-dim)', margin: '6px 0 12px' }}>
              Working tree clean: every change is committed.
            </div>
          )}

          {diff.trim() && (
            <>
              <div className="section-label">Diff</div>
              <div className="git-diff">
                {splitDiff(diff).map((line, i) => (
                  <div key={i} className={`dl-${line.kind}`}>
                    {line.text || ' '}
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </Modal>
  )
}
