import { afterEach, describe, expect, it } from 'vitest'
import { setLocale } from '../../src/renderer/src/i18n'
import {
  changeName,
  errorHelp,
  groupChanges,
  hasConflict,
  markDifferences,
  setConflict,
  setupStep,
  suggestCommitMessage,
  summarizeSync,
  syncResultText,
  validateRepoUrl,
  type SyncInput
} from '../../src/renderer/src/gitUx'

const clean: SyncInput = {
  isRepo: true,
  dirtyCount: 0,
  ahead: 0,
  behind: 0,
  hasRemote: true,
  hasUpstream: true
}

describe('summarizeSync', () => {
  it('says "Not tracked" before git init', () => {
    const s = summarizeSync({ ...clean, isRepo: false })
    expect(s).toMatchObject({ kind: 'untracked', label: 'Not tracked' })
  })

  it('puts a pending conflict above everything else', () => {
    const s = summarizeSync({ ...clean, dirtyCount: 3, behind: 2 }, { conflict: true })
    expect(s.label).toBe('Conflict: needs a decision')
    expect(s.tone).toBe('danger')
  })

  it('reports team updates first, and mentions local work when both moved', () => {
    expect(summarizeSync({ ...clean, behind: 2 }).label).toBe('2 updates from team')
    expect(summarizeSync({ ...clean, behind: 1 }).label).toBe('1 update from team')
    expect(summarizeSync({ ...clean, behind: 2, dirtyCount: 1 }).detail).toMatch(/so did you/)
  })

  it('counts local changes, then versions waiting to be shared', () => {
    expect(summarizeSync({ ...clean, dirtyCount: 3 }).label).toBe('3 local changes')
    expect(summarizeSync({ ...clean, dirtyCount: 3 }).short).toBe('3')
    expect(summarizeSync(clean).short).toBe('')
    expect(summarizeSync({ ...clean, ahead: 1 }).label).toBe('1 version to share')
  })

  it('distinguishes "only on this computer" and "not shared yet" from "up to date"', () => {
    expect(summarizeSync({ ...clean, hasRemote: false, hasUpstream: false }).label).toBe(
      'Only on this computer'
    )
    expect(summarizeSync({ ...clean, hasUpstream: false }).label).toBe('Not shared yet')
    expect(summarizeSync(clean)).toMatchObject({
      kind: 'up-to-date',
      label: 'Up to date',
      tone: 'ok'
    })
  })

  it('treats the sidebar poll (no remote info) as shared', () => {
    expect(summarizeSync({ isRepo: true, dirtyCount: 0, ahead: 0, behind: 0 }).label).toBe(
      'Up to date'
    )
  })

  it('never contains an em dash', () => {
    const states: SyncInput[] = [
      clean,
      { ...clean, dirtyCount: 2 },
      { ...clean, behind: 1 },
      { ...clean, isRepo: false }
    ]
    for (const s of states) expect(JSON.stringify(summarizeSync(s))).not.toContain('—')
  })
})

describe('setupStep', () => {
  it('walks track, connect, first sync, done', () => {
    expect(setupStep(null)).toBe(1)
    expect(setupStep({ ...clean, isRepo: false })).toBe(1)
    expect(setupStep({ ...clean, hasRemote: false })).toBe(2)
    expect(setupStep({ ...clean, hasUpstream: false })).toBe(3)
    expect(setupStep(clean)).toBeNull()
  })
})

describe('groupChanges', () => {
  const files = [
    { status: 'M', path: 'users/get-user.tiger' },
    { status: '??', path: 'posts/create-post.tiger' },
    { status: 'A', path: 'posts/list-posts.tiger' },
    { status: 'D', path: 'users/delete-user.tiger' },
    { status: 'M', path: 'environments/demo.tiger' },
    { status: 'M', path: 'collection.tiger' }
  ]
  const names = {
    'users/get-user.tiger': 'Get user',
    'posts/create-post.tiger': 'Create post',
    'posts/list-posts.tiger': 'List posts',
    'users/delete-user.tiger': 'Delete user',
    'environments/demo.tiger': 'Demo'
  }

  it('groups by Added / Changed / Removed with request names, paths kept', () => {
    const g = groupChanges(files, names)
    expect(g.added.map((i) => i.name)).toEqual(['Create post', 'List posts'])
    expect(g.changed.map((i) => i.name)).toEqual([
      'Collection settings',
      'Demo environment',
      'Get user'
    ])
    expect(g.removed).toEqual([
      { path: 'users/delete-user.tiger', name: 'Delete user', folder: 'users' }
    ])
  })

  it('falls back to the file name when a name is unknown', () => {
    expect(changeName('users/get-user.tiger')).toBe('get-user')
    expect(changeName('users/folder.tiger')).toBe('users folder settings')
  })
})

describe('suggestCommitMessage', () => {
  const item = (name: string) => ({ path: `${name}.tiger`, name, folder: '' })

  it('writes "Update X, add Y" from the changes', () => {
    expect(
      suggestCommitMessage({
        changed: [item('Get user')],
        added: [item('Create post')],
        removed: []
      })
    ).toBe('Update Get user, add Create post')
  })

  it('joins two names and summarises longer lists', () => {
    expect(
      suggestCommitMessage({ changed: [item('A'), item('B')], added: [], removed: [item('C')] })
    ).toBe('Update A and B, remove C')
    expect(
      suggestCommitMessage({
        changed: [],
        added: [item('A'), item('B'), item('C'), item('D')],
        removed: []
      })
    ).toBe('Add A, B and 2 more')
  })

  it('switches to counts when names would not fit one line', () => {
    const long = (n: string) => item(`${n} with a very long descriptive request name`)
    const msg = suggestCommitMessage({
      changed: [long('One'), long('Two')],
      added: [long('Three')],
      removed: []
    })
    expect(msg).toBe('Update 2 requests, add 1 request')
  })

  it('is empty when nothing changed', () => {
    expect(suggestCommitMessage({ changed: [], added: [], removed: [] })).toBe('')
  })
})

describe('validateRepoUrl', () => {
  it('accepts https, ssh and scp-style addresses', () => {
    expect(validateRepoUrl('https://github.com/team/api.git').ok).toBe(true)
    expect(validateRepoUrl('https://gitlab.com/group/sub/api.git').ok).toBe(true)
    expect(validateRepoUrl('git@github.com:team/api.git').ok).toBe(true)
    expect(validateRepoUrl('ssh://git@host:2222/team/api.git').ok).toBe(true)
    expect(validateRepoUrl('https://git.company.local/scm/api.git').ok).toBe(true)
  })

  it('shows nothing while empty', () => {
    expect(validateRepoUrl('  ')).toEqual({ ok: false })
  })

  it('offers a one-click fix for a missing https://', () => {
    expect(validateRepoUrl('github.com/team/api')).toMatchObject({
      ok: false,
      fix: 'https://github.com/team/api.git'
    })
  })

  it('turns a page inside the repository into the repository address', () => {
    const check = validateRepoUrl('https://github.com/team/api/tree/main/docs')
    expect(check.ok).toBe(false)
    expect(check.message).toMatch(/page inside the repository/)
    expect(check.fix).toBe('https://github.com/team/api.git')
    expect(validateRepoUrl('https://gitlab.com/group/sub/api/-/tree/main').fix).toBe(
      'https://gitlab.com/group/sub/api.git'
    )
  })

  it('explains where to copy it from when it is not an address', () => {
    expect(validateRepoUrl('payments api').message).toMatch(/no spaces/)
    expect(validateRepoUrl('payments').message).toMatch(/Code button/)
    expect(validateRepoUrl('https://github.com/team').message).toMatch(/account page/)
  })
})

describe('errorHelp', () => {
  it('points Windows users at Git Credential Manager in Git for Windows', () => {
    const help = errorHelp('auth-required', 'windows')!
    expect(help.steps.join(' ')).toMatch(/Git for Windows includes Git Credential Manager/)
    expect(help.links.map((l) => l.url)).toContain('https://gitforwindows.org/')
  })

  it('points macOS users at GCM or a personal access token, with links', () => {
    const help = errorHelp('auth-required', 'mac')!
    expect(help.steps[0]).toMatch(/Install Git Credential Manager/)
    expect(help.links.some((l) => /personal-access-tokens/.test(l.url))).toBe(true)
  })

  it('tells people with a refused password to use a token and clear the saved one', () => {
    expect(errorHelp('auth-failed', 'mac')!.steps.join(' ')).toMatch(/Keychain Access/)
    expect(errorHelp('auth-failed', 'windows')!.steps.join(' ')).toMatch(
      /Windows Credential Manager/
    )
  })

  it('covers SSH keys, missing repositories and the network', () => {
    expect(errorHelp('ssh-key', 'linux')!.steps.join(' ')).toMatch(/ssh-add/)
    expect(errorHelp('not-found', 'mac')!.title).toBe('Repository not found')
    expect(errorHelp('network', 'mac')!.title).toBe('Could not reach the server')
    expect(errorHelp(undefined, 'mac')).toBeNull()
  })
})

describe('syncResultText', () => {
  it('says what happened', () => {
    expect(syncResultText({ ok: true, message: 'x', received: 2, sent: 3 })).toBe(
      'Synced: 2 updates received, 3 sent.'
    )
    expect(syncResultText({ ok: true, message: 'x', received: 0, sent: 1 })).toBe(
      'Synced: 1 update sent.'
    )
    expect(syncResultText({ ok: true, message: 'x', received: 0, sent: 0 })).toBe(
      'Synced: already up to date with your team.'
    )
    expect(syncResultText({ ok: false, message: 'Nope' })).toBe('Nope')
  })
})

describe('conflict helpers', () => {
  it('flags lines the other version lacks', () => {
    const lines = markDifferences('a\nb\nc\n', 'a\nB\nc\n')
    expect(lines.map((l) => l.differs)).toEqual([false, true, false])
    expect(markDifferences(null, 'a')).toEqual([])
  })

  it('remembers a pending conflict per collection until cleared', () => {
    setConflict('/tmp/a', true)
    expect(hasConflict('/tmp/a')).toBe(true)
    expect(hasConflict('/tmp/b')).toBe(false)
    setConflict('/tmp/a', false)
    expect(hasConflict('/tmp/a')).toBe(false)
  })
})

describe('gitUx in another language', () => {
  afterEach(async () => {
    await setLocale('en')
  })

  it('speaks Spanish and keeps the counts', async () => {
    await setLocale('es')
    const s = summarizeSync({ ...clean, behind: 2 })
    expect(s.label).toBe('2 actualizaciones del equipo')
    expect(syncResultText({ ok: true, message: 'x', received: 1, sent: 0 })).toBe(
      'Sincronizado: 1 actualización recibida.'
    )
  })
})
