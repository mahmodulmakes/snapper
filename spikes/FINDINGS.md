# Phase 0 spike findings — spikes 1, 2 & 3

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

## Spike 3 — can a transparent always-on-top overlay render above a fullscreen app?

Ran `spikes/overlay-fullscreen-spike.js` (throwaway) in two phases: `windowed` (fully automated — opens TextEdit, captures a magenta marker window on top of it) and `fullscreen` (needs a human to actually put an app into native fullscreen first; the script then activates it via `osascript ... to activate` before each capture so the correct macOS Space is active — see "Methodology pitfalls" below).

**Method:** show a full-display transparent window with an opaque magenta marker centered on it, capture the whole display with the real `screencapture` binary (not Electron's own state — this proves the actual composited result), and sample the center pixel. Magenta = the overlay won the z-order fight.

### Result: confirmed, but the default `alwaysOnTop` reading of BUILD-SPEC.md's own window table was NOT enough — and one of that table's *other* listed properties actively broke it

**Normal windowed app (round 1):** `setAlwaysOnTop(true, 'screen-saver')` + `setVisibleOnAllWorkspaces(true)` (no extra options) is sufficient. Marker rendered cleanly over both TextEdit and this Claude Code window. See `round1-windowed-configA.png`.

**Native fullscreen app, first pass (rounds 2–4):** same settings, plus `setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })` — the option Electron's docs say is required to cross into another app's fullscreen Space. **Still failed** — marker never appeared over fullscreen Safari, in any round.

**Root cause, isolated in rounds 5–6:** BUILD-SPEC.md's own §3.3 window property table lists `fullscreenable: false` for the overlay window *alongside* `visibleOnAllWorkspaces: true` — these two conflict on macOS. A window built with `fullscreenable: false` never gets the NSWindow collection-behavior bits needed to join another app's fullscreen Space, no matter what `setVisibleOnAllWorkspaces` options are passed. Calling `win.setFullScreenable(true)` *after* construction did not fix it either (round 5) — this is fixed at construction time. Only a window built with `fullscreenable: true` from the `BrowserWindow` constructor, combined with `setAlwaysOnTop(true, 'screen-saver')` and `setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })`, actually rendered over fullscreen Safari (round 6, `round6-fullscreen-fresh-fullscreenable.png` — confirmed visually, solid magenta, exact `rgb(255,0,255)` sample).

**Click-through sanity check (round 7):** with the working config above, calling `setIgnoreMouseEvents(true, { forward: true })` does not affect visibility — marker stayed visible after enabling click-through. Click-through and fullscreen-visibility are independent, no conflict there.

### Consequence for `overlayManager.ts` — BUILD-SPEC.md §3.3 was wrong on one property

The overlay window must be built with **`fullscreenable: true`**, not `false` as the spec originally stated. In practice this is safe: the overlay is frameless (`frame: false`) and has no title bar, so there's no user-visible affordance (no green button) that would let someone actually trigger fullscreen on it — `fullscreenable: true` only unlocks the *collection behavior* needed to render over other apps' fullscreen Spaces, it doesn't invite the user to fullscreen the overlay itself. Just don't ever call `win.setFullScreen(true)` on it.

Full working overlay window recipe, confirmed empirically:
```ts
new BrowserWindow({
  // ...bounds, transparent: true, frame: false, hasShadow: false, skipTaskbar: true,
  fullscreenable: true,   // NOT false — false silently breaks visibleOnFullScreen
  enableLargerThanScreen: true,
})
win.setAlwaysOnTop(true, 'screen-saver')
win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
```

### Methodology pitfalls hit along the way (worth knowing if this gets re-run)

1. **CSP silently ate the marker's `<style>` block.** The spike's `overlay-marker.html` initially had `default-src 'self'; script-src 'none'` with no `style-src`, which blocks inline `<style>` under CSP (inline styles need `'unsafe-inline'` explicitly, `'self'` doesn't cover them). Result: the marker rendered with default UA sizing at the top-left corner instead of a centered 200×200 box, which looked exactly like a z-order failure until `getBoundingClientRect()` debugging caught it. Fixed by adding `style-src 'unsafe-inline'`.
2. **`open -a TextEdit` can trigger an Open-file picker sheet** instead of a plain document window, and that sheet sits at an even higher window level than a normal window — it covered the marker and looked like another z-order failure. Fixed by launching TextEdit via `osascript ... make new document` instead.
3. **The active macOS Space follows human attention, not the app being tested.** The first fullscreen-phase run captured the *wrong* Space entirely — Safari was genuinely fullscreen, but because the human was looking at/typing into Claude Code (a normal-Space app) when the capture fired, macOS's active Space was the normal desktop, not Safari's fullscreen Space. The Dock and a normal menu bar were plainly visible in the "fullscreen" capture, which was the tell. Fixed by having the script explicitly `osascript -e 'tell application "Safari" to activate'` immediately before each capture, forcing the correct Space to be active regardless of where the human's attention is — this also matches real product behavior more closely (a hotkey fires while some app is what the user is actually looking at).

## One-time setup note for anyone re-running this

`screencapture`, invoked from a dev Electron process, needs Screen Recording permission granted to *that specific Electron binary* (`node_modules/electron/dist/Electron.app`), not the terminal and not the eventual packaged app — matches the dev-mode permission gotcha already documented in CLAUDE.md. Without it, every capture fails with `could not create image from rect` / `could not create image from display`.
