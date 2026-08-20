import { shell, systemPreferences } from 'electron'

export type ScreenRecordingStatus = 'not-determined' | 'granted' | 'denied' | 'restricted' | 'unknown'

/**
 * Known bug (BUILD-SPEC.md §3.4): this status does NOT refresh within a
 * running process after the user flips the toggle in System Settings — do
 * not poll it expecting a change. Offer a restart instead.
 */
export function getScreenRecordingStatus(): ScreenRecordingStatus {
  return systemPreferences.getMediaAccessStatus('screen')
}

export function isScreenRecordingGranted(): boolean {
  return getScreenRecordingStatus() === 'granted'
}

export async function openScreenRecordingPrivacySettings(): Promise<void> {
  await shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture')
}
