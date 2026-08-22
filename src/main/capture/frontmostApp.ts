import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { logger } from '../logger'

const execFileAsync = promisify(execFile)

const LSAPPINFO_BIN = '/usr/bin/lsappinfo'
const OPEN_BIN = '/usr/bin/open'

/**
 * Bundle id of the frontmost app, via `lsappinfo` — deliberately NOT
 * AppleScript's `tell application "System Events" to ... frontmost`, which
 * requires a separate macOS Automation permission prompt beyond Screen
 * Recording. `lsappinfo`/`open -b` need no special permission at all.
 */
export async function getFrontmostAppBundleId(): Promise<string | null> {
  try {
    const { stdout: asn } = await execFileAsync(LSAPPINFO_BIN, ['front'])
    const trimmedAsn = asn.trim()
    if (!trimmedAsn) return null

    const { stdout: info } = await execFileAsync(LSAPPINFO_BIN, ['info', '-only', 'bundleid', trimmedAsn])
    const match = /"CFBundleIdentifier"="([^"]+)"/.exec(info)
    return match?.[1] ?? null
  } catch (err) {
    logger.error('Could not determine the frontmost app.', err)
    return null
  }
}

// Clicking bare Desktop makes Finder the "active app" from macOS's
// perspective, same as any real app — but it isn't a deliberate app context
// a user wants restored to. Reactivating Finder when it has no open window
// makes macOS spawn a new one (defaulting to its "Recents" gallery view),
// which reads as an unwanted popup, not a focus restoration. Skip it.
const FINDER_BUNDLE_ID = 'com.apple.finder'

/** Re-activates a previously-frontmost app by bundle id (e.g. after Esc cancels a capture). */
export async function activateApp(bundleId: string): Promise<void> {
  if (bundleId === FINDER_BUNDLE_ID) return
  try {
    await execFileAsync(OPEN_BIN, ['-b', bundleId])
  } catch (err) {
    // Best-effort focus restoration, same precedent as magnifier.ts's silent
    // catch: the app the user was in just doesn't come back to the front,
    // but the capture itself is unaffected — not worth a user-facing
    // notification for a focus nicety.
    logger.error(`Could not restore focus to ${bundleId}.`, err)
  }
}
