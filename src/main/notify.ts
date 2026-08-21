import { Notification } from 'electron'
import { logger } from './logger'

/**
 * Shows a native notification for a user-facing failure and always logs it.
 * CLAUDE.md: never let a failure be silent — a screenshot tool that quietly
 * does nothing is worse than one that shows an error. Guarded because
 * Notification support depends on OS/user settings, not just platform.
 */
export function notifyFailure(title: string, body: string, cause?: unknown): void {
  logger.error(`${title}: ${body}`, cause)
  if (Notification.isSupported()) {
    new Notification({ title, body }).show()
  }
}
