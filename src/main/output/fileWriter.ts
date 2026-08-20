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

/**
 * Fixed default save location for v1.0 (BUILD-SPEC.md §2.4/§4.4) —
 * configurable save folder is a fast-follow, not required for launch.
 */
export function defaultSaveDirectory(): string {
  return join(app.getPath('pictures'), 'Screenshots')
}

/** Copies a capture into the default save folder under a timestamped name. */
export async function saveScreenshotFile(sourcePath: string, date: Date = new Date()): Promise<string> {
  const dir = defaultSaveDirectory()
  await mkdir(dir, { recursive: true })
  const destPath = join(dir, buildScreenshotFilename(date))
  await copyFile(sourcePath, destPath)
  return destPath
}
