import { shell, systemPreferences } from 'electron'

/**
 * Whether this process is trusted for Accessibility — required for
 * scroll-event synthesis (main/capture/scrollSynthesis.ts), separate from
 * Screen Recording. Per BUILD-SPEC.md §3.5: request lazily, on first
 * scrolling-capture attempt, not at launch — most users never touch this
 * feature and shouldn't be asked for a permission they don't need.
 */
export function isAccessibilityGranted(): boolean {
  return systemPreferences.isTrustedAccessibilityClient(false)
}

/**
 * Prompts the OS's Accessibility permission dialog if not already granted.
 * Unlike Screen Recording (confirmed in this codebase to need a relaunch
 * before a granted status is visible), AXIsProcessTrusted-backed checks are
 * expected to reflect a live grant without restarting — but that's from
 * Apple's general API contract, not verified firsthand against this app the
 * way the Screen Recording gotcha was. Treat as unconfirmed until tested.
 */
export function requestAccessibilityAccess(): boolean {
  return systemPreferences.isTrustedAccessibilityClient(true)
}

export async function openAccessibilityPrivacySettings(): Promise<void> {
  await shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility')
}
