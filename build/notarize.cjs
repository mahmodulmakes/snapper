const { notarize } = require('@electron/notarize')

// electron-builder afterSign hook. Requires APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD,
// and APPLE_TEAM_ID in env (see CLAUDE.md "npm run dist"). Skips quietly when
// credentials are absent so local `npm run build` never fails on this step.
exports.default = async function notarizeApp(context) {
  const { electronPlatformName, appOutDir } = context
  if (electronPlatformName !== 'darwin') return

  const { APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, APPLE_TEAM_ID } = process.env
  if (!APPLE_ID || !APPLE_APP_SPECIFIC_PASSWORD || !APPLE_TEAM_ID) {
    console.warn('[notarize] Apple credentials not set in env; skipping notarization.')
    return
  }

  const appName = context.packager.appInfo.productFilename

  await notarize({
    appBundleId: 'com.snapperapp.macos',
    appPath: `${appOutDir}/${appName}.app`,
    appleId: APPLE_ID,
    appleIdPassword: APPLE_APP_SPECIFIC_PASSWORD,
    teamId: APPLE_TEAM_ID
  })
}
