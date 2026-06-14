# Windows resize fix · WSDL import · first-class Linux — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the Windows window-resize bug, add a WSDL/SOAP importer, and make Linux a first-class release target, shipped as version 0.4.0.

**Architecture:** Three independent changes. (1) Remove the Electron `backgroundMaterial: 'acrylic'` backdrop that breaks native resize on Windows. (2) A new `importWsdl(xml)` core module that parses a WSDL with `fast-xml-parser` and emits one SOAP `TigerRequest` per binding operation, wired into the existing Import dialog exactly like the OpenAPI importer. (3) Deterministic Linux build targets plus website/download/version updates.

**Tech Stack:** Electron 34, electron-builder, React 19, TypeScript, Vitest, `fast-xml-parser` (new dep).

**Branch:** `feat/wsdl-linux-windows-resize` (already created and checked out).

**Commit convention for this repo:** author `jtaoufik <j.taoufik@outlook.com>`, no Claude co-author trailer, no emoji. Commit with `git commit --no-verify` is acceptable (githooks path is set). The version bump to 0.4.0 lands in Task 5; do not bump earlier.

---

## File Structure

- `src/main/index.ts` — modify: remove Windows acrylic backdrop (Task 1).
- `package.json` — modify: add `fast-xml-parser` dep (Task 2); Linux targets + version 0.4.0 (Task 5).
- `src/core/import/wsdl.ts` — create: the WSDL → SOAP importer (Task 3).
- `test/core/wsdl.test.ts` — create: importer tests, SOAP 1.1 + 1.2 (Task 3).
- `src/core/import/types.ts` — modify: add `'wsdl'` to `ImportSource` (Task 4).
- `src/core/import/index.ts` — modify: re-export `importWsdl` (Task 4).
- `src/main/importers.ts` — modify: `ImportKind` + file-picker dispatch (Task 4).
- `src/renderer/src/components/ImportExportModal.tsx` — modify: add WSDL import option (Task 4).
- `website/index.html` — modify: Linux download rows + version strings (Task 6).
- `website/version.json` — modify: version + notes (Task 6).
- `CHANGELOG.md` — modify: 0.4.0 entry (Task 6).

---

## Task 1: Drop the Windows acrylic backdrop (resize fix)

**Files:**
- Modify: `src/main/index.ts:52-56`

- [ ] **Step 1: Read the current BrowserWindow options**

Confirm `src/main/index.ts` line 56 reads:
```ts
    backgroundMaterial: process.platform === 'win32' ? 'acrylic' : undefined,
```

- [ ] **Step 2: Remove the acrylic line**

Replace the single line at `src/main/index.ts:56`:
```ts
    backgroundMaterial: process.platform === 'win32' ? 'acrylic' : undefined,
```
with this comment (keep the `vibrancy` line above it unchanged):
```ts
    // No Windows `backgroundMaterial: 'acrylic'`: the DWM acrylic backdrop breaks
    // native edge-resize and maximize on Windows 11. The renderer paints a CSS
    // glass layer instead, and `backgroundColor` above covers the window base.
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: PASS (no errors).

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: build completes with no errors.

- [ ] **Step 5: Commit**

```bash
git add src/main/index.ts
git commit --no-verify -m "fix(win): drop acrylic backdrop that blocked native window resize"
```

---

## Task 2: Add the fast-xml-parser dependency

**Files:**
- Modify: `package.json` (dependencies), `package-lock.json`

- [ ] **Step 1: Install the parser**

Run: `npm install fast-xml-parser`
Expected: `fast-xml-parser` added to `dependencies` in `package.json`; `package-lock.json` updated.

- [ ] **Step 2: Verify it resolves**

Run: `node -e "import('fast-xml-parser').then(m => console.log(typeof m.XMLParser))"`
Expected output: `function`

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit --no-verify -m "build: add fast-xml-parser for WSDL import"
```

---

## Task 3: WSDL → SOAP importer (TDD)

**Files:**
- Create: `src/core/import/wsdl.ts`
- Test: `test/core/wsdl.test.ts`

Note: `ImportSource` does not yet include `'wsdl'` (that is Task 4). To keep Task 3
self-contained and green, the importer returns `source: 'wsdl' as ImportSource`
via a local cast is NOT needed — instead Task 4 widens the type. To avoid a
type error here, the importer's return is typed as `ImportResult` and we add
`'wsdl'` to `ImportSource` as the FIRST step of this task (it is a one-word type
edit and harmless on its own).

- [ ] **Step 1: Widen ImportSource so the new module typechecks**

In `src/core/import/types.ts`, change:
```ts
export type ImportSource = 'postman' | 'bruno' | 'openapi' | 'insomnia'
```
to:
```ts
export type ImportSource = 'postman' | 'bruno' | 'openapi' | 'insomnia' | 'wsdl'
```

- [ ] **Step 2: Write the failing tests**

Create `test/core/wsdl.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { importWsdl } from '../../src/core/import/wsdl'

const soap11 = `<?xml version="1.0" encoding="utf-8"?>
<wsdl:definitions xmlns:wsdl="http://schemas.xmlsoap.org/wsdl/"
                  xmlns:soap="http://schemas.xmlsoap.org/wsdl/soap/"
                  xmlns:tns="http://example.com/weather"
                  name="Weather"
                  targetNamespace="http://example.com/weather">
  <wsdl:message name="GetWeatherSoapIn">
    <wsdl:part name="parameters" element="tns:GetWeather"/>
  </wsdl:message>
  <wsdl:message name="GetWeatherSoapOut">
    <wsdl:part name="parameters" element="tns:GetWeatherResponse"/>
  </wsdl:message>
  <wsdl:portType name="WeatherSoap">
    <wsdl:operation name="GetWeather">
      <wsdl:input message="tns:GetWeatherSoapIn"/>
      <wsdl:output message="tns:GetWeatherSoapOut"/>
    </wsdl:operation>
  </wsdl:portType>
  <wsdl:binding name="WeatherSoap" type="tns:WeatherSoap">
    <soap:binding transport="http://schemas.xmlsoap.org/soap/http" style="document"/>
    <wsdl:operation name="GetWeather">
      <soap:operation soapAction="http://example.com/weather/GetWeather" style="document"/>
      <wsdl:input><soap:body use="literal"/></wsdl:input>
      <wsdl:output><soap:body use="literal"/></wsdl:output>
    </wsdl:operation>
  </wsdl:binding>
  <wsdl:service name="WeatherService">
    <wsdl:port name="WeatherSoap" binding="tns:WeatherSoap">
      <soap:address location="https://example.com/weather.asmx"/>
    </wsdl:port>
  </wsdl:service>
</wsdl:definitions>`

const soap12 = `<?xml version="1.0" encoding="utf-8"?>
<definitions xmlns="http://schemas.xmlsoap.org/wsdl/"
             xmlns:soap12="http://schemas.xmlsoap.org/wsdl/soap12/"
             xmlns:tns="http://example.com/calc"
             name="Calc"
             targetNamespace="http://example.com/calc">
  <message name="AddIn"><part name="parameters" element="tns:Add"/></message>
  <portType name="CalcSoap">
    <operation name="Add"><input message="tns:AddIn"/></operation>
  </portType>
  <binding name="CalcSoap12" type="tns:CalcSoap">
    <soap12:binding transport="http://schemas.xmlsoap.org/soap/http" style="document"/>
    <operation name="Add">
      <soap12:operation soapAction="http://example.com/calc/Add" style="document"/>
      <input><soap12:body use="literal"/></input>
    </operation>
  </binding>
  <service name="CalcService">
    <port name="CalcSoap12" binding="tns:CalcSoap12">
      <soap12:address location="https://example.com/calc.svc"/>
    </port>
  </service>
</definitions>`

describe('importWsdl (SOAP 1.1)', () => {
  it('reads the service name and source', () => {
    const result = importWsdl(soap11)
    expect(result.name).toBe('WeatherService')
    expect(result.source).toBe('wsdl')
  })

  it('creates one POST request per binding operation under the service folder', () => {
    const result = importWsdl(soap11)
    expect(result.requests).toHaveLength(1)
    const [op] = result.requests
    expect(op.path).toEqual(['WeatherService'])
    expect(op.request.name).toBe('GetWeather')
    expect(op.request.method).toBe('post')
    expect(op.request.url).toBe('https://example.com/weather.asmx')
    expect(op.request.body.type).toBe('xml')
  })

  it('sets text/xml content-type and a quoted SOAPAction header', () => {
    const [op] = importWsdl(soap11).requests
    const headers = Object.fromEntries(op.request.headers.map((h) => [h.name, h.value]))
    expect(headers['Content-Type']).toBe('text/xml; charset=utf-8')
    expect(headers['SOAPAction']).toBe('"http://example.com/weather/GetWeather"')
  })

  it('wraps the resolved request element in a SOAP 1.1 envelope', () => {
    const [op] = importWsdl(soap11).requests
    expect(op.request.body.content).toContain('http://schemas.xmlsoap.org/soap/envelope/')
    expect(op.request.body.content).toContain('xmlns:tns="http://example.com/weather"')
    expect(op.request.body.content).toContain('<tns:GetWeather>')
    expect(op.request.body.content).toContain('<!-- fill in fields -->')
  })
})

describe('importWsdl (SOAP 1.2)', () => {
  it('uses the SOAP 1.2 content-type and envelope namespace', () => {
    const result = importWsdl(soap12)
    expect(result.name).toBe('CalcService')
    const [op] = result.requests
    expect(op.request.url).toBe('https://example.com/calc.svc')
    const headers = Object.fromEntries(op.request.headers.map((h) => [h.name, h.value]))
    expect(headers['Content-Type']).toBe(
      'application/soap+xml; charset=utf-8; action="http://example.com/calc/Add"'
    )
    expect(headers['SOAPAction']).toBeUndefined()
    expect(op.request.body.content).toContain('http://www.w3.org/2003/05/soap-envelope')
    expect(op.request.body.content).toContain('<tns:Add>')
  })
})
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm run test -- wsdl`
Expected: FAIL — `Cannot find module '../../src/core/import/wsdl'` (file not created yet).

- [ ] **Step 4: Implement the importer**

Create `src/core/import/wsdl.ts`:
```ts
/**
 * Import a WSDL 1.1 / 1.2 document. Each binding operation becomes a POST
 * request whose body is a SOAP envelope skeleton (the request element wrapped
 * around a "fill in fields" placeholder) and whose headers carry the right
 * Content-Type and, for SOAP 1.1, the SOAPAction. Deep XSD-to-sample expansion
 * is intentionally out of scope; the envelope is a skeleton the user completes.
 */

import { XMLParser } from 'fast-xml-parser'
import type { KeyValue, TigerRequest } from '../types'
import type { ImportedRequest, ImportResult } from './types'

// WSDL is namespaced XML with varying prefixes (wsdl:, soap:, or none). We keep
// prefixes intact and match nodes/attributes by their local name instead.
type Node = any // eslint-disable-line @typescript-eslint/no-explicit-any

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' })

function localName(key: string): string {
  const i = key.indexOf(':')
  return i === -1 ? key : key.slice(i + 1)
}

/** The local part of a QName value such as "tns:GetWeather" -> "GetWeather". */
function localPart(qname: string): string {
  return localName(qname)
}

/** First child value whose element local name matches `name`. */
function child(node: Node, name: string): Node {
  if (!node || typeof node !== 'object') return undefined
  for (const key of Object.keys(node)) {
    if (key.startsWith('@_')) continue
    if (localName(key) === name) return node[key]
  }
  return undefined
}

/** All children with local name `name`, always as an array (0, 1 or many). */
function children(node: Node, name: string): Node[] {
  const v = child(node, name)
  if (v === undefined) return []
  return Array.isArray(v) ? v : [v]
}

/** Attribute value by local name (ignores namespace prefix on the attribute). */
function attr(node: Node, name: string): string | undefined {
  if (!node || typeof node !== 'object') return undefined
  for (const key of Object.keys(node)) {
    if (!key.startsWith('@_')) continue
    if (localName(key.slice(2)) === name) {
      const val = node[key]
      return val == null ? undefined : String(val)
    }
  }
  return undefined
}

function findEndpoint(services: Node[]): string | undefined {
  for (const svc of services) {
    for (const port of children(svc, 'port')) {
      const address = children(port, 'address')[0]
      const loc = address && attr(address, 'location')
      if (loc) return loc
    }
  }
  return undefined
}

function buildSoapRequest(opts: {
  opName: string
  requestElement: string
  endpoint: string
  targetNs: string
  soapAction: string
  soap12: boolean
}): TigerRequest {
  const { opName, requestElement, endpoint, targetNs, soapAction, soap12 } = opts
  const envelopeNs = soap12
    ? 'http://www.w3.org/2003/05/soap-envelope'
    : 'http://schemas.xmlsoap.org/soap/envelope/'

  const content =
    `<soap:Envelope xmlns:soap="${envelopeNs}"\n` +
    `               xmlns:tns="${targetNs}">\n` +
    `  <soap:Body>\n` +
    `    <tns:${requestElement}>\n` +
    `      <!-- fill in fields -->\n` +
    `    </tns:${requestElement}>\n` +
    `  </soap:Body>\n` +
    `</soap:Envelope>\n`

  const headers: KeyValue[] = []
  if (soap12) {
    const action = soapAction ? `; action="${soapAction}"` : ''
    headers.push({
      name: 'Content-Type',
      value: `application/soap+xml; charset=utf-8${action}`,
      enabled: true
    })
  } else {
    headers.push({ name: 'Content-Type', value: 'text/xml; charset=utf-8', enabled: true })
    headers.push({ name: 'SOAPAction', value: `"${soapAction}"`, enabled: true })
  }

  return {
    name: opName,
    method: 'post',
    url: endpoint,
    headers,
    query: [],
    body: { type: 'xml', content }
  }
}

export function importWsdl(xml: string): ImportResult {
  const root = parser.parse(xml)
  const definitions = child(root, 'definitions')
  if (!definitions) return { name: 'WSDL', source: 'wsdl', requests: [] }

  const targetNs = attr(definitions, 'targetNamespace') ?? ''
  const soap12 =
    /schemas\.xmlsoap\.org\/wsdl\/soap12|www\.w3\.org\/2003\/05\/soap-envelope/.test(xml)

  const services = children(definitions, 'service')
  const serviceName =
    (services[0] && attr(services[0], 'name')) || attr(definitions, 'name') || 'WSDL'
  const endpoint = findEndpoint(services) ?? '{{baseUrl}}'

  // message name -> request element local name (document/literal style)
  const messageElement = new Map<string, string>()
  for (const msg of children(definitions, 'message')) {
    const name = attr(msg, 'name')
    const part = children(msg, 'part')[0]
    const element = part && (attr(part, 'element') ?? attr(part, 'name'))
    if (name && element) messageElement.set(name, localPart(element))
  }

  // operation name -> input message local name
  const inputMessage = new Map<string, string>()
  for (const pt of children(definitions, 'portType')) {
    for (const op of children(pt, 'operation')) {
      const opName = attr(op, 'name')
      const input = children(op, 'input')[0]
      const msg = input && attr(input, 'message')
      if (opName && msg) inputMessage.set(opName, localPart(msg))
    }
  }

  const requests: ImportedRequest[] = []
  for (const binding of children(definitions, 'binding')) {
    for (const op of children(binding, 'operation')) {
      const opName = attr(op, 'name')
      if (!opName) continue
      const soapOp = children(op, 'operation').find((o) => attr(o, 'soapAction') !== undefined)
      const soapAction = soapOp ? (attr(soapOp, 'soapAction') ?? '') : ''
      const requestElement = messageElement.get(inputMessage.get(opName) ?? '') ?? opName
      requests.push({
        path: [serviceName],
        request: buildSoapRequest({ opName, requestElement, endpoint, targetNs, soapAction, soap12 })
      })
    }
  }

  return { name: serviceName, source: 'wsdl', requests }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm run test -- wsdl`
Expected: PASS — all 6 assertions green.

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/core/import/types.ts src/core/import/wsdl.ts test/core/wsdl.test.ts
git commit --no-verify -m "feat(import): WSDL/SOAP importer (SOAP 1.1 and 1.2)"
```

---

## Task 4: Wire WSDL into the import flow

**Files:**
- Modify: `src/core/import/index.ts`
- Modify: `src/main/importers.ts`
- Modify: `src/renderer/src/components/ImportExportModal.tsx`

(`ImportSource` already gained `'wsdl'` in Task 3.)

- [ ] **Step 1: Re-export the importer**

In `src/core/import/index.ts`, add after the `importInsomnia` export line:
```ts
export { importWsdl } from './wsdl'
```

- [ ] **Step 2: Add 'wsdl' to ImportKind and import the function**

In `src/main/importers.ts`, change the import block:
```ts
import {
  importBrunoRequest,
  importInsomnia,
  importOpenApi,
  importPostman,
  type ImportResult
} from '../core/import'
```
to:
```ts
import {
  importBrunoRequest,
  importInsomnia,
  importOpenApi,
  importPostman,
  importWsdl,
  type ImportResult
} from '../core/import'
```
and change:
```ts
export type ImportKind = 'postman' | 'bruno' | 'openapi' | 'insomnia'
```
to:
```ts
export type ImportKind = 'postman' | 'bruno' | 'openapi' | 'insomnia' | 'wsdl'
```

- [ ] **Step 3: Add the WSDL file-picker branch in importFromDisk**

In `src/main/importers.ts`, inside `importFromDisk`, add this branch immediately
before the final `// openapi` comment / OpenAPI fallthrough:
```ts
  if (kind === 'wsdl') {
    const file = await pickFile('WSDL document', ['wsdl', 'xml'])
    return file ? importWsdl(await readFile(file, 'utf8')) : null
  }
```
(`readFile` is already imported at the top of the file.)

- [ ] **Step 4: Add the WSDL option to the Import dialog**

In `src/renderer/src/components/ImportExportModal.tsx`, change the `IMPORTS` array:
```ts
const IMPORTS: Array<{ kind: ImportKind; title: string; desc: string }> = [
  { kind: 'postman', title: 'Postman', desc: 'Collection v2.0 / v2.1 (.json)' },
  { kind: 'bruno', title: 'Bruno', desc: 'A folder of .bru files' },
  { kind: 'openapi', title: 'OpenAPI / Swagger', desc: 'OpenAPI 3 or Swagger 2 (.json / .yaml)' },
  { kind: 'insomnia', title: 'Insomnia', desc: 'Insomnia v4 export (.json / .yaml)' }
]
```
to add the WSDL entry:
```ts
const IMPORTS: Array<{ kind: ImportKind; title: string; desc: string }> = [
  { kind: 'postman', title: 'Postman', desc: 'Collection v2.0 / v2.1 (.json)' },
  { kind: 'bruno', title: 'Bruno', desc: 'A folder of .bru files' },
  { kind: 'openapi', title: 'OpenAPI / Swagger', desc: 'OpenAPI 3 or Swagger 2 (.json / .yaml)' },
  { kind: 'insomnia', title: 'Insomnia', desc: 'Insomnia v4 export (.json / .yaml)' },
  { kind: 'wsdl', title: 'WSDL / SOAP', desc: 'WSDL 1.1 / 1.2 service (.wsdl / .xml)' }
]
```

- [ ] **Step 5: Typecheck and full test run**

Run: `npm run typecheck`
Expected: PASS.
Run: `npm run test`
Expected: PASS (all suites, including the new wsdl suite).

- [ ] **Step 6: Build**

Run: `npm run build`
Expected: build completes with no errors.

- [ ] **Step 7: Commit**

```bash
git add src/core/import/index.ts src/main/importers.ts src/renderer/src/components/ImportExportModal.tsx
git commit --no-verify -m "feat(import): wire WSDL into the import dialog and file picker"
```

---

## Task 5: Linux build targets + version bump to 0.4.0

**Files:**
- Modify: `package.json` (`version`, `build.linux`)

- [ ] **Step 1: Bump the version**

In `package.json`, change:
```json
  "version": "0.3.1",
```
to:
```json
  "version": "0.4.0",
```

- [ ] **Step 2: Make the Linux build deterministic**

In `package.json`, replace the `"linux"` block:
```json
    "linux": {
      "icon": "build/icon.png",
      "category": "Development",
      "target": [
        "AppImage",
        "deb"
      ]
    },
```
with:
```json
    "linux": {
      "icon": "build/icon.png",
      "category": "Development",
      "maintainer": "Taoufik Jabbari <jtaoufik@users.noreply.github.com>",
      "synopsis": "Offline, git-friendly API client with a frosted-glass UI",
      "target": [
        {
          "target": "AppImage",
          "arch": ["x64"]
        },
        {
          "target": "deb",
          "arch": ["x64"]
        }
      ]
    },
```
Then add explicit Linux artifact names. In `package.json`, locate the existing
`"portable"` block under `build`:
```json
    "portable": {
      "artifactName": "Tiger-Portable-${version}-windows-${arch}.${ext}"
    },
```
and add an `appImage` and `deb` block immediately after it:
```json
    "portable": {
      "artifactName": "Tiger-Portable-${version}-windows-${arch}.${ext}"
    },
    "appImage": {
      "artifactName": "Tiger-${version}-linux-x64.AppImage"
    },
    "deb": {
      "artifactName": "Tiger-${version}-linux-amd64.deb"
    },
```

- [ ] **Step 3: Validate the JSON**

Run: `node -e "JSON.parse(require('fs').readFileSync('package.json','utf8')); console.log('ok')"`
Expected output: `ok`

- [ ] **Step 4: Typecheck (sanity — version bump touches package.json only)**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add package.json
git commit --no-verify -m "build(linux): deterministic AppImage/deb artifacts; bump to 0.4.0"
```

---

## Task 6: Website downloads, version.json, changelog

**Files:**
- Modify: `website/version.json`
- Modify: `website/index.html`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Update version.json**

Replace the entire contents of `website/version.json` with:
```json
{
  "version": "0.4.0",
  "url": "https://jtaoufik.github.io/tiger/#download",
  "notes": [
    "Import WSDL / SOAP services: each operation becomes a ready-to-fill SOAP request",
    "Linux builds: AppImage (auto-updating) and Debian/Ubuntu .deb",
    "Windows: fixed window resize and maximize (removed the acrylic backdrop that blocked it)",
    "Tab management, session restore and the collection runner from 0.3.x"
  ]
}
```

- [ ] **Step 2: Update the download subtitle and add Linux first-launch note**

In `website/index.html`, change the download subtitle (around line 620):
```html
        Version 0.3.1, free for personal and commercial use. These are early preview builds and
        are not yet code-signed.
```
to:
```html
        Version 0.4.0, free for personal and commercial use. These are early preview builds and
        are not yet code-signed.
```
Then, inside the `install-note` block, add a Linux line immediately after the
"Windows, direct download" `<p>` (before the closing `</div>` of `install-note`):
```html
        <p class="m">
          <b>Linux:</b> the AppImage is self-contained — make it executable with
          <code>chmod +x Tiger-0.4.0-linux-x64.AppImage</code> and run it. The
          <code>.deb</code> installs with <code>sudo apt install ./Tiger-0.4.0-linux-amd64.deb</code>.
        </p>
```

- [ ] **Step 3: Update existing download filenames to 0.4.0 and add Linux rows**

In `website/index.html` download table, update the mac/windows filenames from
`0.3.1` to `0.4.0`. The mac rows:
```html
              <td><a class="m" href="https://github.com/jtaoufik/tiger/releases/latest">Tiger-0.3.1-mac-arm64.dmg</a></td>
```
→ `Tiger-0.4.0-mac-arm64.dmg`, and:
```html
              <td><a class="m" href="https://github.com/jtaoufik/tiger/releases/latest">Tiger-0.3.1-mac-x64.dmg</a></td>
```
→ `Tiger-0.4.0-mac-x64.dmg`. The windows rows (both link href and text):
```html
              <td><a class="m" href="https://github.com/jtaoufik/tiger/releases/latest/download/Tiger-Setup-0.3.1-windows-x64.exe">Tiger-Setup-0.3.1-windows-x64.exe</a></td>
```
→ both occurrences `0.3.1` → `0.4.0`; same for the `Tiger-Portable-0.3.1-windows-x64.exe` row and the `Tiger-0.3.1-win-x64.zip` row.

Then add two Linux rows immediately before the closing `</tbody>`:
```html
            <tr>
              <td>Linux · AppImage</td>
              <td><a class="m" href="https://github.com/jtaoufik/tiger/releases/latest/download/Tiger-0.4.0-linux-x64.AppImage">Tiger-0.4.0-linux-x64.AppImage</a></td>
              <td class="m">—</td>
            </tr>
            <tr>
              <td>Linux · Debian / Ubuntu</td>
              <td><a class="m" href="https://github.com/jtaoufik/tiger/releases/latest/download/Tiger-0.4.0-linux-amd64.deb">Tiger-0.4.0-linux-amd64.deb</a></td>
              <td class="m">—</td>
            </tr>
```

- [ ] **Step 4: Catch any remaining 0.3.1 references in the site**

Run: `grep -rn "0\.3\.1" website/`
Expected: no remaining download/version references (only historical mentions, if any, in changelog-style copy may remain — update any that refer to "the current version"). Update stragglers to `0.4.0` as appropriate.

- [ ] **Step 5: Add the CHANGELOG entry**

Read the top of `CHANGELOG.md` to match its existing format, then add a new
section above the most recent entry:
```markdown
## 0.4.0

- WSDL / SOAP import: pick a `.wsdl` file and each binding operation becomes a POST request with a ready-to-fill SOAP envelope, the correct Content-Type and (SOAP 1.1) SOAPAction header. Supports SOAP 1.1 and 1.2.
- Linux: first-class builds — AppImage (auto-updating via electron-updater) and a Debian/Ubuntu `.deb`.
- Windows: fixed window resize and maximize, which the acrylic backdrop had blocked. The frosted-glass look now comes entirely from the renderer.
```
(Match the exact heading style — `##` vs `###` — used by the existing entries.)

- [ ] **Step 6: Commit**

```bash
git add website/version.json website/index.html CHANGELOG.md
git commit --no-verify -m "site: 0.4.0 downloads with Linux AppImage/deb; WSDL + resize notes"
```

---

## Task 7: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 2: Full test suite**

Run: `npm run test`
Expected: PASS — all suites green, including `test/core/wsdl.test.ts`.

- [ ] **Step 3: Production build**

Run: `npm run build`
Expected: build completes with no errors.

- [ ] **Step 4: Confirm git state**

Run: `git log --oneline origin/main..HEAD` (or `git log --oneline -8`)
Expected: the Task 1–6 commits present on `feat/wsdl-linux-windows-resize`, none on `main`.

- [ ] **Step 5: Report**

Summarize what changed and explicitly note that packaging/release (`npm run package`, signing, GitHub release for 0.4.0) is the user's to trigger — the plan stops at a green build.

---

## Self-Review

**Spec coverage:**
- Windows resize fix → Task 1. ✓
- WSDL importer (file-only, SOAP 1.1/1.2, envelope skeleton, grouped folder) → Task 3, wired in Task 4. ✓
- `fast-xml-parser` dependency → Task 2. ✓
- Linux first-class (deterministic artifacts, maintainer/synopsis) → Task 5; auto-update needs no code change (noted). ✓
- Website rows + first-launch note + version.json + changelog + version bump → Tasks 5–6. ✓
- Release ownership stays with user → Task 7 Step 5. ✓

**Placeholder scan:** No TBD/TODO. Every code step shows complete code; every command shows expected output. The `<!-- fill in fields -->` string is intentional generated content, not a plan placeholder.

**Type consistency:** `ImportSource` and `ImportKind` both gain `'wsdl'` (Tasks 3 & 4). `importWsdl(xml: string): ImportResult` is referenced identically in `index.ts`, `importers.ts`, and the test. `TigerRequest` shape (name/method/url/headers/query/body) matches `src/core/types.ts`. `KeyValue` fields (name/value/enabled) match. Body `{ type: 'xml', content }` matches `BodyType`. Header auto-defaulting in `request.ts` is not relied upon (importer sets explicit headers).
