import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  MOD,
  expect,
  openCollection,
  openRequest,
  responsePanel,
  responseStatus,
  test,
  useEnvironment
} from './fixtures'

test('a new environment variable is interpolated into the URL that is sent', async ({ tiger, collection, server }) => {
  const { page } = tiger
  await openCollection(tiger, collection)
  await openRequest(page, 'GET', 'List users')

  await page.getByRole('button', { name: 'Manage environments' }).click()
  const dialog = page.getByRole('dialog', { name: 'Environments' })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('combobox', { name: 'Collection' }).selectOption({ label: 'jsonplaceholder' })
  await dialog.getByRole('button', { name: 'New environment' }).click()

  // Rename the new environment, then give it two variables.
  const name = dialog.getByRole('textbox', { name: 'Name', exact: true })
  await expect(name).toHaveValue('new-environment')
  await name.fill('staging')
  await name.press('Enter')
  await expect(dialog.getByRole('button', { name: 'Set staging as active' })).toBeVisible()

  await dialog.getByRole('textbox', { name: 'New variable name' }).fill('baseUrl')
  await dialog.getByRole('textbox', { name: 'Variable 1 value' }).fill(server.url)
  await dialog.getByRole('textbox', { name: 'New variable name' }).fill('apiToken')
  await dialog.getByRole('textbox', { name: 'Variable 2 value' }).fill('tok-e2e-123')

  await dialog.getByRole('button', { name: 'Set staging as active' }).click()
  await expect(dialog.getByRole('button', { name: 'staging is active' })).toBeVisible()
  await dialog.getByRole('button', { name: 'Close dialog' }).click()
  await expect(dialog).toBeHidden()

  // Persisted as a plain-text environment file.
  const envFile = join(collection, 'environments', 'staging.tiger')
  await expect.poll(() => readFileSync(envFile, 'utf8')).toContain('apiToken: tok-e2e-123')
  await expect(page.getByRole('combobox', { name: 'Active environment' }).locator('option:checked')).toHaveText('staging')

  const url = page.getByRole('textbox', { name: 'Request URL' })
  await url.fill('{{baseUrl}}/echo/users?token={{apiToken}}')
  await page.getByRole('button', { name: 'Send', exact: true }).click()

  await expect(responseStatus(page)).toContainText('200 OK')
  expect(server.requests.map((r) => r.url)).toEqual(['/echo/users?token=tok-e2e-123'])

  // Save the edit so the window closes without an unsaved-changes prompt.
  await page.keyboard.press(`${MOD}+s`)
  await expect.poll(() => readFileSync(join(collection, 'users', 'list-users.tiger'), 'utf8')).toContain('{{apiToken}}')
  await expect(responsePanel(page)).toContainText('tok-e2e-123')
  expect(tiger.errors).toEqual([])
})

test('Save values captures a response field and chains it into the next request', async ({ tiger, collection, server }) => {
  const { page } = tiger
  // A second request that consumes the captured value.
  writeFileSync(
    join(collection, 'posts', 'get-post.tiger'),
    'meta {\n  name: Get created post\n  seq: 3\n}\n\nget {\n  url: {{baseUrl}}/posts/{{postId}}\n}\n'
  )
  await openCollection(tiger, collection)
  await useEnvironment(page, 'demo')

  await openRequest(page, 'POST', 'Create post')
  await page.getByRole('tab', { name: /^Save values/ }).click()
  await page.getByRole('textbox', { name: 'New saved value name' }).fill('postId')
  await page.getByRole('textbox', { name: 'Saved value 1 value' }).fill('body.id')
  await page.keyboard.press(`${MOD}+s`)

  await page.getByRole('button', { name: 'Send', exact: true }).click()
  await expect(responseStatus(page)).toContainText('201 Created')
  expect(server.requests[0]).toMatchObject({ method: 'POST', url: '/posts' })
  expect(JSON.parse(server.requests[0].body)).toMatchObject({ title: 'Hello from Tiger' })

  // The captured value is written into the active environment on disk.
  const envFile = join(collection, 'environments', 'demo.tiger')
  await expect.poll(() => readFileSync(envFile, 'utf8')).toMatch(/postId: 4242/)

  await openRequest(page, 'GET', 'Get created post')
  await page.getByRole('button', { name: 'Send', exact: true }).click()
  await expect(responseStatus(page)).toContainText('200 OK')
  await expect(responsePanel(page)).toContainText('post 4242')
  expect(server.requests[1]).toMatchObject({ method: 'GET', url: '/posts/4242' })
  expect(tiger.errors).toEqual([])
})
