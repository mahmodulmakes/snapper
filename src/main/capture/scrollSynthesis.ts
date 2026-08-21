import { app } from 'electron'
import { execFile } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const __dirname = dirname(fileURLToPath(import.meta.url))

export class ScrollSynthesisError extends Error {
  constructor(message: string, cause: unknown) {
    super(message, { cause })
    this.name = 'ScrollSynthesisError'
  }
}

/**
 * The bundled scrollhelper binary's path. `extraResources` (electron-builder.yml)
 * only actually copies it into the app bundle for a PACKAGED build — in dev
 * there's no packaging step, so it's read straight from the project's
 * `resources/` directory instead (built by `npm run build:scrollhelper`,
 * gitignored — same treatment as `out/`/`dist/`).
 */
function scrollHelperPath(): string {
  return app.isPackaged ? join(process.resourcesPath, 'scrollhelper') : join(__dirname, '../../../resources/scrollhelper')
}

/**
 * Posts a synthetic scroll-wheel event at a global point, in points.
 * `linesDown` positive scrolls down (matches natural/reversed scrolling —
 * the sign here is CGEventCreateScrollWheelEvent's convention, negative =
 * content moves up = scrolling down the page).
 *
 * Requires Accessibility permission (main/permissions/accessibility.ts) —
 * the helper itself cannot report whether it lacked permission (CGEventPost
 * silently no-ops rather than failing), so callers must check
 * isAccessibilityGranted() themselves before relying on this doing anything.
 */
export async function postScrollEvent(pointInPoints: { x: number; y: number }, linesDown: number): Promise<void> {
  try {
    await execFileAsync(scrollHelperPath(), [String(pointInPoints.x), String(pointInPoints.y), String(-linesDown)])
  } catch (err) {
    throw new ScrollSynthesisError('scrollhelper failed to post a scroll event', err)
  }
}
