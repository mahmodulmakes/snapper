# Phase 0 spike findings — spikes 1 & 2

Ran `spikes/coordinate-spike.js` (throwaway, not app code) on:

- macOS 26.6.1, single built-in Retina display, `scaleFactor` 2, `bounds` `{x:0,y:0,w:1470,h:956}` (points).
- No external display was available on this machine — see "Not yet answered" below.

## Spike 1 — does `screencapture -R` return native Retina pixels?

**Answer: `-R x,y,w,h` takes Electron's global point coordinates verbatim as input, and returns native (scaleFactor-multiplied) pixels as output.**

Evidence:
- Requested `100x100pt` at `(80,80)` → PNG is `200x200px` (2× = scaleFactor). Same ratio held for a `60x60pt` capture at the display's top-left corner and bottom-right corner.
- Independent cross-check: full-display capture via `-D 1` produced `2940x1912px`, exactly `bounds.width * scaleFactor` × `bounds.height * scaleFactor` (`1470*2 x 956*2`). Confirms the scaleFactor reading and the `-R` pixel semantics agree.
- PNG `density` metadata reported `144dpi` (2× the standard 72dpi baseline) on every capture — consistent, not needed for the coordinate model but recorded in `results.json` in case it matters later (spec's Sonoma DPI-metadata note).

**Consequence for `displayManager.ts`:** no crop-from-full-display fallback is needed. The direct model works: build `rectInPoints` from Electron's `screen` API, pass it straight to `-R` unmodified, and the output PNG is already in native pixels — multiply by `scaleFactor` only when sizing/cropping *within* the image (e.g. against other pixel-space data), never when constructing the `-R` argument itself.

## Spike 2 — do Electron global coordinates map 1:1 onto `-R`?

**Confirmed on the single-display case; NOT YET tested on multi-monitor.**

What's confirmed:
- `(0,0)` in Electron's `bounds` lands exactly at the physical top-left corner of the display, menu bar included (`bounds.y=0` vs `workArea.y=33` — bounds is full display, workArea excludes the menu bar, as documented). Verified visually: the top-left corner capture shows the Apple menu glyph and traffic-light controls exactly where expected.
- Edge captures (both corners) succeeded with no clipping or off-by-one errors.

**Not yet answered** (needs a second physical display, per BUILD-SPEC.md §3.2's required matrix):
- Retina primary + 1× external to the right
- External to the *left* (negative x)
- External *above* (negative y)
- A rotated 90° display
- A selection spanning two displays of different scale factors

## Gate status (per CLAUDE.md "Phase 0 spikes gate everything")

Spike 1 does not contradict the spec's assumptions — it resolves the open question in the direction the spec's primary hypothesis expected (native pixels), so no redesign is triggered.

Spike 2 is **incomplete, not failed**. The single-display coordinate convention checks out, but the negative-origin/mixed-DPI/rotation matrix that `displayManager.ts`'s unit tests are required to cover (CLAUDE.md, "Coordinate systems" section) cannot be exercised without a second monitor. Do not write `displayManager.ts`'s multi-display conversion logic as final until that's run — re-run `spikes/coordinate-spike.js` with an external display attached first.

## One-time setup note for anyone re-running this

`screencapture`, invoked from a dev Electron process, needs Screen Recording permission granted to *that specific Electron binary* (`node_modules/electron/dist/Electron.app`), not the terminal and not the eventual packaged app — matches the dev-mode permission gotcha already documented in CLAUDE.md. Without it, every capture fails with `could not create image from rect` / `could not create image from display`.
