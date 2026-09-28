import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { GitModal } from '../../src/renderer/src/components/GitModal'
import { JoinTeamModal } from '../../src/renderer/src/components/TeamSync'
import { setConflict } from '../../src/renderer/src/gitUx'
import type { GitActionResult, GitStatus } from '../../src/main/git'

const ROOT = '/work/payments-api'

const clean: GitStatus = {
  isRepo: true,
  branch: 'main',
  dirtyCount: 0,
  changedFiles: [],
  ahead: 0,
  behind: 0,
  hasUpstream: true,
  hasRemote: true
}

const dirty: GitStatus = {
  ...clean,
  dirtyCount: 3,
  changedFiles: [
    { status: 'M', path: 'users/get-user.tiger' },
    { status: '??', path: 'posts/create-post.tiger' },
    { status: 'D', path: 'users/delete-user.tiger' }
  ]
}

const NAMES: Record<string, string> = {
  'users/get-user.tiger': 'Get user',
  'posts/create-post.tiger': 'Create post',
  'users/delete-user.tiger': 'Delete user'
}

/** A fake bridge whose status the test changes as git calls succeed. */
function bridge(initial: GitStatus) {
  let status = initial
  const ok = (message = 'Done') => Promise.resolve({ ok: true, message })
  const git = {
    check: vi.fn(() => Promise.resolve({ ok: true, version: '2.45' })),
    status: vi.fn(() => Promise.resolve(status)),
    diff: vi.fn(() => Promise.resolve('')),
    diffFile: vi.fn(() =>
      Promise.resolve('@@ -1 +1 @@\n-  url: /users/1\n+  url: /users/{{id}}\n')
    ),
    requestNames: vi.fn((_root: string, paths: string[]) =>
      Promise.resolve(Object.fromEntries(paths.map((p) => [p, NAMES[p] ?? p])))
    ),
    log: vi.fn(() => Promise.resolve([])),
    branches: vi.fn(() => Promise.resolve({ current: 'main', all: ['main'] })),
    init: vi.fn(() => {
      status = { ...clean, hasRemote: false, hasUpstream: false }
      return ok('Version tracking is on')
    }),
    setRemote: vi.fn(() => {
      status = { ...clean, hasUpstream: false }
      return Promise.resolve({ ok: true, message: 'Connected', remoteHasContent: false })
    }),
    sync: vi.fn((): Promise<GitActionResult> => {
      status = clean
      return Promise.resolve({ ok: true, message: 'ok', received: 0, sent: 1 })
    }),
    syncResolve: vi.fn(() => {
      status = clean
      return ok('Done: your choices were applied and shared with the team.')
    }),
    conflicts: vi.fn(() =>
      Promise.resolve([
        {
          path: 'users/get-user.tiger',
          name: 'Get user',
          mine: 'get {\n  url: /users/{{id}}\n}\n',
          theirs: 'get {\n  url: /v2/users/1\n}\n'
        }
      ])
    ),
    discard: vi.fn(() =>
      Promise.resolve({ ok: true, message: 'Discarded', undoToken: 'f'.repeat(40) })
    ),
    undoDiscard: vi.fn(() => ok('Changes restored')),
    setIdentity: vi.fn(() => ok('Versions will be saved as Pat')),
    commit: vi.fn(() => ok('Saved')),
    fetch: vi.fn(() => ok('Refreshed')),
    pull: vi.fn(() => ok()),
    push: vi.fn(() => ok()),
    checkout: vi.fn(() => ok()),
    onProgress: vi.fn(() => () => {}),
    clone: vi.fn()
  }
  ;(window as { tiger?: unknown }).tiger = { git, openExternal: vi.fn() }
  return { git, setStatus: (s: GitStatus) => (status = s) }
}

function open(onToast = vi.fn()) {
  render(<GitModal collectionName="Payments API" root={ROOT} onToast={onToast} onClose={vi.fn()} />)
  return onToast
}

beforeEach(() => {
  document.body.innerHTML = ''
})
afterEach(() => {
  delete (window as { tiger?: unknown }).tiger
  setConflict(ROOT, false)
})

describe('Share this collection: the 3-step setup', () => {
  it('walks track, connect (with URL validation), first sync', async () => {
    const { git } = bridge({ ...clean, isRepo: false, hasRemote: false, hasUpstream: false })
    const toast = open()

    expect(await screen.findByText('Not tracked')).toBeInTheDocument()
    const current = () => document.querySelector('[aria-current="step"]')!
    expect(
      within(current() as HTMLElement).getByText('Turn on version tracking', { selector: 'b' })
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Turn on version tracking' }))
    await waitFor(() => expect(git.init).toHaveBeenCalledWith(ROOT))
    expect(await screen.findByLabelText('Repository address')).toBeInTheDocument()
    expect(toast).toHaveBeenCalledWith('Version tracking is on')

    const input = screen.getByLabelText('Repository address')
    const connect = screen.getByRole('button', { name: 'Connect' })
    expect(connect).toBeDisabled()
    fireEvent.change(input, { target: { value: 'github.com/team/payments-api/tree/main' } })
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(connect).toBeDisabled()
    fireEvent.click(
      screen.getByRole('button', { name: 'Use https://github.com/team/payments-api.git' })
    )
    expect(input).toHaveValue('https://github.com/team/payments-api.git')
    expect(connect).toBeEnabled()

    fireEvent.click(connect)
    await waitFor(() =>
      expect(git.setRemote).toHaveBeenCalledWith(ROOT, 'https://github.com/team/payments-api.git')
    )
    const share = await screen.findByRole('button', { name: 'Share now' })
    fireEvent.click(share)
    await waitFor(() =>
      expect(git.sync).toHaveBeenCalledWith(ROOT, 'Share collection with the team')
    )
    await waitFor(() => expect(toast).toHaveBeenCalledWith('Synced: 1 update sent.'))
    expect(await screen.findByText('Up to date')).toBeInTheDocument()
  })
})

describe('"Sync with team" command', () => {
  it('syncs once as soon as the dialog is ready', async () => {
    const { git } = bridge({ ...clean, behind: 2 })
    const toast = vi.fn()
    render(
      <GitModal collectionName="Payments API" root={ROOT} onToast={toast} autoSync onClose={vi.fn()} />
    )
    await waitFor(() => expect(toast).toHaveBeenCalledWith('Synced: 1 update sent.'))
    expect(git.sync).toHaveBeenCalledTimes(1)
  })

  it('does not sync a collection that is not set up yet', async () => {
    const { git } = bridge({ ...clean, isRepo: false, hasRemote: false, hasUpstream: false })
    render(
      <GitModal collectionName="Payments API" root={ROOT} onToast={vi.fn()} autoSync onClose={vi.fn()} />
    )
    expect(await screen.findByText('Not tracked')).toBeInTheDocument()
    expect(git.sync).not.toHaveBeenCalled()
  })
})

describe('Your changes', () => {
  it('groups requests by Added / Changed / Removed and suggests the version note', async () => {
    const { git } = bridge(dirty)
    open()
    expect(await screen.findByText('3 local changes')).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: /^Get user/ })).toHaveAttribute(
      'title',
      'users/get-user.tiger'
    )
    for (const heading of ['Added', 'Changed', 'Removed']) {
      expect(screen.getByRole('heading', { name: new RegExp(`^${heading}`) })).toBeInTheDocument()
    }
    const note = screen.getByLabelText(/Describe this version/)
    await waitFor(() =>
      expect(note).toHaveValue('Update Get user, add Create post, remove Delete user')
    )

    fireEvent.change(note, { target: { value: 'Point Get user at the id variable' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sync with team' }))
    await waitFor(() =>
      expect(git.sync).toHaveBeenCalledWith(ROOT, 'Point Get user at the id variable')
    )
  })

  it('shows one request diff on click', async () => {
    const { git } = bridge(dirty)
    open()
    const row = await screen.findByRole('button', { name: /^Get user/ })
    fireEvent.click(row)
    expect(row).toHaveAttribute('aria-expanded', 'true')
    await waitFor(() => expect(git.diffFile).toHaveBeenCalledWith(ROOT, 'users/get-user.tiger'))
    expect(await screen.findByRole('region', { name: 'Changes in Get user' })).toHaveTextContent(
      '/users/{{id}}'
    )
  })
})

describe('Discard', () => {
  it('asks first, naming what is lost, then offers undo', async () => {
    const { git } = bridge(dirty)
    open()
    await screen.findByRole('button', { name: /^Create post/ })
    fireEvent.click(screen.getByRole('button', { name: 'Discard all…' }))
    const dialog = await screen.findByRole('alertdialog', { name: 'Discard 3 changes?' })
    expect(within(dialog).getByText('Create post').parentElement).toHaveTextContent(
      'new, will be deleted'
    )
    expect(within(dialog).getByText('Delete user').parentElement).toHaveTextContent(
      'removed, will come back'
    )
    expect(git.discard).not.toHaveBeenCalled()

    fireEvent.click(within(dialog).getByRole('button', { name: 'Discard 3 changes' }))
    await waitFor(() => expect(git.discard).toHaveBeenCalledWith(ROOT, undefined))
    const undo = await screen.findByRole('button', { name: 'Undo' })
    expect(screen.getByText('Discarded 3 changes.', { selector: 'span' })).toBeInTheDocument()
    fireEvent.click(undo)
    await waitFor(() => expect(git.undoDiscard).toHaveBeenCalledWith(ROOT, 'f'.repeat(40)))
  })

  it('discards a single request only after confirming, and Cancel keeps it', async () => {
    const { git } = bridge(dirty)
    open()
    fireEvent.click(await screen.findByRole('button', { name: 'Discard changes to Get user' }))
    let dialog = await screen.findByRole('alertdialog', { name: 'Discard changes to Get user?' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(git.discard).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Discard changes to Get user' }))
    dialog = await screen.findByRole('alertdialog', { name: 'Discard changes to Get user?' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Discard' }))
    await waitFor(() => expect(git.discard).toHaveBeenCalledWith(ROOT, ['users/get-user.tiger']))
  })
})

describe('Conflicts', () => {
  it('shows both versions per request and resolves with the per-request choice', async () => {
    const { git } = bridge(dirty)
    git.sync.mockImplementationOnce(() =>
      Promise.resolve({
        ok: false,
        conflict: true,
        message: 'You and a teammate changed the same thing.'
      })
    )
    open()
    fireEvent.click(await screen.findByRole('button', { name: 'Sync with team' }))
    expect(await screen.findByText('Conflict: needs a decision')).toBeInTheDocument()
    const item = (await screen.findByRole('group', { name: 'Get user' })) as HTMLElement
    expect(within(item).getByLabelText('Your version')).toHaveTextContent('/users/{{id}}')
    expect(within(item).getByLabelText("Team's version")).toHaveTextContent('/v2/users/1')

    const finish = screen.getByRole('button', { name: 'Finish sync' })
    expect(finish).toBeDisabled()
    fireEvent.click(within(item).getByRole('button', { name: /Keep mine/ }))
    expect(within(item).getByRole('button', { name: /Keep mine/ })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
    fireEvent.click(finish)
    await waitFor(() =>
      expect(git.syncResolve).toHaveBeenCalledWith(ROOT, 'mine', expect.any(String), {
        'users/get-user.tiger': 'mine'
      })
    )
    expect(await screen.findByText('Up to date')).toBeInTheDocument()
  })
})

describe('Errors stay on screen with what to do', () => {
  it('explains a sign-in failure with steps and links', async () => {
    const { git } = bridge(clean)
    git.sync.mockImplementationOnce(() =>
      Promise.resolve({
        ok: false,
        code: 'auth-required',
        message: "Could not get the team's changes: Authentication required."
      })
    )
    open()
    fireEvent.click(await screen.findByRole('button', { name: 'Sync with team' }))
    const title = await screen.findByText('Sign-in needed to reach this repository')
    const alert = title.closest('[role="alert"]') as HTMLElement
    expect(alert).toHaveAccessibleName('Sign-in needed to reach this repository')
    expect(alert).toHaveTextContent('Install Git Credential Manager')
    expect(
      within(alert).getByRole('button', { name: 'GitHub: create a personal access token' })
    ).toBeInTheDocument()
    expect(within(alert).getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })

  it('asks for name and email when git has no identity, then retries', async () => {
    const { git } = bridge(dirty)
    git.sync.mockImplementationOnce(() =>
      Promise.resolve({
        ok: false,
        code: 'identity',
        message: 'Could not save your changes: Git needs your name.'
      })
    )
    open()
    fireEvent.click(await screen.findByRole('button', { name: 'Sync with team' }))
    fireEvent.change(await screen.findByLabelText('Your name'), { target: { value: 'Pat' } })
    fireEvent.change(screen.getByLabelText('Work email'), { target: { value: 'pat@example.com' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save and try again' }))
    })
    expect(git.setIdentity).toHaveBeenCalledWith(ROOT, 'Pat', 'pat@example.com')
    await waitFor(() => expect(git.sync).toHaveBeenCalledTimes(2))
  })
})

describe('Join a team collection', () => {
  it('keeps the dialog open with the fix when access fails, then opens the collection', async () => {
    const { git } = bridge(clean)
    git.clone
      .mockResolvedValueOnce({ error: 'Repository not found.', code: 'not-found' })
      .mockResolvedValueOnce({
        root: '/work/api',
        name: 'api',
        requests: [],
        environments: [],
        settings: {}
      })
    const onJoined = vi.fn()
    render(<JoinTeamModal onCancel={vi.fn()} onJoined={onJoined} />)

    const join = screen.getByRole('button', { name: 'Choose folder and join' })
    const input = screen.getByLabelText('1. Repository address')
    fireEvent.change(input, { target: { value: 'https://github.com/team' } })
    expect(join).toBeDisabled()
    expect(screen.getByText(/account page/)).toBeInTheDocument()

    fireEvent.change(input, { target: { value: 'https://github.com/team/api.git' } })
    fireEvent.click(join)
    expect(await screen.findByText('Repository not found', { selector: 'b' })).toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'Join a team collection' })).toBeInTheDocument()
    expect(onJoined).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await waitFor(() =>
      expect(onJoined).toHaveBeenCalledWith(expect.objectContaining({ name: 'api' }))
    )
    expect(git.clone).toHaveBeenCalledWith('https://github.com/team/api.git')
  })
})
