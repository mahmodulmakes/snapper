import { app } from 'electron'
import { constants as fsConstants } from 'node:fs'
import { copyFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'

function pad(value: number, digits = 2): string {
  return String(value).padStart(digits, '0')
}

/**
 * `Screenshot {date} at {time}.png`, per BUILD-SPEC.md §4.4 — colons avoided
 * (macOS Finder renders them as `/`, since APFS colons are legacy
 * HFS+-path-separator baggage).
 */
export function buildScreenshotFilename(date: Date): string {
  const datePart = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
  const timePart = `${pad(date.getHours())}.${pad(date.getMinutes())}.${pad(date.getSeconds())}`
  return `Screenshot ${datePart} at ${timePart}.png`
}

/** The out-of-the-box save location, before the user configures their own (BUILD-SPEC.md §2.4/§4.4). Also used as the settings default. */
export function defaultSaveDirectory(): string {
  return join(app.getPath('pictures'), 'Screenshots')
}

/**
 * Copies to `dir/filename`, or `dir/filename (1)`, `(2)`, etc. if that name
 * is already taken — the timestamp in `buildScreenshotFilename` only has
 * second resolution, so two captures within the same second (a fast
 * double-press of the hotkey, or clicking Save twice) would otherwise
 * silently overwrite the first one with no warning. `COPYFILE_EXCL` makes
 * the OS itself reject an existing destination instead of racing a
 * separate existence check against it.
 */
async function copyToUniquePath(sourcePath: string, dir: string, filename: string): Promise<string> {
  const dot = filename.lastIndexOf('.')
  const base = dot === -1 ? filename : filename.slice(0, dot)
  const ext = dot === -1 ? '' : filename.slice(dot)
  for (let n = 0; ; n++) {
    const candidatePath = join(dir, n === 0 ? filename : `${base} (${n})${ext}`)
    try {
      await copyFile(sourcePath, candidatePath, fsConstants.COPYFILE_EXCL)
      return candidatePath
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err
    }
  }
}

/** Copies a capture into `dir` (the user's configured save folder, CLAUDE.md Hard Rule 7) under a timestamped name. */
export async function saveScreenshotFile(sourcePath: string, dir: string, date: Date = new Date()): Promise<string> {
  await mkdir(dir, { recursive: true })
  return copyToUniquePath(sourcePath, dir, buildScreenshotFilename(date))
}
