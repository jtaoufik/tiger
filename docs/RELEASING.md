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
- `AZURE_SIGN_PUBLISHER` (optional) - publisher name to stamp on the installer; defaults to
  `Taoufik Jabbari` from `package.json`'s `build.win.publisherName`.

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
