/**
 * electron-builder afterSign hook: notarize the macOS app with Apple so it opens
 * without a Gatekeeper warning. Runs ONLY when the three credentials are present,
 * so credential-less local builds (and CI without secrets) still succeed unsigned.
 *
 * Required env at build time:
 *   APPLE_ID                     your Apple ID email
 *   APPLE_APP_SPECIFIC_PASSWORD  app-specific password from appleid.apple.com
 *   APPLE_TEAM_ID                your Developer Team ID
 * Plus a Developer ID Application certificate via CSC_LINK / CSC_KEY_PASSWORD.
 */

const { notarize } = require('@electron/notarize')
const { execFileSync } = require('node:child_process')

exports.default = async function notarizing(context) {
  if (context.electronPlatformName !== 'darwin') return

  const appleId = process.env.APPLE_ID
  const appleIdPassword = process.env.APPLE_APP_SPECIFIC_PASSWORD
  const teamId = process.env.APPLE_TEAM_ID
  if (!appleId || !appleIdPassword || !teamId) {
    console.log(
      'Skipping notarization: set APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD and APPLE_TEAM_ID to notarize.'
    )
    return
  }

  const appName = context.packager.appInfo.productFilename
  const appPath = `${context.appOutDir}/${appName}.app`
  console.log(`Notarizing ${appName} (this can take a few minutes)...`)
  await notarize({ appPath, appleId, appleIdPassword, teamId })
  // Staple the ticket so Gatekeeper validates offline.
  console.log('Stapling notarization ticket...')
  execFileSync('xcrun', ['stapler', 'staple', appPath], { stdio: 'inherit' })
  console.log('Notarization + stapling complete.')
}
