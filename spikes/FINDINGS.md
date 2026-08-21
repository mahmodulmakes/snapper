# Phase 0 spike findings — spikes 1, 2 & 3

Ran `spikes/coordinate-spike.js` (throwaway, not app code) on macOS 26.6.1.

- Spikes 1 and the first pass of spike 2: single built-in Retina display, `scaleFactor` 2, `bounds` `{x:0,y:0,w:1470,h:956}` (points) — no external display was available yet.
- Spike 2's multi-monitor re-run: same built-in display (primary) plus a 1080p external at `scaleFactor` 1, `bounds` `{x:0,y:-1080,w:1920,h:1080}` (positioned above the primary — negative-origin and mixed-DPI at once).

## Spike 1 — does `screencapture -R` return native Retina pixels?

**Answer: `-R x,y,w,h` takes Electron's global point coordinates verbatim as input, and returns native (scaleFactor-multiplied) pixels as output.**

Evidence:
- Requested `100x100pt` at `(80,80)` → PNG is `200x200px` (2× = scaleFactor). Same ratio held for a `60x60pt` capture at the display's top-left corner and bottom-right corner.
- Independent cross-check: full-display capture via `-D 1` produced `2940x1912px`, exactly `bounds.width * scaleFactor` × `bounds.height * scaleFactor` (`1470*2 x 956*2`). Confirms the scaleFactor reading and the `-R` pixel semantics agree.
- PNG `density` metadata reported `144dpi` (2× the standard 72dpi baseline) on every capture — consistent, not needed for the coordinate model but recorded in `results.json` in case it matters later (spec's Sonoma DPI-metadata note).

**Consequence for `displayManager.ts`:** no crop-from-full-display fallback is needed. The direct model works: build `rectInPoints` from Electron's `screen` API, pass it straight to `-R` unmodified, and the output PNG is already in native pixels — multiply by `scaleFactor` only when sizing/cropping *within* the image (e.g. against other pixel-space data), never when constructing the `-R` argument itself.

## Spike 2 — do Electron global coordinates map 1:1 onto `-R`?

**Confirmed, including the negative-origin/mixed-DPI multi-monitor case.**

Single-display evidence (original run):
- `(0,0)` in Electron's `bounds` lands exactly at the physical top-left corner of the display, menu bar included (`bounds.y=0` vs `workArea.y=33` — bounds is full display, workArea excludes the menu bar, as documented). Verified visually: the top-left corner capture shows the Apple menu glyph and traffic-light controls exactly where expected.
- Edge captures (both corners) succeeded with no clipping or off-by-one errors.

**Multi-monitor re-run** (Retina built-in, `scaleFactor` 2, `bounds {x:0,y:0,w:1470,h:956}`, primary; external 1080p, `scaleFactor` 1, `bounds {x:0,y:-1080,w:1920,h:1080}`, positioned above the primary — negative-origin *and* mixed-DPI in one setup):
- Both displays independently confirmed `NATIVE_PIXELS` behavior at their own scaleFactor (external: `100x100pt → 100x100px` at 1×; primary: `100x100pt → 200x200px` at 2×, matching the single-display result).
- The external display's negative-`y` corner capture (`(0,-1080)`) landed exactly on *that* display's own top-left corner (Apple menu glyph, notch) — verified visually, no clipping, no offset error, no accidental fall-through to the primary display's origin.
- `overlayLocalRectToGlobalPoints()` needed no changes for any of this — it's pure translation (add the window's origin), and Electron's `bounds.x/y` already encodes negative origins correctly; the function was already covered by unit tests for negative-x, negative-y, and (separately) a simulated 90°-rotation case before this run, and nothing here contradicted them.

**Still not exercised:** a real rotated-90° display (no such hardware available) — the existing unit test simulates it by asserting Electron's documented behavior of swapping `bounds.width`/`height` for rotation, which the translation function doesn't need to special-case. Treat that as reasoned-through, not empirically confirmed.

## Spike 4 — can a single `screencapture -R` call correctly capture a rect spanning two displays of *different* scaleFactor?

Ran `spikes/cross-display-capture-spike.js` (throwaway) against the real two-display setup (Retina built-in, `scaleFactor` 2, primary; external 1080p, `scaleFactor` 1, positioned above at negative-y origin).

**Answer: no.** A single `-R` call spanning a scaleFactor boundary always comes back at the *lower* of the two scaleFactors — and it takes only a sliver of overlap to trigger this, not a majority.

Evidence:
- `origin-on-1x`: a `300×100pt` rect straddling the boundary roughly 50/50 between the 1x and 2x displays → output `300×100px` (1x). Expected `600×200px` if any part rendered at the Retina display's native 2x.
- `mostly-on-2x`: the *same* rect shape, but shifted so only `5pt` of its `100pt` height touches the 1x display and the remaining `95pt` sits on the 2x display → **still** `300×100px` (1x), not the ~`580×190px` a majority-2x weighting would suggest, and nowhere near `600×200px` native.
- In both cases the PNG's `density` metadata read `144dpi` (2x) regardless of the actual pixel scale used — the density tag is not a reliable signal of what scale the pixels were actually rendered at; don't trust it for this decision.

**Consequence:** on a mixed-DPI multi-monitor setup, a selection that crosses from an external 1x display into so much as touching the Retina display's edge gets the *entire* capture — including the Retina portion — silently downsampled to 1x. This is a real, visible quality regression for the majority-Retina case, not an edge case that only bites a sliver of the shot. A single `-R` call across a scaleFactor boundary cannot be the whole implementation if "produces a correct image" is the bar (BUILD-SPEC.md's stated Phase 3 done-when criterion).

**Not yet disambiguated:** whether the rule is "always the lowest scaleFactor among any displays touched" vs. "the scaleFactor of whichever display the rect's top-left origin lands in" — this hardware's vertical stacking (external always above primary) means the origin of any spanning rect is unavoidably on the external (1x) display, so the two hypotheses can't be told apart without a different physical arrangement (e.g. two displays side-by-side) or a differently-oriented setup. Doesn't change the consequence above either way: both hypotheses predict a Retina-side quality loss is possible depending on drag direction/origin, so the fix needs to not depend on getting the origin "right."

## Gate status (per CLAUDE.md "Phase 0 spikes gate everything")

Spike 1 does not contradict the spec's assumptions — it resolves the open question in the direction the spec's primary hypothesis expected (native pixels), so no redesign is triggered.

Spike 2 is now **confirmed** for the coordinate-mapping question `displayManager.ts` actually needs answered (translation across arbitrary origins, arbitrary per-display scaleFactor). What it does *not* resolve — and what BUILD-SPEC.md's Phase 3 "done when" criterion implies is still expected — is **selection dragging across a display boundary**, which turned out to be two separate open questions, not one:

1. **UI/tracking gap**: the current overlay architecture is one independent window per display, each tracking its own local `mousedown`/`mousemove`/`mouseup`. A drag that crosses from one display's screen area into another's will stop being tracked by the originating window and won't be picked up by the destination window's overlay (it never received the initiating `mousedown`).
2. **Capture-quality gap (spike 4, below)**: even once the UI can track a cross-display drag, a single `-R` call spanning a scaleFactor boundary silently downsamples the *entire* capture to the lower of the two scaleFactors — confirmed to trigger from just a sliver of overlap, not a majority-share edge case.

Both are architecture questions, not coordinate-math ones — flagged to the user rather than decided unilaterally, per CLAUDE.md's guidance on architectural forks.

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
