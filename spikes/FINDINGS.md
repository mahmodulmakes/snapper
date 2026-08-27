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

## Post-hoc finding — `BrowserWindow.getBounds()` is not a reliable coordinate origin

Found while doing the first real cross-display drag verification against the reconnected two-display hardware (`spikes/verify-cross-display-drag.js`, `spikes/verify-bounds-offset.js`, `spikes/verify-capture-position.js` — all throwaway, not app code).

**Symptom:** on the display hosting the menu bar (this machine's built-in Retina display, `display.bounds = {x:0,y:0,w:1470,h:956}`), the corresponding overlay `BrowserWindow`'s `getBounds()`/`getContentBounds()` reported `{x:0,y:-28,w:1470,h:984}` — shifted up 28pt and 28pt taller than requested at construction. The external display showed no discrepancy (`getBounds()` matched `display.bounds` exactly). The renderer's own `window.innerHeight` agreed with the wrong 984 figure too, ruling out a pure main-process reporting quirk.

**Root cause, established by a ground-truth marker test:** painted a solid-color marker at the overlay canvas's local `(0,0)`, then captured two small regions via the *real* `screencapture` binary (not Electron's own state) — one at `display.bounds`'s origin `(0,0)`, one at `getBounds()`'s reported origin `(0,-28)`. The marker showed up exactly at `(0,0)` (`display.bounds`), not at `(0,-28)`. **The window's content genuinely renders at the display's real origin; `getBounds()` just misreports it** — almost certainly a side effect of `fullscreenable: true` + `setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })` (added for spike 3) causing macOS to report collection-behavior-adjusted geometry that accounts for the menu bar strip, without the window's actual rendered content moving.

**Consequence:** every coordinate conversion in `overlayManager.ts` and `dragCoordinator.ts` used `entry.window.getBounds()` as the local↔global origin — on the menu-bar display this silently introduced a ~28pt vertical error in every capture, drag broadcast, and toolbar-host determination. A pure vertical offset doesn't change captured *dimensions*, only *position*, so it was invisible to every dimension-based check run earlier this session (including the single-display regression check) — dimension-only verification cannot catch this class of bug.

**Fix:** every one of those call sites now uses `screen.getAllDisplays()`'s `display.bounds` (already the verified ground truth per spike 2) as the coordinate origin, never `window.getBounds()`. Re-verified with the same marker methodology: captured through the real app pipeline vs. an independent `screencapture -R` at the same expected global rect, compared pixel-for-pixel — at zero offset the two images match almost exactly (avg per-pixel diff 0.335, compression noise); shifting either image by 28pt/56px (the old bug's exact magnitude) in either direction makes the match 60-100x worse. No residual offset.

**Methodology note:** an early attempt at this same comparison showed a spurious 43% pixel mismatch — traced to the diff script itself indexing two images with different channel counts (RGBA vs RGB) at the same stride, not a real content or position problem. Fixed by normalizing both images to the same channel count before comparing. Also: comparing two captures of a *live, actively-changing* desktop taken any real time apart is inherently noisy (terminal/log scrolling, cursor blink, etc.) — the offset cross-correlation (checking whether *any* shift improves the match, not just eyeballing one raw diff number) is what made the result trustworthy despite that noise.

## Phase 8 spikes A–D — Vision framework text recognition bridge

Ran `spikes/text-recognition-helper.swift` (compiled with `swiftc -O`, THROWAWAY, not app code) against two synthetic fixtures generated by `spikes/generate-text-fixture.mjs` (3 short lines, 1000×440px @2x) and `spikes/generate-paragraph-fixture.mjs` (10 sentences, 1400×800px @2x) — both rendered via `sharp`'s SVG rasterizer so the exact expected text and approximate pixel position of every line is known ground truth, independent of screen-capture permissions.

### Spike A — does the Swift+Vision bridge work, invoked the way the app will invoke it?

**Confirmed, and fast enough.** `VNImageRequestHandler` + `VNRecognizeTextRequest` (`.accurate` recognition level, language correction on) recognized every line of both fixtures with **100% confidence** and byte-exact text, including punctuation, apostrophes, and a mixed-case sentence with an embedded quote mark.

Invoked exactly like `screencapture.ts` invokes its binary today — a plain synchronous subprocess call, JSON on stdout, nothing on stderr on success. No new toolchain: `swiftc` and `xcrun` are already present via the Xcode Command Line Tools this machine has installed for notarization (`/Library/Developer/CommandLineTools`), so this doesn't add a new build dependency (Hard Rule 9 still holds — no npm package).

**Latency (cold process per invocation, matching the real per-capture spawn pattern — not a long-lived warm process):**

| Fixture | Wall time | Vision-internal `recognitionMs` |
|---|---|---|
| 3 short lines, 1000×440px | 0.18–0.22s (steady state) | 175–207ms |
| 10 sentences, 1400×800px | 0.29–0.32s | 280–312ms |

Both comfortably under the sub-300–350ms budget implied by BUILD-SPEC.md §4.2's hotkey-latency spirit for an interactive "reading…" pause. **One real wrinkle:** the very first invocation ever (immediately after compiling) took 0.986s wall / 396ms internal — visibly slower than every run after it. Not re-tested exhaustively, but consistent with one-time OS-level cost (page cache / code-signing verification / dyld shared-cache paging on first launch of a freshly-compiled binary), not a per-call cost — every run after the first stayed in the 180–320ms band. Worth a note in Phase 8.1: the *first* text capture after app launch (or after each OS reboot) may feel a beat slower than subsequent ones; not treated as a blocker, but don't be surprised by it in manual verification.

### Spike B — Vision's bounding-box coordinate convention

**Confirmed empirically, matching Apple's documented convention: normalized (0–1) coordinates, origin at bottom-left of the image**, not Electron's top-left. Checked by comparing each recognized line's reported `y` against its known SVG draw position: "Hello World" was drawn near the *top* of the 440px-tall fixture (SVG baseline y≈120px, so top-of-image in conventional terms) and Vision reported `y≈0.71` (close to 1 — bottom-origin's "near the top" value); "over the lazy dog 12345" was drawn near the *bottom* of the same fixture (SVG baseline y≈320px) and Vision reported `y≈0.25` (close to 0 — bottom-origin's "near the bottom" value). Both lines' full `{x,y,width,height}` ranges matched their expected image-fraction position within a few percent once font ascent/descent is accounted for.

**Consequence for Phase 8.2:** the conversion is a straight y-flip (`pointsFromTop = imageHeightPoints * (1 - visionY - visionHeight)`) before the existing points→pixels scaleFactor logic applies. Decision from the original spike plan (§3.10): this conversion will live as new exported functions in `displayManager.ts` rather than a sibling module — it's pure coordinate-space translation with no independent state, the same category of function `displayManager.ts` already owns (Hard Rule 3), and a separate module would just be a thin pass-through that still has to reach into `displayManager.ts` for the scaleFactor step anyway.

### Spike C — clean child_process invocation, no new dependency

**Confirmed** — see Spike A above; same finding, restated for the checklist. No native Node addon needed, no npm package added.

### Spike D — are word-level bounding boxes obtainable?

**Confirmed, and reliable.** `VNRecognizedText.boundingBox(for:)` on word-substring ranges (from `String.enumerateSubstrings(options: .byWords)`) returned a distinct, correctly-ordered, left-to-right bounding box for every single word in both fixtures — e.g. "The quick brown fox jumps" produced 5 word boxes with monotonically increasing `x` and identical `y`/`height` (same text line), each width proportional to the word's rendered length. No dropped or merged words in either fixture (24 words total across both, all recovered).

**One minor edge case surfaced, not a blocker:** a sentence containing an embedded quote mark ("Watch "Jeopardy!", Alex Trebek's fun TV quiz game.") got split into two separate `lines` entries by Vision's own line-segmentation, breaking at the quote character. Word-level boxes within each fragment were still correct. Since the interaction model (§4.9, PHASES.md 8.4) does word/line-box hit-testing against the drag rectangle rather than depending on Vision's line-grouping being visually exact, this doesn't block anything — flagged here so it's not mistaken for a bug if noticed later during manual verification.

### Gate status

None of the four spikes contradict the plan in BUILD-SPEC.md §3.10 / §4.9 or PHASES.md's Phase 8 breakdown. All four gate conditions from PHASES.md 8.0 are resolved:
- Bridge works, fast enough → proceed to Phase 8.1 (native bridge) as planned.
- Coordinate conversion decision made (lives in `displayManager.ts`) → Phase 8.2 can proceed without re-deciding.
- No new dependency → Hard Rule 9 intact.
- Word-level boxes are reliable → Phase 8.4 can build the word-level hit-testing interaction as originally planned, no fallback to line-level-only needed.

## One-time setup note for anyone re-running this

`screencapture`, invoked from a dev Electron process, needs Screen Recording permission granted to *that specific Electron binary* (`node_modules/electron/dist/Electron.app`), not the terminal and not the eventual packaged app — matches the dev-mode permission gotcha already documented in CLAUDE.md. Without it, every capture fails with `could not create image from rect` / `could not create image from display`.
