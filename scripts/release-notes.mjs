#!/usr/bin/env node
// Generate the GitHub release body for a tag (e.g. v0.6.0): a "which file do I
// download" table per OS, the matching CHANGELOG.md section, and a short note
// about the Windows SmartScreen "unknown publisher" prompt on unsigned builds.
// Used by .github/workflows/release.yml (`node scripts/release-notes.mjs <tag>`).

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')

const tag = process.argv[2]
if (!tag) {
  console.error('Usage: release-notes.mjs <tag>')
  process.exit(1)
}
const version = tag.replace(/^v/, '')

function changelogSection(version) {
  const changelog = readFileSync(join(root, 'CHANGELOG.md'), 'utf8')
  const lines = changelog.split('\n')
  const start = lines.findIndex((l) => l.trim() === `## ${version}`)
  if (start === -1) return null
  let end = lines.length
  for (let i = start + 1; i < lines.length; i++) {
    if (lines[i].startsWith('## ')) {
      end = i
      break
    }
  }
  return lines
    .slice(start + 1, end)
    .join('\n')
    .trim()
}

const changes = changelogSection(version)

// winget is only live once packaging/winget/manifests has a manifest for this
// version AND the publish-winget workflow job actually ran (WINGET_TOKEN set).
// Keep the sentence generic instead of guessing at a specific published state.
const wingetLine = 'winget install jtaoufik.Tiger (once the package is live on winget.run, see packaging/winget/manifests).'

const body = `${changes ? `## What's new\n\n${changes}\n\n` : ''}## Which file do I download?

| Platform | File | Notes |
|---|---|---|
| Windows | **Tiger-Setup-${version}-windows-x64.exe** | Recommended. Graphical installer, Start menu + desktop shortcut. |
| Windows (no install) | Tiger-Portable-${version}-windows-x64.exe | Single exe, no install, run from anywhere. |
| Windows (portable zip) | Tiger-Portable-${version}-windows-x64.zip | Portable (zip): unzip and run Tiger.exe. |
| macOS (Apple Silicon) | Tiger-${version}-mac-arm64.dmg | M1 and later. |
| macOS (Intel) | Tiger-${version}-mac-x64.dmg | Intel Macs. |
| macOS (zip) | Tiger-${version}-mac-arm64.zip / Tiger-${version}-mac-x64.zip | Unzip and drag Tiger.app to Applications. |
| Linux | Tiger-${version}-linux-x64.AppImage | Portable, updates itself in the app. |
| Linux (Debian/Ubuntu) | Tiger-${version}-linux-amd64.deb | \`sudo apt install ./Tiger-${version}-linux-amd64.deb\` |
| Linux (tar.gz) | Tiger-${version}-linux-x64.tar.gz | tar.gz: extract and run ./tiger-api-client |

Stable links that always point at the latest release (no version number to update):
[Tiger-Setup-windows-x64.exe](https://github.com/jtaoufik/tiger/releases/latest/download/Tiger-Setup-windows-x64.exe) ·
[Tiger-Portable-windows-x64.exe](https://github.com/jtaoufik/tiger/releases/latest/download/Tiger-Portable-windows-x64.exe) ·
[Tiger-Portable-windows-x64.zip](https://github.com/jtaoufik/tiger/releases/latest/download/Tiger-Portable-windows-x64.zip) ·
[Tiger-mac-arm64.dmg](https://github.com/jtaoufik/tiger/releases/latest/download/Tiger-mac-arm64.dmg) ·
[Tiger-mac-x64.dmg](https://github.com/jtaoufik/tiger/releases/latest/download/Tiger-mac-x64.dmg) ·
[Tiger-mac-arm64.zip](https://github.com/jtaoufik/tiger/releases/latest/download/Tiger-mac-arm64.zip) ·
[Tiger-mac-x64.zip](https://github.com/jtaoufik/tiger/releases/latest/download/Tiger-mac-x64.zip) ·
[Tiger-linux-x64.AppImage](https://github.com/jtaoufik/tiger/releases/latest/download/Tiger-linux-x64.AppImage) ·
[Tiger-linux-amd64.deb](https://github.com/jtaoufik/tiger/releases/latest/download/Tiger-linux-amd64.deb) ·
[Tiger-linux-x64.tar.gz](https://github.com/jtaoufik/tiger/releases/latest/download/Tiger-linux-x64.tar.gz)

## Updates

Tiger installed with the Windows Setup exe, the macOS dmg or zip, or the Linux AppImage
downloads new versions in the background and offers **Restart now** when one is ready
(or installs it the next time you quit). Turn this off in Settings > About.

The Windows portable exe and portable zip, the Linux .deb and the Linux tar.gz do not
update themselves: Help > Check for Updates links you to the new download instead.
Microsoft Store installs are updated by the Store.

## Windows says "unknown publisher" / "Windows protected your PC"

If the Setup or portable exe is not yet code-signed for this release, SmartScreen shows a
blue "Windows protected your PC" screen the first time you run it. This is expected for an
unsigned exe from a small publisher, not a sign of a problem with the file. To continue:

1. Click **More info**.
2. Click **Run anyway**.

You can avoid the prompt entirely with ${wingetLine}
`

process.stdout.write(body)
