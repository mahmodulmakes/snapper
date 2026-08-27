export interface AppVersionInfo {
  version: string
}

/** A rectangle in window-local points, as reported by the overlay renderer. */
export interface RectInPoints {
  x: number
  y: number
  width: number
  height: number
}

/** A point in window-local points, as reported by the overlay renderer. */
export interface PointInPoints {
  x: number
  y: number
}

export interface DragModifiersPayload {
  square: boolean // Shift
  fromCenter: boolean // Option
  space: boolean // Space — pans the selection instead of resizing it
}

/** Which capture flow an overlay window pool is currently running (BUILD-SPEC.md §4.9) — set once per `showOverlays()` call, sent to every window via `OverlayResetPayload`. */
export type CaptureMode = 'region' | 'text'

/** Main -> renderer, sent right before an overlay window is shown, so the renderer knows which flow's mouse-up behavior to run. */
export interface OverlayResetPayload {
  mode: CaptureMode
}

/** Renderer -> main: a drag started in this window, at this local anchor point. */
export interface OverlayDragStartPayload {
  anchorInPoints: PointInPoints
  modifiers: DragModifiersPayload
}

/** Renderer -> main: Shift/Option state changed mid-drag. */
export interface OverlayDragModifiersPayload {
  modifiers: DragModifiersPayload
}

/**
 * Main -> renderer, broadcast to every overlay window during and after a
 * drag. `rectInPoints` is already translated into the RECIPIENT window's own
 * local coordinates (main owns all cross-window coordinate math per
 * CLAUDE.md Hard Rule 3) — a window untouched by the selection simply
 * receives a rect that falls outside its own canvas and draws nothing extra.
 */
export interface OverlaySelectionStatePayload {
  phase: 'dragging' | 'finalized'
  rectInPoints: RectInPoints
  /** Only meaningful when phase is 'finalized' — whether this window should show the toolbar. */
  isToolbarHost: boolean
}

/** Renderer -> main: nudge the finalized selection by this local-point delta (host window only). */
export interface OverlaySelectionNudgePayload {
  dx: number
  dy: number
}

export type ShortcutActionId = 'captureArea' | 'captureFullScreen' | 'captureText'

export type ShortcutBindings = Record<ShortcutActionId, string>

export interface SettingsState {
  launchAtLogin: boolean
  shortcuts: ShortcutBindings
  shortcutsPaused: boolean
}

/** Inline annotation drawing tools (BUILD-SPEC.md §2.4.2/§4.5a) — outline shapes only, no fill tools. */
export type AnnotationTool = 'arrow' | 'rectangle' | 'oval' | 'line'

/**
 * One shape drawn on the overlay, in whatever point-space the sender uses.
 * The renderer sends these in the overlay window's own local points (same
 * space as `OverlaySelectionStatePayload.rectInPoints`); main converts each
 * endpoint to global points, then to the captured image's pixel space, via
 * displayManager.ts (Hard Rule 3 — never here).
 */
export interface AnnotationShape {
  tool: AnnotationTool
  color: string
  x0: number
  y0: number
  x1: number
  y1: number
}

/** An `AnnotationShape` already converted into the captured image's own pixel space, with a concrete stroke width — ready to rasterize (`main/output/annotationOverlay.ts`). */
export interface AnnotationShapePixels extends AnnotationShape {
  lineWidthInPixels: number
}

/** Renderer -> main: Copy/Save now carry any shapes drawn on top of the selection, alongside the existing rect. */
export interface OverlayExportPayload {
  rectInPoints: RectInPoints
  shapes: AnnotationShape[]
}

/**
 * A Vision-framework bounding box exactly as the helper reports it:
 * normalized 0-1, origin at the BOTTOM-LEFT of the image (spikes/FINDINGS.md
 * "Phase 8 spike B") — not yet converted to screen points. Only
 * displayManager.ts's `visionBoxToGlobalPoints` is allowed to convert one of
 * these into a real coordinate, per CLAUDE.md Hard Rule 3.
 */
export interface NormalizedBoxBottomLeft {
  x: number
  y: number
  width: number
  height: number
}

export interface RecognizedWord {
  text: string
  boundingBoxNormalized: NormalizedBoxBottomLeft
}

export interface RecognizedLine {
  text: string
  confidence: number
  boundingBoxNormalized: NormalizedBoxBottomLeft
  words: RecognizedWord[]
}

/** Result of running the on-device Vision text-recognition helper over one captured image. */
export interface TextRecognitionResult {
  lines: RecognizedLine[]
  imageWidthPixels: number
  imageHeightPixels: number
}

/** One recognized word or line, already converted to the RECIPIENT overlay window's own local points (main owns all coordinate math, Hard Rule 3) — ready to position directly in the DOM. */
export interface TextCaptureWord {
  text: string
  rectInPoints: RectInPoints
}

export interface TextCaptureLine {
  text: string
  rectInPoints: RectInPoints
  words: TextCaptureWord[]
}

/** Main -> renderer: the recognized text layer for one text-capture selection (BUILD-SPEC.md §4.9). */
export interface TextCaptureResultPayload {
  lines: TextCaptureLine[]
}

/** Renderer -> main: the user's selected text within a text-capture result, to copy to the clipboard. */
export interface TextCaptureCopyPayload {
  text: string
}
