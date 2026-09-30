import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { MOD, collectionTree, expect, openCollection, openRequest, rm, test } from './fixtures'

/**
 * Git runs against a private global config (identity, default branch) so the
 * suite never depends on, or writes to, the developer's own ~/.gitconfig.
 */
const gitHome = mkdtempSync(join(tmpdir(), 'tiger-e2e-git-'))
const gitConfig = join(gitHome, 'gitconfig')
writeFileSync(
  gitConfig,
  '[user]\n\tname = Tiger E2E\n\temail = e2e@tiger.test\n[init]\n\tdefaultBranch = main\n[commit]\n\tgpgsign = false\n'
)
const gitEnv = { GIT_CONFIG_GLOBAL: gitConfig, GIT_CONFIG_NOSYSTEM: '1' }

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, env: { ...process.env, ...gitEnv }, encoding: 'utf8' }).trim()
}

test.use({ tigerEnv: gitEnv })
test.afterAll(() => rm(gitHome))

test('team sync: track, connect a bare repo, share, save a version, sync with team', async ({ tiger, collection }) => {
  const { page } = tiger
  const bare = join(gitHome, `team-${Date.now()}.git`)
  git(gitHome, 'init', '--bare', '--initial-branch=main', bare)

  await openCollection(tiger, collection)
  await openRequest(page, 'GET', 'List users')

  const openTeamSync = async () => {
    await collectionTree(page).getByText('jsonplaceholder', { exact: true }).click({ button: 'right' })
    await page.getByRole('menu', { name: 'Collection actions' }).getByRole('menuitem', { name: /^Team sync/ }).click()
    const dialog = page.getByRole('dialog', { name: 'Team sync · jsonplaceholder' })
    await expect(dialog).toBeVisible()
    return dialog
  }

  // 1. Turn on version tracking (git init).
  let dialog = await openTeamSync()
  await dialog.getByRole('button', { name: 'Turn on version tracking' }).click()

  // 2. Connect the shared repository (git remote add) over file://.
  const address = dialog.getByRole('textbox', { name: 'Repository address' })
  await expect(address).toBeVisible()
  await address.fill(pathToFileURL(bare).href)
  await dialog.getByRole('button', { name: 'Connect', exact: true }).click()

  // 3. Share it (first push).
  await dialog.getByRole('button', { name: 'Share now' }).click()
  await expect(dialog.getByRole('button', { name: 'Sync with team' })).toBeVisible()
  await expect.poll(() => git(bare, 'log', '--format=%s', 'main')).toBe('Share collection with the team')
  expect(git(bare, 'ls-tree', '-r', '--name-only', 'main')).toContain('users/list-users.tiger')
  await dialog.getByRole('button', { name: 'Close dialog' }).click()
  await expect(dialog).toBeHidden()

  // Change a request (rename it from the editor and save).
  const name = page.getByRole('textbox', { name: 'Request name' })
  await name.fill('List all users')
  await page.keyboard.press(`${MOD}+s`)
  await expect(collectionTree(page).getByRole('treeitem', { name: 'GET List all users', exact: true })).toBeVisible()

  // Save a version with the suggested message (git commit, nothing shared).
  dialog = await openTeamSync()
  await expect(dialog.getByRole('heading', { name: 'Your changes' })).toBeVisible()
  const note = dialog.getByRole('textbox', { name: /Describe this version/ })
  await expect(dialog.getByText('Suggested from your changes. Edit it if you like.')).toBeVisible()
  await expect(note).not.toHaveValue('')
  const suggested = await note.inputValue()
  await dialog.getByRole('button', { name: 'Save a version' }).click()
  await expect.poll(() => git(collection, 'log', '-1', '--format=%s')).toBe(suggested)
  expect(git(collection, 'status', '--porcelain')).toBe('')
  // Saved locally only: the team repo does not have it yet.
  expect(git(bare, 'log', '--format=%s', 'main')).not.toContain(suggested)

  // Sync with team (pull + push): the bare repo receives the commit.
  await dialog.getByRole('button', { name: 'Sync with team' }).click()
  await expect.poll(() => git(bare, 'rev-parse', 'main')).toBe(git(collection, 'rev-parse', 'HEAD'))
  expect(git(bare, 'log', '-1', '--format=%s', 'main')).toBe(suggested)
  expect(git(bare, 'show', 'main:users/list-users.tiger')).toContain('name: List all users')
  expect(git(bare, 'log', '-1', '--format=%an <%ae>', 'main')).toBe('Tiger E2E <e2e@tiger.test>')
  expect(tiger.errors).toEqual([])
})
