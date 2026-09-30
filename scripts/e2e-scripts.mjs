// Real-app check: pre-request/post-response scripts and tests run in the BUILT
// Tiger app, through its own Send button and collection runner, inside the
// isolated script host. Unit tests cannot catch this (jsdom has no CSP).
//
//   npm run build && node scripts/e2e-scripts.mjs "$PWD"
//
// Starts a local HTTP server, a throwaway collection and user-data dir, launches
// Electron with --remote-debugging-port, drives the UI with dispatched DOM
// events, asserts tests / env mutations / timeout / no network leak, then kills
// Electron. Exit code 0 = all checks passed.
import { spawn } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const APP = process.argv[2] ?? process.cwd()
const CDP_PORT = 9347
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const log = (...a) => console.log('[e2e]', ...a)

const hits = []
const hitsAll = []
const server = createServer((req, res) => {
  hits.push(req.url)
  hitsAll.push(req.url)
  if (req.url.startsWith('/leak')) return res.end('leaked')
  res.setHeader('content-type', 'application/json')
  res.end(JSON.stringify({ id: 42, token: req.headers['x-token'] ?? null }))
})
await new Promise((r) => server.listen(0, '127.0.0.1', r))
const PORT = server.address().port
const leakUrl = `http://127.0.0.1:${PORT}/leak`

const base = mkdtempSync(join(tmpdir(), 'tiger-e2e-'))
const col = join(base, 'col')
mkdirSync(join(col, 'environments'), { recursive: true })
writeFileSync(
  join(col, 'environments', 'dev.tiger'),
  `meta {\n  name: dev\n}\n\nvars {\n  baseUrl: http://127.0.0.1:${PORT}\n  seed: abc\n}\n`
)
writeFileSync(
  join(col, 'scripted.tiger'),
  `meta {
  name: Scripted
  seq: 1
}

get {
  url: {{baseUrl}}/echo
}

headers {
  X-Token: {{token}}
}

script:pre {
  tiger.setVar("token", tiger.getVar("seed") + "-pre")
  tiger.setVar("fetchType", typeof fetch)
  try { const w = Function("return this")(); w.document.createElement("img").src = "${leakUrl}/img"; } catch (e) { tiger.log("img " + e.message) }
  try { const w = Function("return this")(); w.fetch("${leakUrl}/fetch"); } catch (e) { tiger.log("fetch " + e.message) }
  tiger.setVar("hasTiger", String(typeof Function("return this")().tiger))
  tiger.setVar("hasRequire", String(typeof Function("return this")().require))
}

script:post {
  tiger.test("status is 200", () => tiger.expect(tiger.response.status === 200))
  tiger.test("id is 42", () => tiger.expect(tiger.response.json.id === 42, "wrong id"))
  tiger.test("pre var reached the request", () => tiger.expect(tiger.response.json.token === "abc-pre", "token " + tiger.response.json.token))
  tiger.setVar("postId", tiger.response.json.id)
}
`
)
writeFileSync(
  join(col, 'loop.tiger'),
  `meta {
  name: Looper
  seq: 2
}

get {
  url: {{baseUrl}}/loop
}

script:pre {
  while (true) {}
}
`
)

const userData = join(base, 'userdata')
mkdirSync(userData, { recursive: true })
writeFileSync(join(userData, 'settings.json'), JSON.stringify({ analyticsEnabled: false }))

const electron = spawn(
  join(APP, 'node_modules/.bin/electron'),
  // --lang pins the UI to English: the checks click buttons by their English
  // text, and the app otherwise follows the language of the machine.
  [APP, `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${userData}`, '--lang=en-US'],
  {
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true
  }
)
let electronOut = ''
electron.stdout.on('data', (d) => (electronOut += d))
electron.stderr.on('data', (d) => (electronOut += d))

let failures = 0
const check = (name, ok, detail = '') => {
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` :: ${detail}` : ''}`)
}

async function targets() {
  return (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json()
}

async function connect(wsUrl) {
  const ws = new WebSocket(wsUrl)
  await new Promise((r, j) => ((ws.onopen = r), (ws.onerror = j)))
  let id = 0
  const pending = new Map()
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data)
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg)
      pending.delete(msg.id)
    }
  }
  const send = (method, params = {}) =>
    new Promise((r) => {
      const i = ++id
      pending.set(i, r)
      ws.send(JSON.stringify({ id: i, method, params }))
    })
  const evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true
    })
    if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails))
    return r.result?.result?.value
  }
  return { ws, send, evaluate }
}

async function waitFor(fn, what, timeout = 15000) {
  const end = Date.now() + timeout
  while (Date.now() < end) {
    const v = await fn()
    if (v) return v
    await sleep(200)
  }
  throw new Error(`timed out waiting for ${what}`)
}

// Page helpers. Every UI action is scheduled as a page task (setTimeout) that
// dispatches a real DOM event, so the app's own handlers do the work.
const clickText = (sel, text) => `new Promise((res) => setTimeout(() => {
  const roots = [...document.querySelectorAll(${JSON.stringify(sel)})];
  const all = roots.flatMap((r) => [r, ...r.querySelectorAll("*")]).filter((e) => e.textContent.trim() === ${JSON.stringify(text)});
  const el = all[all.length - 1];
  if (!el) return res(false);
  el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  res(true)
}, 0))`

try {
  const page = await waitFor(async () => {
    try {
      return (await targets()).find((t) => t.type === 'page' && t.url.endsWith('/index.html'))
    } catch {
      return null
    }
  }, 'app window')
  const app = await connect(page.webSocketDebuggerUrl)
  await waitFor(() => app.evaluate('!!document.querySelector("#root > *")'), 'app render')

  // Session restore opens the test collection (same path a relaunch uses).
  await app.evaluate(
    `localStorage.setItem('tiger.session.roots', ${JSON.stringify(JSON.stringify([col]))}); location.reload(); true`
  )
  await sleep(1500)
  await waitFor(() => app.evaluate(`document.body.innerText.includes('Scripted')`), 'collection in sidebar')

  // Pick the dev environment through the env <select>.
  const envOk = await app.evaluate(`new Promise((res) => setTimeout(() => {
    const s = document.querySelector('select.env-select');
    if (!s) return res('no select');
    const opt = [...s.options].find((o) => o.textContent.includes('dev'));
    if (!opt) return res('no dev option: ' + [...s.options].map(o => o.textContent).join('|'));
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
    setter.call(s, opt.value);
    s.dispatchEvent(new Event('change', { bubbles: true }));
    res('ok')
  }, 0))`)
  check('environment selected', envOk === 'ok', envOk)
  await sleep(500)

  check('open request', await app.evaluate(clickText('[role="treeitem"]', 'Scripted')))
  await sleep(500)
  check('click Send', await app.evaluate(clickText('button.btn.accent', 'Send')))

  const text = await waitFor(async () => {
    const t = await app.evaluate('document.body.innerText')
    return /Tests \(\d+\/\d+\)|Tests: \d+ passed/.test(t) || /script error/i.test(t) ? t : null
  }, 'test results')
  const testsLabel = text.match(/Tests \((\d+)\/(\d+)\)/)
  check(
    '3 of 3 tests passed in the response panel',
    !!testsLabel && testsLabel[1] === '3' && testsLabel[2] === '3',
    testsLabel?.[0] ?? text.slice(0, 400)
  )
  check(
    'no script error toast',
    !/script error/i.test(text),
    (text.match(/[^\n]*script error[^\n]*/i) || [''])[0]
  )

  await sleep(800)
  const envFile = readFileSync(join(col, 'environments', 'dev.tiger'), 'utf8')
  log('env file after send:\n' + envFile)
  check('pre-request env mutation persisted (token: abc-pre)', /token: abc-pre/.test(envFile))
  check('post-response env mutation persisted (postId: 42)', /postId: 42/.test(envFile))
  check('script saw no fetch (fetchType: undefined)', /fetchType: undefined/.test(envFile))
  check('script saw no window.tiger', /hasTiger: undefined/.test(envFile))
  check('script saw no require', /hasRequire: undefined/.test(envFile))
  check('request carried the pre-script var', hits.includes('/echo'))

  const hostTarget = (await targets()).find((t) => t.url.endsWith('/script-host.html'))
  check('script host page exists as a separate target', !!hostTarget, hostTarget?.url)

  // Infinite loop: the host must be killed at the timeout, and Send must work after.
  check('open Looper', await app.evaluate(clickText('[role="treeitem"]', 'Looper')))
  await sleep(400)
  const t0 = Date.now()
  check('click Send (loop)', await app.evaluate(clickText('button.btn.accent', 'Send')))
  const loopText = await waitFor(
    async () => {
      const t = await app.evaluate('document.body.innerText')
      return /timed out after/i.test(t) ? t : null
    },
    'loop timeout toast',
    20000
  )
  check(
    'infinite loop stopped by timeout',
    true,
    `${(loopText.match(/[^\n]*timed out after[^\n]*/i) || [''])[0]} (${Date.now() - t0} ms)`
  )

  hits.length = 0
  check('reopen Scripted', await app.evaluate(clickText('[role="treeitem"]', 'Scripted')))
  await sleep(400)
  check('click Send again', await app.evaluate(clickText('button.btn.accent', 'Send')))
  await waitFor(() => hits.includes('/echo'), 'second echo')
  await sleep(1200)
  const after = await app.evaluate('document.body.innerText')
  const again = after.match(/Tests \((\d+)\/(\d+)\)/)
  check('scripts work again after host was killed (3/3)', !!again && again[1] === '3', again?.[0])

  // Collection runner: same isolated path. Scripted passes, Looper times out.
  hits.length = 0
  const openCol = await app.evaluate(clickText('[role="treeitem"]', 'col'))
  check('open collection page', openCol)
  await sleep(600)
  const runBtn = await app.evaluate(`new Promise((res) => setTimeout(() => {
    const b = [...document.querySelectorAll('button.btn')].find((x) => /^Run/.test(x.textContent.trim()));
    if (!b) return res(false);
    b.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    res(b.textContent.trim())
  }, 0))`)
  check('click Run collection', !!runBtn, String(runBtn))
  await sleep(800)
  const startBtn = await app.evaluate(`new Promise((res) => setTimeout(() => {
    const b = document.querySelector('button.btn.accent[data-autofocus]');
    if (!b) return res(false);
    b.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    res(b.textContent.trim())
  }, 0))`)
  check('start runner', !!startBtn, String(startBtn))
  const runText = await waitFor(
    async () => {
      const t = await app.evaluate('document.body.innerText')
      return /\d+ passed · \d+ failed/.test(t) ? t : null
    },
    'runner summary',
    30000
  )
  const summary = runText.match(/(\d+) passed · (\d+) failed/)
  check(
    'runner: Scripted passed, Looper failed on timeout (1 passed, 1 failed)',
    summary && summary[1] === '1' && summary[2] === '1',
    summary?.[0]
  )
  check(
    'runner shows the timeout error',
    /timed out after 5000 ms/.test(runText),
    (runText.match(/[^\n]*timed out[^\n]*/) || [''])[0]
  )

  await sleep(500)
  check('no network leak from scripts', !hitsAll.some((u) => u.startsWith('/leak')), JSON.stringify(hitsAll))
  app.ws.close()
} catch (e) {
  failures++
  console.log('FAIL exception', e.message)
  console.log(electronOut.slice(-2000))
} finally {
  // Kill the whole process group: the .bin wrapper plus Electron and helpers.
  try {
    process.kill(-electron.pid, 'SIGTERM')
  } catch {}
  await sleep(1500)
  try {
    process.kill(-electron.pid, 'SIGKILL')
  } catch {}
  server.close()
  console.log(failures ? `RESULT: ${failures} failure(s)` : 'RESULT: all checks passed')
  process.exit(failures ? 1 : 0)
}
