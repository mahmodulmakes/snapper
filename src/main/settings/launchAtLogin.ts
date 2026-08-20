import { app } from 'electron'
import { getSettingsStore } from './store'

/**
 * Applies the stored launch-at-login preference to the OS. Call once at
 * startup — idempotent, safe to call every launch to keep the OS in sync
 * with the stored preference (the source of truth).
 */
export function syncLaunchAtLogin(): void {
  const enabled = getSettingsStore().get('launchAtLogin')
  app.setLoginItemSettings({ openAtLogin: enabled, openAsHidden: true })
}

/** For the Settings window toggle (Phase 5) to call. */
export function setLaunchAtLogin(enabled: boolean): void {
  getSettingsStore().set('launchAtLogin', enabled)
  app.setLoginItemSettings({ openAtLogin: enabled, openAsHidden: true })
}
