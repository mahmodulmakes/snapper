import { desktopCapturer } from 'electron'

/**
 * Resolves the desktopCapturer source id for a given Electron display id —
 * used ONLY for the magnifier's live low-latency pixel preview, never for
 * the actual screenshot output (that stays on `screencapture`, see
 * BUILD-SPEC.md's rationale: desktopCapturer has thumbnail-size traps and
 * multi-monitor bugs for stills). A continuous video stream is the correct
 * tool for a live-updating preview though — screencapture measured at
 * ~85-90ms per call (subprocess-spawn overhead), too slow to feel live.
 */
export async function getDesktopCaptureSourceId(displayId: number): Promise<string | null> {
  const sources = await desktopCapturer.getSources({ types: ['screen'] })
  const match = sources.find((source) => source.display_id === String(displayId))
  return match?.id ?? null
}
