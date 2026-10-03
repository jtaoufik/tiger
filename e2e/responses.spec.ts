/**
 * Response bodies as received: compressed bodies on the Node send path, and
 * binary bodies (size label, Save to file).
 */
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { gzipSync } from 'node:zlib'
import { closeTiger, expect, launchTiger, makeUserDataDir, openCollection, openRequest, responsePanel, responseStatus, rm, test } from './fixtures'
import { envFile, pathOf, requestFile, startLoopback, writeCollection, type Loopback } from './loopback'

const PDF_BYTES = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a, 0xff, 0x00, 0x80])

function bodyServer(): Promise<Loopback> {
  return startLoopback((req, res) => {
    const path = pathOf(req)
    if (path === '/gzip') {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Encoding': 'gzip' })
      res.end(gzipSync(JSON.stringify({ zipped: 'hello-gzip' })))
      return true
    }
    if (path === '/bin') {
      res.writeHead(200, { 'Content-Type': 'application/octet-stream' })
      res.end(Buffer.alloc(1000, 0xff))
      return true
    }
    if (path === '/pdf') {
      res.writeHead(200, { 'Content-Type': 'application/pdf' })
      res.end(PDF_BYTES)
      return true
    }
    return false
  })
}

const files = (baseUrl: string) => ({
  'environments/dev.tiger': envFile(baseUrl),
  'gzip.tiger': requestFile('Zipped', 'get', '{{baseUrl}}/gzip', 'headers {\n  Accept-Encoding: gzip\n}\n'),
  'bin.tiger': requestFile('Binary', 'get', '{{baseUrl}}/bin'),
  'pdf.tiger': requestFile('Invoice', 'get', '{{baseUrl}}/pdf'),
  'json.tiger': requestFile('Echo', 'get', '{{baseUrl}}/echo')
})

test('a gzip response is decoded on the Node send path (CA file configured)', async () => {
  const srv = await bodyServer()
  const dir = writeCollection(files(srv.url))
  const certs = mkdtempSync(join(tmpdir(), 'tiger-e2e-ca-'))
  const ca = join(certs, 'ca.pem')
  writeFileSync(ca, '-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----\n')
  const ud = makeUserDataDir({ caFile: ca })
  const t = await launchTiger(ud)
  try {
    await openCollection(t, dir)
    await openRequest(t.page, 'GET', 'Zipped')
    await t.page.getByRole('button', { name: 'Send', exact: true }).click()
    await expect(responseStatus(t.page)).toContainText('200')
    await expect(responsePanel(t.page)).toContainText('hello-gzip')
  } finally {
    await closeTiger(t)
    await srv.close()
    rm(ud)
    rm(certs)
    rm(resolve(dir, '..'))
  }
})
