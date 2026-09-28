# Menus and features audit (0.7.0)

Scope: every menu, toolbar, context menu and panel outside the git / team-sync UX
(GitModal, git.ts, the clone/sync controls and the git parts of CollectionView are
owned by a separate redesign and are left untouched here).

Method: `npx electron-vite build`, `out/renderer` served with `python3 -m http.server`,
driven with Playwright at 1440x900 in the browser-preview fallback (sample collection).
Screenshots: `docs/ux/before-*.png` (current) and `docs/ux/after-*.png` (after the fix).
The native menu was read from `src/main/menu.ts`.

Legend: **ICON** unlabeled icon-only control, **JARGON** term a newcomer will not
understand, **DUP** same action reached with different names or behaviour, **HIDDEN**
feature only reachable from a place nobody looks, **NAME** inconsistent naming,
**WRONG** item in the wrong menu, **MANY** too many choices at once, **EMPTY** missing
empty state or next-step hint.

## Native application menu (`src/main/menu.ts`)

| issue | finding |
|---|---|
| WRONG | `Request` holds Command Palette, Environments and History, none of which act on a request. |
| HIDDEN | No Duplicate, Copy as curl, Load test or Run in any native menu. |
| HIDDEN | No toggle sidebar, no theme switch, no keyboard shortcuts in View. |
| NAME | `Import / Export…` (File) vs `Import / Export` (sidebar) vs `Import` (welcome); `Open Collection…` vs `Open collection folder` vs `Open a folder` vs `Open a collection`. |
| NAME | Title Case in the menu ("New Request") vs sentence case everywhere in the app ("New request"). |
| MISSING | View zoom uses the stock `zoomIn` role: `Ctrl+Plus` needs Shift on Windows, so `Ctrl+=` does nothing there. |
| MISSING | Help has no link to the docs site and no "Getting started". |
| DUP | Labels are string literals in main and again in the renderer (palette, overlay, context menus, tooltips): four copies that already drifted. |

## Sidebar header and rows (`Sidebar.tsx`)

| issue | finding |
|---|---|
| ICON | Header is four bare icons (folder, plus, branch, arrows). The plus reads as "new request" but creates a collection; the arrows icon (Import / Export) is unguessable. |
| HIDDEN | No way to create a folder anywhere in the app; no way to create an environment outside the modal. |
| HIDDEN | Rename is double-click or F2 only; nothing in any menu says so. |
| HIDDEN | Row context menus (right click) are the only way to Run a folder or copy as curl, and nothing hints they exist. |
| NAME | Collection row "Close collection" uses an X in the row but a trash can in the context menu and on the collection page, which reads as "delete from disk". |

## Context menus (`App.tsx`)

| issue | finding |
|---|---|
| NAME | Request: `Duplicate`, `Copy as cURL`, `Delete…` vs row tooltips `Duplicate request`, `Delete request`; export modal says `Request as cURL`. |
| NAME | Folder: `Open folder` means "show the folder page" while `Open a folder` in the sidebar means "open a directory from disk". |
| MISSING | Folder: no Rename, no New folder. Collection: no Run, no New folder, no Export. Request: no Rename. |
| WRONG | Workspace (empty area) menu offers `New request` which silently targets the first collection. |
| DUP | `Import / Export…` in three menus, all opening the same combined modal. |

## Request editor tabs (`RequestEditor.tsx`)

| issue | finding |
|---|---|
| JARGON | `Capture`: nothing says it stores a response value in a variable. |
| JARGON | `Perf`: abbreviation; it is a load test. |
| JARGON | `Docs` (it is per-request notes, not documentation), `Code` (it is a generated code snippet), `Scripts` (hides that tests live here). |
| MANY | Nine tabs in definition order, Body fourth although it is the second most used. |
| EMPTY | Capture and Scripts tabs open on an empty table / textarea with no explanation and no link to the docs. |

## Response panel toolbar (`ResponsePanel.tsx`)

| issue | finding |
|---|---|
| ICON | Copy and Save-to-file are bare icons next to the status. |
| EMPTY | Empty state is fine ("Ready when you are"); no link to response docs. |

## Environment selector and Environments modal

| issue | finding |
|---|---|
| ICON | Pencil next to the environment select opens the manager; a pencil suggests "rename this one". |
| ICON | In the modal the Secret toggle is an eye, and the Reveal button is also an eye: two eyes, two meanings. |
| EMPTY | No help link explaining `{{variables}}` precedence. |

## Settings (`SettingsView.tsx`)

| issue | finding |
|---|---|
| JARGON | Tab `MCP` means nothing to most users. |
| EMPTY | Certificate files and passphrase have no one-line description; each tab has no intro line. |
| MANY | Advanced mixes host exceptions, redirects and six certificate fields with no grouping hint. |

## Import / Export modal, History, Runner

| issue | finding |
|---|---|
| DUP | One modal for two opposite jobs; entry points never say which half they want. |
| NAME | `Request as cURL` vs `Copy as cURL` vs `Code` tab. |
| EMPTY | Runner modal: no help link. Import: no help link to the importing guide. |

## Command palette (`PaletteModal.tsx`)

| issue | finding |
|---|---|
| HIDDEN | Only finds requests. No commands, so the palette cannot be used to discover features. |
| NAME | Called "Command palette" in the menu and overlay, "Go to request" in the dialog, "Jump anywhere" on the welcome screen. |

## Collection and folder pages

| issue | finding |
|---|---|
| NAME | Collection page `Import / Export` (import makes no sense from inside an existing collection); `Run` vs folder `Run` vs context menu `Run folder`. |
| ICON | Collection page trash icon closes the collection (does not delete files). |

## Welcome view

| issue | finding |
|---|---|
| EMPTY | No first-run path: eight tiles of equal weight, no "do this first". |
| NAME | `Jump anywhere` is the command palette under a third name. |

## Shortcuts overlay (`ShortcutsModal.tsx`)

| issue | finding |
|---|---|
| DUP | Hard-coded list, separate from the menu accelerators and the palette; already missing Cmd+Shift+W and zoom. |

## Fix plan (applied in this branch)

1. `src/core/actions.ts`: one registry (id, label, description, shortcut, group, docs
   page). Main (native menu) and renderer (palette, overlay, context menus, tooltips)
   both read it; `src/renderer/src/actions.tsx` adds icons.
2. Native menu rebuilt from the registry in logical groups; zoom accepts `Ctrl+=`.
3. Sidebar header: labelled `New` menu (Request, Folder, Collection, Environment),
   `Open`, `Import`; rows gain a `More actions` button that opens the row menu.
4. Request tabs renamed and reordered, each with a count or dot when set, and a
   one-line description plus a docs link in the less obvious panels.
5. Palette searches requests and commands.
6. Welcome view gets a three-step getting started block.
7. Settings: `AI assistants (MCP)`, intro line per section, one line per setting.
8. Help links ("?") on complex panels, only to pages that exist in `website/docs`.
