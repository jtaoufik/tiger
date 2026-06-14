# Design: Windows resize fix · WSDL import · first-class Linux

Date: 2026-06-14
Status: Approved (pending spec review)
Target version: 0.4.0

Three independent changes to Tiger, each fitting an existing pattern. No
architectural changes.

---

## 1. Windows resize fix (bug)

### Problem
On Windows the window cannot be resized / maximized via the native caption
buttons or edge drag.

### Cause
`src/main/index.ts:56` sets `backgroundMaterial: process.platform === 'win32' ? 'acrylic' : undefined`.
The DWM acrylic backdrop is a known Electron cause of broken edge-resize and
maximize on Windows 11.

### Fix
Remove the acrylic backdrop on Windows — set `backgroundMaterial` to `undefined`
unconditionally (or delete the property). The renderer already paints a CSS
glass fallback (see the comment at `index.ts:53-54`) and `backgroundColor` is
already set, so the visual result is preserved while native resize, maximize and
caption buttons work again.

- File: `src/main/index.ts` (one line).
- No new code, no new dependency.
- Verification: `npm run build` succeeds; manual Windows verification is the
  user's (cannot reproduce from macOS). The change is strictly subtractive and
  cannot regress mac/Linux (the property was win32-only).

---

## 2. WSDL importer (feature)

Scope decision: **WSDL importer only** (not a full SOAP request mode). It mirrors
the OpenAPI importer and plugs into the existing Import dialog — no new UI
surface. Source is a **local file only** (parity with the OpenAPI/Postman
importers); URL fetch is explicitly out of scope for v1.

### New module: `src/core/import/wsdl.ts`
Signature: `importWsdl(xml: string): ImportResult`

Parsing uses **`fast-xml-parser`** (new runtime dependency — pure JS, isomorphic,
small; the importer runs in the Node main process which has no `DOMParser`).
Parser configured to preserve namespace prefixes and attributes.

Algorithm:
1. Read `definitions/@targetNamespace` and `definitions/@name`.
2. Endpoint URL: first `service/port` whose child is `soap:address` or
   `soap12:address`; take its `@location`. Fallback `{{baseUrl}}`.
3. SOAP version: detect from the binding child — `soap:binding` (1.1) vs
   `soap12:binding` (1.2).
4. For each `binding/operation`:
   - name = `@name`
   - soapAction = child `soap:operation/@soapAction` (or `soap12:operation`),
     default `""`
   - Build a SOAP envelope skeleton (see below).
   - Emit a `TigerRequest`:
     - `method: 'post'`
     - `url`: endpoint
     - `body: { type: 'xml', content: <envelope> }`
     - headers:
       - SOAP 1.1: `Content-Type: text/xml; charset=utf-8`,
         `SOAPAction: "<soapAction>"`
       - SOAP 1.2: `Content-Type: application/soap+xml; charset=utf-8; action="<soapAction>"`
         (no separate SOAPAction header)
5. Group every operation under one folder named after the service / definitions
   name. `ImportResult.requests` are `{ path: [serviceName], request }`.

### Envelope skeleton
SOAP 1.1 example:
```xml
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"
               xmlns:tns="<targetNamespace>">
  <soap:Body>
    <tns:<RequestElement>>
      <!-- fill in fields -->
    </tns:<RequestElement>>
  </soap:Body>
</soap:Envelope>
```
SOAP 1.2 uses envelope namespace `http://www.w3.org/2003/05/soap-envelope`.

`<RequestElement>` is resolved best-effort: the input `message`'s `part/@element`
local name when present (document/literal), else the operation name (rpc style).

**Out of scope (v1):** deep XSD → fully-populated sample bodies. We emit a correct
envelope with a `<!-- fill in fields -->` placeholder; the user completes it.
This mirrors how the OpenAPI importer emits `{}` when a schema has no example.

### Wire-up
- `src/core/import/types.ts`: add `'wsdl'` to `ImportSource`.
- `src/core/import/index.ts`: `export { importWsdl } from './wsdl'`.
- `src/main/importers.ts`: add `'wsdl'` to `ImportKind`; in `importFromDisk`, add
  a branch that picks a `.wsdl` / `.xml` file, reads it as text and calls
  `importWsdl`.
- `src/renderer/src/components/ImportExportModal.tsx`: add one entry to the
  `IMPORTS` array — `{ kind: 'wsdl', title: 'WSDL / SOAP', desc: 'WSDL 1.1 service (.wsdl / .xml)' }`.

### Tests
`test/` gets a fixture WSDL (a small SOAP 1.1 service, e.g. a weather lookup) and
a vitest spec asserting: operation count, endpoint URL, per-operation method =
post, `SOAPAction` header value, and that the body is a well-formed envelope
containing the request element. Add a minimal SOAP 1.2 fixture asserting the
1.2 content-type / envelope namespace.

---

## 3. First-class Linux release

### Build config (`package.json` → `build.linux`)
Already declares `AppImage` + `deb`. Make it deterministic and lint-clean:
- Add explicit `target` entries with `artifactName`:
  - `Tiger-${version}-linux-x64.AppImage`
  - `Tiger-${version}-linux-amd64.deb`
- Add `maintainer` and `synopsis` (electron-builder warns on deb without a
  maintainer).
- Keep `category: "Development"` and `icon: build/icon.png`.

### Window code
No change needed. `backgroundMaterial` (after fix #1) and `vibrancy` are gated to
win32 / darwin respectively, so Linux already gets a plain native frame with
`backgroundColor` behind the CSS glass. Confirm only.

### Auto-update
No code change. `electron-updater` auto-updates the **AppImage** once a release is
published with the generated `latest-linux.yml`; `src/main/autoUpdate.ts` is
already platform-generic. `.deb` updates via the user's package manager
(expected; documented on the site).

### Website (`website/index.html`)
- Add two rows to the download table (after the Windows rows):
  - `Linux · AppImage` → `Tiger-0.4.0-linux-x64.AppImage`
  - `Linux · Debian / Ubuntu` → `Tiger-0.4.0-linux-amd64.deb`
- Add one line to the "First launch" note: AppImage needs
  `chmod +x Tiger-0.4.0-linux-x64.AppImage` then run it.

### Version bump → 0.4.0
- `package.json` `version`.
- `website/version.json` `version` + refreshed `notes` (mention WSDL import,
  Linux builds, Windows resize fix).
- `website/index.html` copy ("Version 0.3.1" strings → 0.4.0; download filenames).
- `CHANGELOG.md` new 0.4.0 entry.

---

## Release ownership

All code, website, and version changes are made and verified locally:
`npm run typecheck`, `npm run test`, `npm run build` must all pass. The actual
`npm run package`, signing, and GitHub release are **user-triggered** (per the
no-auto-deploy rule) — the spec stops at a green build.

## File touch list
- `src/main/index.ts` — drop acrylic.
- `src/core/import/wsdl.ts` — new importer.
- `src/core/import/types.ts`, `src/core/import/index.ts` — wire source.
- `src/main/importers.ts` — file picker + dispatch.
- `src/renderer/src/components/ImportExportModal.tsx` — import option.
- `package.json` — `fast-xml-parser` dep, linux targets, version 0.4.0.
- `website/index.html`, `website/version.json` — Linux rows + version.
- `CHANGELOG.md` — 0.4.0 entry.
- `test/wsdl.test.ts` + fixture(s) — coverage.
