# Releasing Tiger

`git tag vX.Y.Z && git push --tags` triggers `.github/workflows/release.yml`, which builds
macOS, Windows and Linux installers, attaches them to a GitHub release for that tag, writes
the release body, and deletes older releases (tags are kept).

Before tagging: bump `version` in `package.json` and add a `## X.Y.Z` section to
`CHANGELOG.md` (the release notes step pulls that section verbatim into the release body),
and update `website/version.json` (the in-app update checker reads it).

## macOS signing (Developer ID + notarization)

Optional; the build works unsigned without these. Set as repo secrets:

- `MAC_CSC_LINK` / `MAC_CSC_KEY_PASSWORD` - base64 `.p12` Developer ID Application
  certificate + its password.
- `MAC_NOTARY_KEY` / `MAC_NOTARY_KEY_ID` / `MAC_NOTARY_ISSUER` - App Store Connect API
  key (base64 `.p8`), key ID and issuer ID, used to notarize and staple the DMGs.

## Windows signing

Optional; the build works unsigned without any of these (SmartScreen then shows an
"unknown publisher" warning on first run - see `website/docs/install/`). The workflow tries,
in order, whichever of these is configured:

### 1. Azure Trusted Signing (preferred)

Free/cheap, signs every exe electron-builder produces (installer + portable), no manual
review step per release. Set up a Trusted Signing account + certificate profile in Azure,
then a Microsoft Entra app registration with permission to sign through it, and add:

- `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET` - the Entra app's credentials
  (read by electron-builder's Azure signing manager via `EnvironmentCredential`).
- `AZURE_SIGN_ENDPOINT` - the Trusted Signing account's regional endpoint URI.
- `AZURE_SIGN_ACCOUNT` - the Code Signing Account name.
- `AZURE_SIGN_PROFILE` - the Certificate Profile name.
- `AZURE_SIGN_PUBLISHER` (optional) - publisher name to stamp on the installer
  (`win.publisherName`). Left unset, electron-builder just reads it off the signing
  certificate. Do not hardcode a `publisherName` in `package.json`: electron-updater's NSIS
  updater checks a future installer's Authenticode signer against it, so a stale or
  mismatched value (or one present on an unsigned build) breaks in-app updates.

These are passed to electron-builder as `-c.win.azureSignOptions.*` CLI overrides rather than
baked into `package.json`, so an unsigned build never has `azureSignOptions` set (which would
otherwise force electron-builder to require signing even without the secrets).

### 2. SignPath Foundation (fallback)

Used only when Azure secrets are absent. Free code signing for open source projects; apply at
https://signpath.io/foundation. Once approved, add:

- `SIGNPATH_API_TOKEN` (secret)
- `SIGNPATH_ORG_ID`, `SIGNPATH_PROJECT_SLUG`, `SIGNPATH_POLICY_SLUG` (repo variables)

The workflow uploads the unsigned NSIS installer as a build artifact, submits it to SignPath
via `signpath/github-action-submit-signing-request@v1`, waits for completion, and swaps the
signed exe back in before it's attached to the release.

**Limitation:** this only signs the outer installer exe. The app binary packed inside it, and
the separate portable exe, stay unsigned with this path. Prefer Azure Trusted Signing (or a
PFX certificate) when every exe needs to be signed.

### 3. Plain PFX certificate

If you already hold a standard code-signing certificate:

- `WIN_CSC_LINK` - base64-encoded `.pfx`/`.p12`.
- `WIN_CSC_KEY_PASSWORD` - its password.

Passed through to electron-builder as `CSC_LINK` / `CSC_KEY_PASSWORD`, same mechanism as the
macOS signing above.

### Verifying what shipped

Every Windows run logs `Get-AuthenticodeSignature` for each `.exe` under `release/` ("Report
Windows signature status" step), so the Actions log always states signed vs. unsigned and
which certificate signed it - check that after any signing-secret change.

## Microsoft Store (MSIX)

The Store route sidesteps SmartScreen and code signing entirely - Microsoft signs the
package on ingestion. This only needs doing once per machine/account; after that, tagging a
release is enough (see "Submitting future versions" below).

### One-time setup (Taoufik does this by hand in Partner Center)

1. Create a free individual developer account at
   [partner.microsoft.com](https://partner.microsoft.com/dashboard) (no company registration
   or fee for an individual account).
2. **Reserve the app name**: Apps and games → New product → MSIX or PWA app → name it
   `Tiger`. If that's taken, fall back to `Tiger API Client`.
3. Open the new product's **Product identity** page (under Store setup) and copy three
   values into this repo's GitHub Actions **repository variables** (Settings → Secrets and
   variables → Actions → Variables - these aren't secret, they're just identifiers):
   - `Package/Identity/Name` → repo variable `MSSTORE_IDENTITY_NAME`
   - `Package/Identity/Publisher` (looks like `CN=XXXXXXXX-XXXX-...`) → `MSSTORE_PUBLISHER`
   - `Publisher display name` → `MSSTORE_PUBLISHER_DISPLAY_NAME`
4. Note the **Store Product ID** (Product management → Product ID, a 12-character code) for
   later automation - that's `MSSTORE_PRODUCT_ID` below.
5. **First submission is manual** (the CLI/Action route only updates an app that's already
   live). Under Store setup → Properties:
   - Category: **Developer tools**.
   - Age rating: run the rating questionnaire - Tiger has no user-generated content, ads, or
     data collection beyond the optional analytics toggle, so it should clear at the lowest
     tier.
   - Privacy policy URL: `https://jtaoufik.github.io/tiger/privacy/`.
   - Screenshots: at least one 1366x768 (or larger, 16:9) desktop screenshot;
     `website/screenshot.png` works, or capture fresh ones.
   - Packages: upload the `tiger-msstore-appx` workflow artifact's `.appx` from a tagged
     release run (Actions → that run → Artifacts).
   - Capabilities: Tiger's `runFullTrust` capability (implicit in every Electron/Win32 MSIX
     packaged app - it's not a sandboxed UWP app) needs no extra justification text in the
     submission form beyond what Partner Center's own checklist asks; if asked why, it's
     "packages a Win32/Electron desktop app, which requires full trust to run."
   - Submit and wait for certification (usually well under 24h).

### Building the package

`.github/workflows/release.yml`'s `build` job (windows-latest leg) builds `build/appx` into
an unsigned `.appx` whenever `MSSTORE_IDENTITY_NAME`, `MSSTORE_PUBLISHER` and
`MSSTORE_PUBLISHER_DISPLAY_NAME` are all set as repo variables - real values from step 3
above, never hardcoded in `package.json`. It's uploaded as a workflow artifact named
`tiger-msstore-appx`, not attached to the GitHub release (the Store is a separate
distribution channel from the GitHub installers).

Store tile assets live in `build/appx/` (`StoreLogo.png`, `Square44x44Logo.png`,
`Square150x150Logo.png`, `Wide310x150Logo.png`, `LargeTile.png`, `SmallTile.png`,
`SplashScreen.png`, plus `.scale-200` variants of the four logos). Regenerate them from
`build/icon.png` with `python3 scripts/generate-appx-assets.py` if the icon changes.

### Submitting future versions

Optional automation once the app is live: add `MSSTORE_TENANT_ID`, `MSSTORE_SELLER_ID`,
`MSSTORE_CLIENT_ID`, `MSSTORE_CLIENT_SECRET` and `MSSTORE_PRODUCT_ID` as secrets (see the
Entra app registration + Partner Center steps in
[Microsoft's GitHub Actions guide](https://learn.microsoft.com/windows/apps/publish/msstore-dev-cli/github-actions))
and the `publish-msstore` job (disabled while `MSSTORE_CLIENT_SECRET` is unset) uploads the
new `.appx` via the MSStore Developer CLI (`microsoft/microsoft-store-apppublisher` action +
`msstore publish`) on every tagged release. Until then, upload the `tiger-msstore-appx`
artifact by hand from Partner Center → Packages → Update package.

Store policy requires the Store to own updates for MSIX installs, so `checkForUpdate()`
(`src/main/http.ts`) and the background `electron-updater` check (`src/main/autoUpdate.ts`)
both no-op when `process.windowsStore` is true - a Store install never sees Tiger's own
"update available" prompt.

## winget and Scoop

`packaging/winget/manifests/j/jtaoufik/Tiger/<version>/` holds a ready-to-submit winget
manifest set for the NSIS installer (`InstallerType: nullsoft`, `Scope: user`). Submit new
versions by hand with the [`wingetcreate`](https://github.com/microsoft/winget-create) CLI or
a PR to [microsoft/winget-pkgs](https://github.com/microsoft/winget-pkgs), or automatically:
add a fine-grained GitHub PAT (with permission to open PRs against `winget-pkgs`) as the
`WINGET_TOKEN` secret and the `publish-winget` job (disabled while that secret is unset) will
run `vedantmgoyal9/winget-releaser` on every tagged release.

`packaging/scoop/tiger.json` is a [Scoop](https://scoop.sh) manifest for the portable exe,
with `checkver`/`autoupdate` wired to GitHub releases. Submit it to the
[`scoop-extras`](https://github.com/ScoopInstaller/Extras) bucket, or host it in a personal
bucket (`scoop bucket add <name> <repo-url>`).

## What the release body looks like

`scripts/release-notes.mjs <tag>` builds the GitHub release body: the matching `## X.Y.Z`
section from `CHANGELOG.md`, a "which file do I download" table per OS (including the
version-less alias links, e.g. `Tiger-Setup-windows-x64.exe`, that the workflow copies
alongside each versioned file so external links never need to change), and the SmartScreen
"unknown publisher" explainer. The `publish-notes` job runs it after every OS has attached its
installers and sets it as the release's body via `gh release edit --notes-file`.
