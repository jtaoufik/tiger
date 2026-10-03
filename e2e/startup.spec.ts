import { collectionTree, expect, openCollection, test, unfoldAll, windowState } from './fixtures'

test('app starts, shows its window title and lists the collection requests', async ({ tiger, collection }) => {
  const { app, page } = tiger

  // One window, titled by the app (the active request, then "Tiger"). Automated
  // runs keep it hidden and unfocused so they never interrupt the person at the machine.
  expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(1)
  expect(await windowState(app)).toEqual({ loaded: true, visible: false, focused: false })
  await expect(page).toHaveTitle(/ - Tiger$|^Tiger$/)
  const nativeTitle = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getTitle())
  expect(nativeTitle).toMatch(/Tiger$/)

  await openCollection(tiger, collection)

  const col = collectionTree(page)
  // Opened collections start folded, except the folder of the request that opens.
  await expect(col.getByRole('treeitem', { name: 'posts', exact: true })).toHaveAttribute('aria-expanded', 'true')
  await expect(col.getByRole('treeitem', { name: 'users', exact: true })).toHaveAttribute('aria-expanded', 'false')
  await expect(col.getByRole('treeitem', { name: 'POST Create post', exact: true })).toBeVisible()
  await expect(col.getByRole('treeitem', { name: 'GET List posts', exact: true })).toBeVisible()
  await expect(col.getByRole('treeitem', { name: 'GET List users', exact: true })).toHaveCount(0)
  await unfoldAll(page)
  await expect(col.getByRole('treeitem', { name: 'GET List users', exact: true })).toBeVisible()
  // The environments folder is not a request folder.
  await expect(col.getByRole('treeitem', { name: 'environments' })).toHaveCount(0)

  // The window title follows the opened request.
  await expect(page).toHaveTitle(/^Create post - Tiger$/)

  expect(tiger.errors).toEqual([])
})
