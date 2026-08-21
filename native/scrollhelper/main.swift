// Compiled at build time (scripts/buildScrollHelper.mjs) into a standalone
// binary bundled into the app (electron-builder.yml's extraResources), and
// invoked as a subprocess from src/main/capture/scrollSynthesis.ts — same
// pattern as the system `screencapture` binary, just one we ship ourselves.
//
// Posts a synthetic scroll-wheel event at a screen point. MUST use
// .cgSessionEventTap, not .cghidEventTap: confirmed empirically (Phase 0
// scrolling-capture spike) that .cghidEventTap is silently ignored by
// WebKit/Safari — the event posts with no error, nothing scrolls, no
// exception — while .cgSessionEventTap scrolls both native AppKit apps and
// browser content correctly. This is not documented anywhere obvious; it
// was found by testing both against a real browser, not by reading a guess
// off Apple's docs.
//
// Needs the calling process to be Accessibility-trusted (a separate macOS
// permission from Screen Recording) — see main/permissions/accessibility.ts.
// If not trusted, CGEventPost silently no-ops rather than throwing, so the
// caller cannot detect failure from this process's exit code alone; it must
// check systemPreferences.isTrustedAccessibilityClient() itself beforehand.

import CoreGraphics
import Foundation

func fail(_ message: String) -> Never {
  FileHandle.standardError.write((message + "\n").data(using: .utf8)!)
  exit(1)
}

let args = CommandLine.arguments
guard args.count == 4,
  let x = Double(args[1]),
  let y = Double(args[2]),
  let lines = Int32(args[3])
else {
  fail("Usage: scrollhelper <x> <y> <lines>  (lines negative = scroll down)")
}

// A mouse-moved event first: scroll events are delivered to whatever's
// under the cursor, and the target window may not already be there.
guard let moveEvent = CGEvent(mouseEventSource: nil, mouseType: .mouseMoved, mouseCursorPosition: CGPoint(x: x, y: y), mouseButton: .left) else {
  fail("Could not create move event")
}
moveEvent.post(tap: .cgSessionEventTap)
usleep(30000)

guard let scrollEvent = CGEvent(scrollWheelEvent2Source: nil, units: .line, wheelCount: 1, wheel1: lines, wheel2: 0, wheel3: 0) else {
  fail("Could not create scroll event")
}
scrollEvent.location = CGPoint(x: x, y: y)
scrollEvent.post(tap: .cgSessionEventTap)
