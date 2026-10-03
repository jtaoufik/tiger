# Changelog

All notable changes to Tiger are documented here. The update checker reads
`website/version.json`; keep both in sync when releasing.

## 0.8.1

- Imported requests send with their own variables. Each collection now uses its own environment: opening a request switches to that collection's environment (the one you last picked there), so a second import no longer leaves the first collection's {{variables}} unresolved or pointed at the other collection's host. The collection runner, Copy as curl and export use the right collection's environment too.
- Imports bring what their requests need. OpenAPI and Swagger servers become environments with {{baseUrl}}, server variables such as {env} and the auth placeholders. A WSDL without an address asks for the host. Postman globals are added to every environment, as in Postman. An environment imported after its collection gets the collection's variables. Bruno's {{process.env.NAME}} values are read from the collection's .env file. Variable names with spaces resolve.
- Tiger never selects an environment named like production (prod, production, live) by itself; the import report says so.
- Imported and opened collections start with their folders folded, except the one holding the request that opens, which scrolls into view. The folder page and Run folder include subfolders.
- No more dark text on orange: buttons, selected tabs, chips and the active search match are white on a deep orange in light and dark (the Send button was near-black on orange), danger buttons are white on red, checkboxes draw white checkmarks and the dark switch knob is easier to see.
- After an import, Tiger shows the imported request on its first section, not a page that was open or the Load test section, with its own history.
- Imports are saved. An imported collection is now a collection folder in Documents/Tiger, so it is still there after a restart and Ctrl+S saves your edits (before, an import lived only until Tiger closed and Save did nothing on it). The import report says where it was saved, with a button to open that folder. An environment imported on its own is written into the collection's environments folder. The sample collection, or any collection that only lives in memory, can be saved from its menu (Save to disk) or with Ctrl+S.
- Environment variables resolve on Send in more cases: pressing Send right after launching Tiger or switching collection no longer sends {{variables}} unresolved while the environment file is still loading; the environment you picked in each collection is remembered across restarts; a variable whose value spans several lines or holds a brace or quote (a captured JSON body, a password with "}") no longer makes the environment file unreadable; and one unreadable environment file no longer hides the others.
- Captured values and pm.environment.set() go to the environment the request was sent with, even if you moved to another collection while it was running. A collection run saves the variables its scripts and captures set. pm.environment.unset() is saved.
- OAuth2: the token is reused until it expires instead of being requested again for every send, and the Code tab, Copy as curl and the load test now include it. The load test no longer fills the history, and {{$guid}}-style variables get a new value on every request it fires.
- A folder's auth applies from the first send, not only after its page was opened. Opening a collection shows its first request. The environment manager opens on the collection you are working in, and New environment creates it there. A pasted curl command lands in the collection in use.
- Windows: files checked out with Windows line endings (the Git for Windows default) no longer add a blank line on every save or send XML bodies with a newline before <?xml. Files saved with a byte order mark or as UTF-16 (Notepad, PowerShell) open and import. Folder names Windows refuses (a colon, a question mark, CON, a trailing dot) are adjusted so they can be created and cloned by teammates on Windows. Renaming a folder or an environment only by case works and no longer deletes the environment. Ctrl+W closes the tab, not the window. The title bar follows Tiger's theme. Launching Tiger again brings the open window forward instead of starting a second copy. Restart now with unsaved edits asks first. The window fits small screens and no longer appears empty before its content.
- Requests whose body or script has an unbalanced brace or quote reload correctly. Production environments are never selected by themselves however they are spelled (prod_eu, PROD_US, prd). Postman globals imported on their own sit under your environments instead of replacing the selected one. Insomnia variables with a filter resolve, and Bruno requests keep their order. A file row with a relative path (files/cat.png) is read from the collection folder.
- Importing from other tools is more faithful. Bruno: query parameters go out once (they were sent twice), the body Bruno sends is the one imported, a relative file path is read from the collection folder, only the collection's own environments folder holds environments, and two sibling folders named alike stay apart. Postman and Insomnia: two folders with the same name stay apart (one folder's credentials no longer go out on the other's requests), a disabled environment variable no longer hides a collection variable, a query parameter without a value is sent as ?flag, Insomnia keeps its order, and form values with line breaks stay one field. Several collections imported together keep their own variables (a clashing baseUrl no longer sends one API's requests to the other's host). OpenAPI: declared Authorization and Content-Type parameters no longer override the auth and the body type, application/json; charset=utf-8 keeps its body, a public operation sends no auth, large specs import fast with small example bodies, and an undescribed server that looks like production is named so and never selected by itself. WSDL rpc operations wrap their parts in the operation element. curl: Chrome and Firefox "Copy as cURL" in bash and in Windows cmd format imports, -d sends a form like curl does, -XPUT and curl.exe work. Dropping a project folder finds the collection in it and skips node_modules. A Postman v1 file says to export it again as v2.1.
- Sending is closer to what you asked for. Headers such as Host, Sec-Fetch-*, Keep-Alive or Transfer-Encoding no longer fail the whole request, so a pasted Chrome "Copy as cURL" sends. Cookies come only from Tiger's cookie jar: off means none are sent, and Clear cookies clears them all. Every Send reaches the server (no browser cache answering instead). With Follow redirects off you see the 3xx response, and Max redirects is honoured. Query values that are already percent-encoded are not encoded again. A URL typed without a scheme goes out over http://. A body set on a GET or HEAD is sent (Elasticsearch-style searches). Header and query rows without a name are skipped. Compressed responses are decoded when certificates are configured, and binary responses keep their exact bytes, with the right size and Save to file. Without a proxy of its own, Tiger follows the system proxy (Windows and macOS settings, PAC).
- Code tab: fetch and Python snippets include multipart fields, generated curl never reads a local file the request did not ask for, and a new "curl (Windows cmd)" target runs in cmd.exe. The history no longer stores an API key sent in the query string.
- Export: a Postman export keeps request, folder and collection auth, scripts, docs and file fields, and never writes secret values. The save dialog proposes a file name Windows accepts.
- AI assistants (MCP): the server shown in Settings > AI assistants now starts in the installed app, with Tiger itself (no Node needed); it applies folder auth, sends multipart bodies, lists only requests, names the URL that failed, and only reads files inside the collection. The installed app is about 13 MB smaller.
- Scripts written for Postman and Bruno run as they do there (an undeclared assignment such as data = ..., or a variable named module, no longer fails).
- Team sync works with folders and requests named in any language (Chinese, Hindi, Arabic, accented letters), conflicts included.
- Display: long response lines scroll sideways instead of being cut off; request tabs keep room for their name; Arabic indents the sidebar on the reading side (a click in the middle of a row no longer duplicates the request); method labels on highlighted rows, the Set active icon and disabled buttons are readable; the update banner shows its whole message and toasts appear above it; the response keeps its height at the minimum window size; section tabs wrap instead of hiding Load test; hovering a sidebar row no longer moves the rows below (thanks to ChemaCLi for PR #5), and folder rows show their actions on hover; Send and Cancel have the same width; focus rings are no longer cut off. Error messages no longer start with "Error invoking remote method".

## 0.8.0

- Tiger speaks six languages: English, Simplified Chinese (中文), Hindi (हिन्दी), Spanish (Español), French (Français) and Arabic (العربية). It starts in your system language (Mexican Spanish opens in Spanish, Canadian French in French, Simplified Chinese in Chinese) and falls back to English otherwise.
- Settings > General > Language lists each language in its own name plus System default. Switching is live: the window, the native menu and file dialogs change language without a restart, and the choice is remembered.
- Everything is translated: menus, buttons, tooltips, screen reader labels and announcements, toasts, errors, team sync wording (the git term stays in small print), the update banner, the import report and the welcome checklist. Numbers, dates and "3 minutes ago" follow the language, with the right plural forms (Arabic has six).
- Arabic uses a full right-to-left layout: the sidebar moves to the right, arrows and chevrons are mirrored, and arrow keys follow the reading direction in the sidebar tree, tabs and resizers. URLs, code, JSON and shortcuts stay left to right.
- Chinese, Hindi and Arabic text uses your system's fonts, with taller lines for Hindi and Arabic so nothing is clipped.
- The command palette finds commands by their translated name and by their English name.

## 0.7.1

- Scripts and tests now run in the desktop app. They were blocked by a security setting since 0.2.0; they now run in an isolated sandbox with no access to your files.
- Tiger now updates itself. Installs from the Windows Setup, the macOS dmg or zip and the Linux AppImage download new versions in the background ("Downloading update 0.7.2… 42%") and then show "Tiger 0.7.2 is ready. Restart to update" with Restart now or Later (Later installs it when you quit). Help > Check for Updates checks on demand. Settings > About > Install updates automatically (on by default) asks before downloading when off.
- Portable downloads: a Windows portable zip (unzip and run Tiger.exe), a Linux tar.gz (extract and run ./tiger-api-client) and a macOS zip. The Windows portable exe and zip, the .deb and the tar.gz do not update themselves; Check for Updates links the new download.
- Switching from Postman, Insomnia and Bruno works properly: auth (inherited through folders), form-data files, environments, path variables and OpenAPI path templates now import. Postman scripts keep working (pm.test, pm.expect, pm.response, pm.environment, pm.request.headers). After every import a summary lists what came in and what to check. Drop export files or a folder onto the window to import.
- Faster: the app loads a third of the code at startup, a 2,000-request collection opens about 5 times faster and scrolls smoothly, and very large JSON responses no longer freeze the window.

## 0.7.0

- Windows: one recommended installer (Tiger-Setup) plus a Portable version; the zip is gone. The installer adds Start menu and desktop shortcuts and uses the real Tiger icon. Tiger is also coming to the Microsoft Store as "Tiger API Client", which installs with no "unknown publisher" warning.
- Accessibility: readable contrast in light and dark, a visible focus ring everywhere, full keyboard use of the sidebar tree, tabs, menus and dialogs, screen-reader announcements for results, and support for reduced motion, reduced transparency and Windows High Contrast.
- Clearer menus and names. Every action has one name everywhere: the native menu, the command palette, context menus, tooltips and the shortcuts overlay all read the same list. Request tabs are renamed and reordered by use: Params, Body, Headers, Auth, Save values (was Capture), Scripts & tests, Notes (was Docs), Code snippet (was Code), Load test (was Perf). Settings > MCP is now AI assistants (MCP).
- The sidebar leads with labelled buttons: New (request, folder, collection, environment), Open and Import. Every row has a "More actions" button with the same menu as right click, including Rename. You can now create folders from the app.
- The command palette (Cmd/Ctrl+K) finds commands as well as requests; type ">" for commands only.
- Native menu reorganised: File creates, opens, imports and exports; Request holds Send, Save, Duplicate, Copy as curl, Load test and Run collection; View adds Toggle sidebar (Cmd/Ctrl+B), Theme and zoom that answers Ctrl+= on Windows; Help adds Getting started and Documentation.
- Team sync for people who do not use git. One status, with an icon and words, shows everywhere a collection appears (collection header, overview, sidebar row, dialog): Not tracked, Only on this computer, Not shared yet, 3 local changes, 2 updates from team, Up to date, or Conflict: needs a decision. The git term stays in small print for those who know it.
- Sharing a collection is a three-step guide: turn on version tracking, connect a shared repository (the address is checked as you type, with a one-click fix for a browser page or a missing https://), then share. The first sync now publishes a brand-new collection instead of failing, and an address that cannot be reached no longer leaves a half-connected collection.
- Your changes are listed as requests, grouped Added / Changed / Removed, with the diff of each one on click and a suggested version note ("Update Get user, add Create post") you can edit. Sync shows what it is doing ("Getting team's changes…") and what it did ("Synced: 2 updates received, 3 sent.").
- Discarding changes, all of them or one request, asks first and names what will be lost, now includes new requests, and can be undone right after.
- Conflicts show your version and the team's version side by side for each request, with Keep mine / Keep theirs per request, Keep all mine / Keep all theirs, or Decide later (the conflict stays flagged until you choose).
- Sign-in problems stay on screen with steps for your system and links: Git Credential Manager (built into Git for Windows), a personal access token, or an SSH key. If git does not know your name yet, Tiger asks for it inline.
- "Clone from Git" is now "Join a team collection", a guided dialog that keeps errors and the fix in view. New commands in the menu and palette: Join a team collection, Team sync, Sync with team, Save a version, Share with your team. Version lines (branches), get-only and share-only steps and the full diff stay under Advanced.
- The home screen has a three-step Getting started checklist, and complex panels (Save values, Scripts & tests, Load test, Auth, Environments, Import and export, Runner, Response, AI assistants) carry a "?" that opens their guide.

## 0.6.0

- Sync conflicts are now resolved inside Tiger. When you and a teammate change the same thing, the sync card asks whose version should win where the changes overlap: "Keep my version" or "Use the team's version". Everything that does not overlap is combined automatically, and the shared history keeps both sides. No editor, no merge tools, no git knowledge required.
- Team sync leads with plain language. The sync panel shows what you changed (Edited / New / Deleted, by request name), an optional "Describe your changes" note, and one Sync button. Branches, pull, push, commit, diff and history moved behind an Advanced section for people who want them.
- Windows: right-clicking any text field now shows the native Cut / Copy / Paste menu, file dialogs open attached to the Tiger window instead of behind it, "Show in Explorer" highlights the file reliably, and the Help menu gains "Check for Updates" and a proper About box. Fixed a bug where renaming a folder could silently detach the requests inside it and resurrect the old folder on the next save.
- macOS: entering full screen no longer leaves a gap where the traffic lights were, and Control-based text editing shortcuts (Ctrl+K, Ctrl+T, Ctrl+F) keep their standard meaning inside inputs instead of triggering app actions.
- Closing the window with unsaved request edits now warns before discarding them.
- Keyboard shortcut labels match the platform everywhere (Cmd on macOS, Ctrl elsewhere), the shortcuts overlay documents every binding including Cmd/Ctrl+F response search and F2 rename, and the Windows key no longer triggers app shortcuts.
- Polish: rename and confirmation dialogs focus the right control so Enter works immediately, context menus stay inside the window and support arrow-key navigation, clearing history asks for confirmation, sidebar rows are keyboard-focusable, and animations respect the system reduced-motion setting.

## 0.5.2

- Clone from Git no longer fails silently when credentials are missing. Git operations run with `GIT_TERMINAL_PROMPT=0` so the Electron process never hangs on a hidden prompt; the side-effect was that a private HTTPS clone with no credential helper surfaced the cryptic `fatal: could not read Username for 'https://…': terminal prompts disabled`. Clone, push, pull, fetch and sync now translate that case — and the common SSH-key, bad-PAT, repo-not-found and host-unreachable errors — into a one-line message the user can act on.

## 0.5.1

- Response viewer no longer freezes on multi-megabyte bodies. Past 1 MB the panel only renders a leading slice of the body into the DOM and surfaces a banner ("Body truncated to 1 MB for performance…"); Copy and Save still operate on the full response. Previously a ~10 MB JSON body would stall the renderer because it was pushed as a single `white-space: pre` text node into the layout.

## 0.5.0

- Native application menu: a proper File / Edit / Request / View / Window / Help layout that surfaces every core action (New Request, New/Open Collection, Import / Export, Send, Save, Command Palette, Environments, History, Keyboard Shortcuts) with its accelerator, on macOS, Windows and Linux. Replaces Electron's stock default menu, so there is no developer-only Reload / DevTools clutter for end users and no off-topic Help links. Developer tools stay available in development builds only.
- Window state is remembered between launches: Tiger reopens at the size and position you left it, and restores a maximized window. A position on a display that is no longer connected is ignored and falls back to the default placement.
- Windows: the Tiger logo in the titlebar now sits flush at the leading edge instead of being offset by the macOS-only traffic-light padding.
- Dark mode: declare `color-scheme: dark` on the renderer so Chromium paints native form controls in the matching theme. This fixes the white patches around the method dropdown and scrollbars, and the black `GET` / `POST` / … labels in the method `<select>` on Windows.
- Windows packaging now produces a portable `.zip` (`Tiger-Portable-<version>-windows-x64.zip`) alongside the NSIS installer and the portable `.exe`.
- Releases: publishing a new tag deletes prior GitHub releases so the downloads page always points at the current build. Git tags are preserved.

## 0.4.1

- WSDL / SOAP import now produces ready-to-send requests. The operation's parameters are expanded from the WSDL `<types>` schema into the SOAP body, the mandatory `SOAPAction` header is always sent for SOAP 1.1 (even when empty), and a single SOAP binding is used so operations are no longer duplicated across SOAP 1.1 and 1.2; non-SOAP HTTP bindings are ignored.
- Welcome screen: the ways into a collection (Open, New collection, Clone, Import) now lead the screen as prominent cards, above the secondary tools.

## 0.4.0

- WSDL / SOAP import: pick a `.wsdl` file and each binding operation becomes a POST request with a ready-to-fill SOAP envelope, the correct Content-Type and (SOAP 1.1) SOAPAction header. Supports SOAP 1.1 and 1.2.
- New collection: create an empty collection folder on disk from the welcome screen or the sidebar.
- Linux: first-class builds - AppImage and a Debian/Ubuntu `.deb`, built in CI.
- Windows: fixed window resize and maximize, which the acrylic backdrop had blocked. The frosted-glass look now comes entirely from the renderer.
- Response view: a more opaque, readable surface for response bodies while the chrome keeps its frosted look.
- Downloads: the website links straight to GitHub Releases instead of versioned filenames.

## 0.3.1 · 2026-06-12

- Complete tab management: right-click menu (Close / Close others / Close to the right / Close all / Reveal in sidebar), drag-to-reorder, unsaved-change dots, Cmd/Ctrl+1-9 tab jumps, active tab kept in view
- Session restore: open collections, the tab strip and the active tab survive restarts
- Collection runner with live pass/fail from script tests, on collection and folder pages
- multipart/form-data bodies with per-row file upload; curl -F codegen
- Response power tools: Cmd/Ctrl+F search with highlights, sandboxed HTML preview, inline image preview, timing breakdown on hover
- Keyboard shortcuts overlay (Cmd/Ctrl+/), close-tab, tab cycling, quick-create, focus-URL
- Sidebar: inline rename (double-click or F2), duplicate folder, drag requests between folders (moves files on disk)
- Collection and folder pages organized in tabs; Code and Perf are editor tabs
- Windows builds return: install via winget (no SmartScreen prompt) or the direct installer

## 0.3.0 · 2026-06-12

- Now open source under the MIT license
- Pre-request and post-response scripts (sandboxed JS) with assertions and a tests panel
- Collection and folder pages open as tabs; folder-level documentation and default auth, inherited request -> folder -> collection
- Export collections to OpenAPI 3.0 (import already supported OpenAPI and Swagger)
- Response timing breakdown: TTFB (waiting), download and total, with DNS/TCP/TLS phases on the certificate send path
- Large JSON paste and big responses stay responsive (pretty-print and highlighting cap past ~2 MB; cheaper editor validity check)
- Imported client certificates (CA bundle, PEM pair, PFX), persistent cookie jar, dynamic variables, GraphQL body
- Per-request and per-collection history; Lucide icon set; background auto-update from GitHub Releases
- macOS builds are signed and notarized; the `package` script now builds the MCP server and unpacks it from the asar

## 0.2.0 · 2026-06-11

- New tiger mascot across app icon, dock and logo
- JSON syntax highlighting in the response panel, with Pretty/Raw and word-wrap toggles
- Command palette: Cmd/Ctrl+K jumps to any request across open collections
- Duplicate requests from the sidebar
- Unresolved `{{variable}}` warning under the URL bar
- Cancel in-flight requests
- Format button and invalid-JSON indicator for JSON bodies
- Unsaved-changes indicator on the Save action
- Resizable sidebar and editor/response split, remembered between sessions
- Update checker: the app detects new releases and shows the changelog
- Settings cleanup: analytics is a single toggle, no manual GA4 credentials

## 0.1.0 · 2026-06-10

First public preview.

- Local-first collections: every request is a plain text `.tiger` file
- Multi-collection workspace with collapsible folders, search, duplicate and delete
- Environments with `{{variable}}` interpolation everywhere
- Auth: OAuth 2.0 client credentials, Bearer, Basic, API key
- Importers: Postman v2.0/v2.1, Insomnia v4, Bruno folders, OpenAPI 3 / Swagger 2
- Postman export, curl and fetch code generation
- Proxy (HTTP/HTTPS/SOCKS), SSL verification toggle, redirect and timeout controls
- History of the last 200 sends
- MCP server: AI clients can list, read and run requests
- Glass UI with light, dark and system themes
- macOS (Apple Silicon and Intel) and Windows (installer and portable) builds
