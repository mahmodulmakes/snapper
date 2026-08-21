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

export type ShortcutActionId = 'captureArea' | 'captureFullScreen'

export type ShortcutBindings = Record<ShortcutActionId, string>

export interface SettingsState {
  launchAtLogin: boolean
  shortcuts: ShortcutBindings
  shortcutsPaused: boolean
}
