# Team sync (git) UX audit

Audited on branch `release/0.7.0-a11y-windows` at `7efe2c4`. Code walked:
`src/main/git.ts`, the `tiger:git:*` handlers in `src/main/index.ts`,
`src/preload/index.ts`, `src/renderer/src/components/GitModal.tsx`, the Team sync
card in `CollectionView.tsx`, the sync chips and header buttons in `Sidebar.tsx`,
and the clone prompt in `App.tsx`.

The renderer was also driven in a browser (`out/renderer` served over HTTP,
Playwright, `window.tiger` replaced by a scripted fake whose git answers are set
per scenario). Screenshots: `docs/ux/git-before-*.png`.

## Where git shows up today (entry points)

| # | Entry point | What it does | Problem |
|---|---|---|---|
| E1 | Sidebar header, git-branch icon | "Clone from Git" | Icon-only; same icon as E3 but a completely different job (download someone else's collection vs sync this one). "Clone" is git jargon. |
| E2 | Sidebar header, two-arrows icon | Import / Export (Postman, OpenAPI, curl) | **Not git at all**, but sits next to E1 and reads as "sync". Nothing labels the difference. |
| E3 | Collection row, git-branch icon (hover only) | Opens the Team sync modal | Invisible until hover; no text. |
| E4 | Collection row, sync chips (`3`, `↑2`, `↓1`, `✓`) | Opens the Team sync modal | Numbers and arrows only, color carries meaning (orange/blue/green). `tabIndex=-1`, so keyboard users cannot reach it. Hidden entirely when change tracking is off. |
| E5 | Collection page, Overview tab, "Team sync" card | Turn on tracking, connect, Sync now, Details, conflict card | A second, partial copy of the modal: its own status wording, its own conflict card, its own sync logic. No change list, no message. |
| E6 | Empty-space context menu, "Clone from Git…" | Same as E1 | Jargon. |
| E7 | Welcome page tile "Clone from Git" | Same as E1 | Jargon. |

Two full implementations of status + sync + conflict (E5 and the modal) drift:
the card says "3 changes not yet shared with the team. 3 file(s) changed", the
modal says "You have 3 changes not yet shared with the team."

## Path by path

### P1. Join a team collection (clone)
- **Sees:** a one-field prompt "Clone from Git / Repository URL / Clone" (before-12).
- **Jargon:** clone, Git, repository URL. No example of what a URL looks like beyond the placeholder, no SSH example, no hint where to find it on GitHub/GitLab.
- **Steps:** 3 (URL, native folder picker, wait). The folder picker is a surprise: nothing said a folder would be asked for, or that a sub-folder named after the repo is created inside it.
- **Validation:** none in the UI. Main rejects anything not starting with `http(s)://`, `git@`, `ssh://` with "That does not look like a repository URL", which arrives as a toast **after** the modal already closed, so the user must reopen and retype.
- **Progress:** toast "Cloning…" that disappears; nothing while a 60 s clone runs.
- **Errors:** `translateGitError` gives one-line hints (good start) but as a toast, with the modal gone; no link, no platform advice (Windows users have Git Credential Manager and never need "credential helper" wording).
- **Dead end:** a browser URL like `https://github.com/team/repo/tree/main` is accepted and fails at git with "Repository not found".

### P2. Turn on change tracking (git init)
- **Sees:** "Track changes in this collection. Step 1 of 2" + "Turn on tracking" on the card; "Change tracking is off" in the modal (before-01, before-02).
- **Jargon:** light. But the step count differs (card says 2 steps, the modal shows none).
- **Dead end:** after init the repo has **no commit**. P3 then fails (see below).

### P3. Connect a shared repository (remote add + first push)
- **Sees:** "Step 2 of 2: connect a shared repository" + URL + Connect (before-03).
- **What happens:** `git remote add origin` then `git push -u origin HEAD` in one go.
- **Dead ends:**
  - Right after P2 there is no commit, so `push HEAD` fails with git's raw `error: src refspec HEAD does not match any`. The user did everything the UI asked and is stuck.
  - If git has no `user.name`/`user.email` (common on a fresh machine), any commit fails with git's raw "Please tell me who you are". Nothing in the app lets them fix it.
  - `setRemote` does not pass stderr through `translateGitError`, so auth failures here are raw git text.
  - The remote stays added even when the push failed; the card then flips to "ready" as if connected.
- **Validation:** same prefix check as P1, only after clicking.

### P4. See changes
- **Card:** a count only ("3 file(s) changed").
- **Modal:** "What you changed" with Edited/New/Deleted chips and file paths turned into `users / get-user` (before-05). These are **file names, not request names**; a request called "Get user" shows as `get-user`, a renamed request shows its old slug.
- Chips rely on color + a short word; no grouping.

### P5. Save a version (commit)
- Only reachable in **Advanced**, button "Commit", disabled until the message field (which lives outside Advanced) has text. Two disclosures apart, jargon label, no default message.
- In the main path, Sync commits silently with "Update collection" when the message is empty, so history fills with identical, meaningless messages.

### P6. Share (push) / P7. Get team changes (pull)
- Main path: one "Sync now" button (commit + fetch + merge pull + push). Good idea, but:
  - No progress text for a call that can take 30 s+ per step; the button just says "Syncing…".
  - Success toast is generic ("Everything is in sync with your team"): it never says what was received or sent.
  - When there is a remote but no upstream (e.g. P3 half-failed), Sync says "Changes saved locally (no team remote configured)", which is false: a remote *is* configured.
- Advanced: "Pull" (`--ff-only`, fails on any divergence with raw git text), "Push", tooltips are literal git commands (`git pull --ff-only`).

### P8. Branch switch / create
- Advanced only: "Branch" select + "new branch, e.g. feature/refunds" + Create (before-06).
- Switching with uncommitted changes either silently carries them over or fails with raw git text; nothing explains which.
- No explanation of what a branch means for the team (is it shared? only after a push).

### P9. Discard
- Advanced only. Inline "Discard everything? Yes, discard / Keep" (good: focus lands on Keep).
- Does **not** say what will be lost (no list, no count).
- `gitDiscardAll` keeps untracked files, so **new** requests survive "discard everything": the result contradicts the label.
- No undo. The change is gone.
- No per-request discard.

### P10. History
- Advanced only, raw `hash subject author · time` rows (before-07). No "who changed what" in the main view even though that is what a product owner asks.

### P11. Diff
- Advanced only, one unified diff of the whole working tree with `diff --git a/... b/...` headers (before-07). Untracked files show a fake `new file (untracked)` line and no content. No per-request view.

### P12. Conflict resolution (`gitSyncResolve`)
- Sync aborts the merge and shows "You and a teammate changed the same thing." with "Keep my version / Use the team's version / Decide later" (before-09).
- Good: one click, never leaves a half-merge, plain words.
- Gaps: it never says **which** requests overlap or **what** each side contains, so "keep mine" is a blind choice. One choice applies to every overlapping request. After "Decide later" nothing anywhere shows that a decision is pending (the sidebar just shows `3`).
- The conflict card exists twice (card + modal) with separate state: a conflict hit on the card is unknown to the modal and vice versa.

### P13. Credential and network errors (`translateGitError`)
- Recognises: terminal prompt disabled / no username, SSH publickey, auth failed / bad token, repo not found, DNS. Good coverage.
- Delivered as a toast that disappears (before-10), in a sentence that assumes git vocabulary ("credential helper", "SSH agent").
- No link, no per-OS instruction (Windows ships Git Credential Manager; macOS users usually need a token or GCM), no "try again" next to the explanation.
- Not applied to `setRemote` (P3) or `commit` (identity errors).

### P14. Git missing
- Both card and modal explain and link to git-scm.com with "Check again". Fine; keep.

### P15. Status at a glance
- Sidebar chips (E4) are numbers + arrows + color; the text version is only in `aria-label`/`title`.
- The collection header shows no status at all; you must open the Overview tab.
- No state for "not tracked", "only on this computer" (no remote) or "conflict pending".

## Summary of problems to fix

1. Two unlabeled git-looking icons in the sidebar header; one is not git.
2. Status is numbers and color; no text state, no "conflict pending".
3. Setup has a guaranteed dead end (push with no commit) and an identity dead end.
4. Clone/connect errors vanish as toasts, with the dialog already closed.
5. Changes are file slugs, ungrouped, with no per-request diff and no default message.
6. Discard does not say what is lost, keeps new files, and has no undo.
7. Conflict choice is blind and global.
8. No progress text; success message never says what happened.
9. Duplicate implementations (card vs modal) that drift.
