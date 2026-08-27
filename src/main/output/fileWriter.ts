import { app } from 'electron'
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

/** Copies a capture into `dir` (the user's configured save folder, CLAUDE.md Hard Rule 7) under a timestamped name. */
export async function saveScreenshotFile(sourcePath: string, dir: string, date: Date = new Date()): Promise<string> {
  await mkdir(dir, { recursive: true })
  const destPath = join(dir, buildScreenshotFilename(date))
  await copyFile(sourcePath, destPath)
  return destPath
}
