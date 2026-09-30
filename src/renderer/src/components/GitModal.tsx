import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { splitDiff } from '@core/diffView'
import type { GitBranches, GitCommit } from '../../../main/git'
import { setConflict, setupStep, summarizeSync, type ChangeItem } from '../gitUx'
import { actionLabel } from '../actions'
import { useT } from '../i18n'
import { Modal } from './Modal'
import {
  ChangeList,
  rich,
  ConflictPanel,
  DiscardConfirm,
  ErrorPanel,
  GitTerm,
  ProgressLine,
  SetupStepper,
  SyncBadge,
  useChangeGroups,
  useTeamSync,
  useVersionNote
} from './TeamSync'
import { ChevronIcon, DownloadIcon, HistoryIcon, RefreshIcon, SaveIcon, UndoIcon } from './Icons'
import './a11y.css'
import './GitModal.css'

interface Props {
  collectionName: string
  root: string
  onToast: (text: string) => void
  /**
   * Fired after a git op that can rewrite the working tree (pull, checkout,
   * discard, sync) succeeds, so App can drop its in-memory request cache for
   * this collection and reload from disk — otherwise a later Cmd+S overwrites
   * teammates' freshly pulled changes with stale in-memory copies.
   */
  onWorkingTreeChanged?: () => void
  /** Start a sync as soon as the collection is ready (the "Sync with team" command). */
  autoSync?: boolean
  onClose: () => void
}

/**
 * Team sync for one collection. Plain words first: status, one Sync button,
 * the changes as requests, a suggested version note. Setup is a 3-step guide;
 * a conflict shows both versions per request. Git power (version lines,
 * separate get/share, full diff) lives under Advanced.
 */
export function GitModal({
  collectionName,
  root,
  onToast,
  onWorkingTreeChanged,
  autoSync = false,
  onClose
}: Props) {
  const t = useT()
  const uid = useId()
  const state = useTeamSync(root, { onToast, onWorkingTreeChanged })
  const { status, availability, busy } = state
  const groups = useChangeGroups(root, status)
  const note = useVersionNote(groups)
  const [log, setLog] = useState<GitCommit[]>([])
  const [branches, setBranches] = useState<GitBranches | null>(null)
  const [fullDiff, setFullDiff] = useState('')
  const [advanced, setAdvanced] = useState(false)
  const [newBranch, setNewBranch] = useState('')
  const [discarding, setDiscarding] = useState<ChangeItem[] | null>(null)
  const [undo, setUndo] = useState<{ token: string; text: string } | null>(null)

  const loadDetails = useCallback(async () => {
    if (!window.tiger?.git || !status?.isRepo) return
    setLog(await window.tiger.git.log(root))
    setBranches(await window.tiger.git.branches(root))
    if (advanced) setFullDiff(await window.tiger.git.diff(root))
  }, [root, status, advanced])

  useEffect(() => {
    void loadDetails()
  }, [loadDetails])

  const summary = summarizeSync(status, { conflict: state.conflict })
  const step = setupStep(status)
  const allItems = [...groups.changed, ...groups.added, ...groups.removed]
  const isBusy = busy !== null

  const doSync = async (): Promise<void> => {
    const result = await state.sync(note.note)
    if (result?.ok) note.reset()
  }

  // "Sync with team" from the menu or palette: sync once, as soon as it can.
  const autoSynced = useRef(false)
  useEffect(() => {
    if (!autoSync || autoSynced.current || availability !== 'ready' || !status) return
    autoSynced.current = true
    if (setupStep(status) === null && !state.conflict) void doSync()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSync, availability, status])

  const saveVersion = async (): Promise<void> => {
    const result = await state.run(t('team.modal.savingVersion'), () =>
      window.tiger!.git.commit(root, note.note.trim())
    )
    if (result?.ok) note.reset()
  }

  const discard = async (items: ChangeItem[]): Promise<void> => {
    setDiscarding(null)
    const everything = items.length === allItems.length
    const result = await state.run(
      t('team.modal.discarding'),
      () => window.tiger!.git.discard(root, everything ? undefined : items.map((i) => i.path)),
      { mutates: true, quiet: true }
    )
    if (result?.ok) {
      const text =
        items.length === 1
          ? t('team.modal.discardedOne', { name: items[0].name })
          : t('team.modal.discardedMany', { count: items.length })
      onToast(text)
      setUndo(result.undoToken ? { token: result.undoToken, text } : null)
    }
  }

  const undoDiscard = async (): Promise<void> => {
    if (!undo) return
    const token = undo.token
    setUndo(null)
    await state.run(
      t('team.modal.restoring'),
      () => window.tiger!.git.undoDiscard(root, token),
      {
        mutates: true
      }
    )
  }

  const resolve = async (
    prefer: 'mine' | 'theirs',
    choices?: Record<string, 'mine' | 'theirs'>
  ): Promise<void> => {
    const result = await state.run(
      t('team.modal.combining'),
      () => window.tiger!.git.syncResolve(root, prefer, note.note.trim(), choices),
      { mutates: true }
    )
    if (result?.ok) {
      setConflict(root, false)
      note.reset()
    }
  }

  return (
    <Modal
      title={`${actionLabel('team-sync')} · ${collectionName}`}
      onClose={onClose}
      width={680}
      className="git-modal"
    >
      {availability === 'loading' && (
        <div className="cv-dim" role="status">
          {t('team.modal.checking')}
        </div>
      )}

      {availability === 'browser' && (
        <div className="git-empty">
          <h3>{t('team.modal.browserTitle')}</h3>
          <p>{t('team.modal.browserText')}</p>
        </div>
      )}

      {availability === 'no-git' && (
        <div className="git-empty">
          <h3>{t('team.modal.noGitTitle')}</h3>
          <p>{t('team.modal.noGitText')}</p>
          <p className="git-hint">  {/* i18n-ignore: command in code tag */}
            {rich(t('team.modal.noGitMac'), { command: <code>xcode-select --install</code> })}
          </p>
          <div className="ts-row">
            <button
              type="button"
              className="btn accent"
              onClick={() => window.tiger?.openExternal?.('https://git-scm.com/downloads')}
            >
              <DownloadIcon size={14} /> {t('team.modal.downloadGit')}
            </button>
            <button type="button" className="btn" onClick={state.refresh}>
              <RefreshIcon size={14} /> {t('team.modal.checkAgain')}
            </button>
          </div>
        </div>
      )}

      {availability === 'ready' && status && (
        <>
          <div className={`ts-status tone-${summary.tone}`}>
            <div className="ts-status-text">
              <SyncBadge summary={summary} />
              <p>{summary.detail}</p>
            </div>
            {step === null && !state.conflict && (
              <div className="ts-status-actions">
                <button
                  type="button"
                  className="btn accent ts-sync"
                  disabled={isBusy}
                  onClick={doSync}
                >
                  <RefreshIcon size={14} /> {actionLabel('sync')}
                </button>
                <span className="ts-term">{t('team.modal.syncTerm')}</span>
              </div>
            )}
            {status.isRepo && status.hasRemote && (
              <button
                type="button"
                className="icon-btn ts-check"
                title={t('team.modal.checkUpdates')}
                aria-label={t('team.modal.checkUpdates')}
                disabled={isBusy}
                onClick={() =>
                  state.run(t('team.modal.checkingUpdates'), () => window.tiger!.git.fetch(root), {
                    quiet: true
                  })
                }
              >
                <RefreshIcon size={14} />
              </button>
            )}
          </div>
          <ProgressLine text={busy} />

          {state.error && (
            <ErrorPanel
              error={state.error}
              root={root}
              onRetry={() => {
                state.setError(null)
                void (step === null ? doSync() : state.refresh())
              }}
              onDismiss={() => state.setError(null)}
            />
          )}

          {undo && (
            <div className="ts-undo" role="status">
              <span>{undo.text}</span>
              <button type="button" className="btn" onClick={undoDiscard}>
                <UndoIcon size={14} /> {t('team.modal.undo')}
              </button>
            </div>
          )}

          {state.conflict && (
            <ConflictPanel
              root={root}
              busy={isBusy}
              onResolve={resolve}
              onLater={() => onClose()}
            />
          )}

          <SetupStepper root={root} state={state} />

          {status.dirtyCount > 0 && (
            <section className="ts-changes" aria-labelledby={`${uid}-changes`}>
              <div className="ts-section-head">
                <h3 className="ts-h" id={`${uid}-changes`}>
                  {t('team.modal.yourChanges')}
                </h3>
                <button
                  type="button"
                  className="btn ghost ts-discard-all"
                  disabled={isBusy}
                  onClick={() => setDiscarding(allItems)}
                >
                  {t('team.modal.discardAll')}
                </button>
              </div>
              <ChangeList root={root} groups={groups} busy={isBusy} onDiscard={setDiscarding} />
              {status.isRepo && (
                <div className="ts-note">
                  <label htmlFor={`${uid}-note`}>
                    {t('team.modal.describe')} <GitTerm>commit message</GitTerm> {/* i18n-ignore: git term */}
                  </label>
                  <input
                    id={`${uid}-note`}
                    value={note.note}
                    spellCheck={false}
                    aria-describedby={`${uid}-note-hint`}
                    onChange={(e) => note.setNote(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !isBusy && !state.conflict)
                        void (step === null ? doSync() : saveVersion())
                    }}
                  />
                  <div className="ts-hint" id={`${uid}-note-hint`}>
                    {note.suggested
                      ? t('team.modal.suggested')
                      : t('team.modal.shownInHistory')}
                  </div>
                  <div className="ts-row">
                    <button
                      type="button"
                      className="btn"
                      disabled={isBusy || !note.note.trim()}
                      onClick={saveVersion}
                      title={t('team.modal.saveTitle')}
                    >
                      <SaveIcon size={14} /> {actionLabel('save-version')}
                    </button>
                    <span className="ts-term">{t('team.modal.saveTerm')}</span>
                  </div>
                </div>
              )}
            </section>
          )}

          {status.isRepo && log.length > 0 && (
            <section className="ts-history" aria-labelledby={`${uid}-hist`}>
              <h3 className="ts-h" id={`${uid}-hist`}>
                <HistoryIcon size={14} /> {t('team.modal.recent')}
              </h3>
              <ul>
                {log.slice(0, advanced ? log.length : 5).map((c) => (
                  <li key={c.hash}>
                    <span className="row-label">{c.subject}</span>
                    <span className="cv-dim">
                      {c.author} · {c.at}
                    </span>
                    {advanced && <span className="git-hash">{c.hash}</span>}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {status.isRepo && (
            <>
              <button
                type="button"
                className="btn ghost adv-toggle"
                aria-expanded={advanced}
                aria-controls={`${uid}-adv`}
                onClick={() => setAdvanced((a) => !a)}
              >
                <ChevronIcon size={13} className={`chev ${advanced ? 'open' : ''}`} />{' '}
                {t('team.modal.advanced')}{' '}
                <span className="ts-term">{t('team.modal.forGitUsers')}</span>
              </button>
              {advanced && (
                <div className="git-advanced" id={`${uid}-adv`}>
                  <div className="ts-adv-block">
                    <h4>
                      {t('team.modal.versionLine')} <GitTerm>branch</GitTerm> {/* i18n-ignore: git term */}
                    </h4>
                    <p className="ts-hint">{t('team.modal.versionLineHelp')}</p>
                    <div className="git-toolbar">
                      <label className="git-branch-pick">
                        <span className="cv-dim">{t('team.modal.current')}</span>
                        <select
                          value={branches?.current ?? ''}
                          disabled={isBusy}
                          onChange={(e) => {
                            const target = e.target.value
                            void state.run(
                              t('team.modal.switching', { branch: target }),
                              () => window.tiger!.git.checkout(root, target, false),
                              {
                                mutates: true
                              }
                            )
                          }}
                        >
                          {(branches?.all ?? []).map((b) => (
                            <option key={b} value={b}>
                              {b}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="tg-sr-only" htmlFor={`${uid}-branch`}>
                        {t('team.modal.newLineLabel')}
                      </label>
                      <input
                        id={`${uid}-branch`}
                        className="git-newbranch"
                        placeholder={t('team.modal.newLinePlaceholder')}
                        value={newBranch}
                        spellCheck={false}
                        onChange={(e) => setNewBranch(e.target.value)}
                      />
                      <button
                        type="button"
                        className="btn"
                        disabled={isBusy || !newBranch.trim()}
                        onClick={() => {
                          const name = newBranch.trim()
                          setNewBranch('')
                          void state.run(t('team.modal.creating', { branch: name }), () =>
                            window.tiger!.git.checkout(root, name, true)
                          )
                        }}
                      >
                        {t('team.modal.createSwitch')}
                      </button>
                    </div>
                  </div>

                  <div className="ts-adv-block">
                    <h4>{t('team.modal.oneStep')}</h4>
                    <div className="ts-row">
                      <button
                        type="button"
                        className="btn"
                        disabled={isBusy || !status.hasUpstream}
                        title={status.hasUpstream ? t('team.modal.fastForward') : t('team.modal.shareOnceFirst')}
                        onClick={() =>
                          state.run(t('team.modal.gettingTeam'), () => window.tiger!.git.pull(root), {
                            mutates: true
                          })
                        }
                      >
                        {t('team.modal.getOnly')} <GitTerm>pull --ff-only</GitTerm> {/* i18n-ignore: git term */}
                      </button>
                      <button
                        type="button"
                        className="btn"
                        disabled={
                          isBusy || !status.hasRemote || (status.ahead === 0 && status.hasUpstream)
                        }
                        onClick={() =>
                          state.run(t('team.modal.sharingVersions'), () => window.tiger!.git.push(root))
                        }
                      >
                        {t('team.modal.shareOnly')} <GitTerm>push</GitTerm> {/* i18n-ignore: git term */}
                      </button>
                    </div>
                  </div>

                  {fullDiff.trim() && (
                    <div className="ts-adv-block">
                      <h4>
                        {t('team.modal.allUnsaved')} <GitTerm>diff HEAD</GitTerm> {/* i18n-ignore: git term */}
                      </h4>
                      <div
                        className="git-diff"
                        role="region"
                        aria-label={t('team.modal.allUnsavedDiff')}
                        tabIndex={0}
                      >
                        {splitDiff(fullDiff).map((line, i) => (
                          <div key={i} className={`dl-${line.kind}`}>
                            {line.text || ' '}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </>
      )}

      {discarding && (
        <DiscardConfirm
          items={discarding}
          groups={groups}
          onCancel={() => setDiscarding(null)}
          onConfirm={() => void discard(discarding)}
        />
      )}
    </Modal>
  )
}
