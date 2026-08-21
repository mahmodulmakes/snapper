import { execFile } from 'node:child_process'
import { logger } from '../logger'

// Same shutter sound macOS's own ⌘⇧3/4 plays — confirmed present at this
// path and playable via afplay. A missing/failed sound should never block or
// fail a capture, so callers fire-and-forget this.
const SHUTTER_SOUND_PATH = '/System/Library/Components/CoreAudio.component/Contents/SharedSupport/SystemSounds/system/Shutter.aif'

/** Plays the capture confirmation sound. Best-effort — a failure here is logged, never surfaced as a capture error. */
export function playCaptureSound(): void {
  execFile('afplay', [SHUTTER_SOUND_PATH], (err) => {
    if (err) logger.error('Could not play capture sound.', err)
  })
}
