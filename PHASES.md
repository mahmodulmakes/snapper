# Delivery phases — progress tracker

Tracks the phases from `BUILD-SPEC.md` §5 against actual repo state. Check items off as they land; keep this in sync with reality, not aspiration. Full context for each phase lives in `BUILD-SPEC.md` — this file is just the checklist.

---

## Phase 0 — Spikes

- [x] Spike 1: does `screencapture -R` return native Retina pixels? — confirmed yes. `spikes/coordinate-spike.js`, `spikes/FINDINGS.md`.
- [x] Spike 2: do Electron global coordinates map 1:1 onto `-R` on a mixed-DPI, negative-origin multi-monitor setup? — **confirmed**, re-run against a real second monitor (1× external, negative-y origin, above a 2× Retina primary). Rotated-90° case is still only reasoned-through, not hardware-tested (see `spikes/FINDINGS.md`). This item was stale in this file — it was actually resolved before this file was last synced; don't trust "blocked" language here without cross-checking `spikes/FINDINGS.md` first.
- [x] Spike 3: can a transparent always-on-top overlay render above a native-fullscreen app? — confirmed, with a spec correction (`fullscreenable: true`, not `false`). `spikes/overlay-fullscreen-spike.js`, `spikes/FINDINGS.md`.
- [x] Spike 4: hotkey→overlay-visible latency (target < 80 ms) — measured (`spikes/verify-hotkey-latency.js`) on real two-display hardware: `showOverlays()` call itself is fast and consistent (12-40ms). But the full path through a real renderer frame (`requestAnimationFrame` round-trip, proving the renderer actually resumed work, not just was told to show) is **not consistent** — 10 runs alternated almost perfectly between ~25-50ms and ~320-340ms from the 4th run onward. That's not noise; it looks like Chromium throttling `requestAnimationFrame` for a window re-shown shortly after being hidden (each run hides the overlay, waits 200ms, shows it again). A genuinely cold first-use measurement (first run after pre-warm, no prior hide/show cycling) was 84.7ms — borderline over target, not the extreme end. **Not resolved further** — this is a real finding, not a pass or fail: real hotkey usage has second-scale gaps between captures (not this test's 200ms tight loop), so the throttling pattern may not reflect actual usage, but it's not ruled out either. Flagging rather than silently tuning around it, per CLAUDE.md's spike-gating guidance — worth a decision on whether this needs deeper investigation (e.g. Chromium's window-visibility rAF throttling behavior) before treating latency as solved.
- [x] ~~Naming collision~~ — resolved: `spikes/FINDINGS.md`'s "Spike 4" (cross-display scaleFactor capture) and this checklist's "Spike 4" (hotkey latency) are still two different things sharing a number, but both are now done, so the collision is no longer live risk. Still worth a rename if this file structure persists past v1.0.
- [ ] Spike 5: scroll-event synthesis + permission cost — deferred along with scrolling capture (§2.4).

**Cross-display drag gap — fully verified, fix confirmed on real hardware.** `main/overlay/dragCoordinator.ts` and `main/capture/stitcher.ts` (commit `c46fdd4`) address both problems the Spike 2 re-run surfaced. `spikes/verify-cross-display-drag.js`'s anchor-matching bug (compared `getBounds()` against `display.bounds`, hit the 28pt quirk below) is fixed — matches on `x`+`width` instead of `y`. Ran end-to-end against real two-display hardware (2560×1664 Retina + 1920×1080 external): a selection anchored on the external (1x) display, ending on the Retina (2x) display, produced a clipboard image at exactly `1158×1252px` — the correct native 2x composite size, not the `579×626` a silent 1x downsample would've produced. Spike 4's original bug is confirmed fixed, not just theoretically fixed. Toolbar-host selection also confirmed correct (hosted on the Retina window, matching where the drag ended). Separately: a `getBounds()` self-report quirk on the Retina overlay window (misreports `y`/`height` by 28pt near the top edge) was checked against real captured screen pixels and is **not** an actual rendering bug — the app places windows via `display.bounds`, never `getBounds()`, so this only ever affected the verify script's own matching logic, now fixed.

## Phase 1 — Skeleton

- [x] Menu bar tray
- [x] `LSUIElement` / dock hidden
- [x] Single-instance lock
- [x] Build pipeline (electron-vite, runnable `.app`)
- [x] Settings store schema (`electron-store`) — `main/settings/store.ts`
- [x] Screen Recording permission check + onboarding screen — `main/permissions/onboardingWindow.ts`
- [x] Launch at login — `main/settings/launchAtLogin.ts`

## Phase 2 — Basic capture

- [x] `screencapture.ts` — typed wrapper over `/usr/sbin/screencapture`
- [x] `displayManager.ts` + unit tests (single Retina now; full multi-monitor matrix pending spike 2)
- [x] Full-screen and per-display capture
- [x] Clipboard write — `main/output/clipboard.ts`
- [x] File write to default save folder (e.g. `~/Pictures/Screenshots`) — `main/output/fileWriter.ts`
- [x] Permission check + onboarding screen (moved here from Phase 1)

## Phase 3 — Region selection

- [x] Overlay window pool (`main/overlay/overlayManager.ts`) — pre-warmed per display, show/hide, Escape-dismiss IPC
- [x] Canvas drag-select UI (rect on mouse-up, `W × H` badge)
- [x] Modifier keys: Shift = square, Space = move selection, Option = resize from center
- [x] Arrow key nudge (1px / 10px with Shift)
- [x] Esc cancels + restores focus to the previously-frontmost app — implemented in `main/capture/frontmostApp.ts` (new) + `overlayManager.ts`'s `showOverlays()`/`hideOverlays()`. Uses `lsappinfo`/`open -b` rather than AppleScript's `System Events`, deliberately — the latter needs a separate macOS Automation permission prompt beyond Screen Recording, which this avoids entirely. Frontmost app is recorded before any overlay window calls `.focus()` (ordering verified necessary — after focus() the frontmost app IS this app). ~8ms round-trip measured on real hardware, negligible against the 80ms hotkey latency budget. Verified `getFrontmostAppBundleId()`/`activateApp()` directly against real macOS state (correctly detected the real frontmost app, `activateApp()` ran cleanly, no extra permission prompt triggered). Restores focus on every overlay dismissal (cancel, Copy, Save — not just Esc), which is a broader interpretation than the spec's literal "Esc cancels + restores focus" wording but matches the same intent. Full GUI click-through (hotkey → drag → Esc → watch focus actually land back) not done — needs a human at the keyboard.
- [x] Magnifier loupe (zoomed pixels + coordinates + hex color) — built and wired into `renderer/overlay/main.ts` (`magnifier.ts`), backed by a scoped `desktopCapturer` use in `main/capture/desktopCaptureSource.ts` for the live low-latency preview only — screenshot output itself still goes through `screencapture`, so this doesn't violate the "no desktopCapturer for stills" rule; the file's own header comment says so explicitly.

## Phase 4 — Floating toolbar

- [x] Toolbar UI: Copy / Save / Redo Selection / Cancel
- [x] Anchored to selection, flips above if it'd go offscreen, clamped to display bounds
- [x] Wire actions to real capture output
- [x] Disappears on action

## Phase 5 — Settings & shortcuts

- [x] Settings window (React) — `main/settings/settingsWindow.ts` + `renderer/settings/App.tsx` (uncommitted)
- [x] Shortcut recorder + conflict detection (`⌃⇧` defaults, not `⌘⇧3/4`) — `renderer/settings/acceleratorRecorder.ts` + `main/shortcuts/shortcutManager.ts` (uncommitted)
- [x] Launch-at-login toggle — wired into Settings UI (uncommitted); store/IPC plumbing landed in `003e9ea`
- [x] Preferences wired and persisted — `main/settings/settingsIpc.ts` (uncommitted)

## Phase 6 — Polish

- [x] Empty states — surveyed every UI surface (Settings, onboarding, overlay/magnifier, save folder). Conclusion: this checklist item doesn't really apply to v1.0's actual scope — there's no list/gallery UI (history/gallery is deferred, §2.4) for an "empty state" concept to attach to. Settings window's loading/error state is the one thing that fits the spirit of this item, and it's already implemented (`App.tsx`'s `loadError`/loading branch). Closing as scoped-out rather than inventing work.
- [x] Error states (every failure surfaces a notification/inline message, per CLAUDE.md — never silent) — audited every failure path in `main/capture/*`, `main/output/*`, `main/overlay/*`, `main/settings/*`, `main/permissions/*`. Core capture/clipboard/save pipeline (`captureService.ts`) was already solid. Fixed 3 gaps that only logged instead of notifying the user: `onboardingWindow.ts`'s "Open Settings" button, `settingsIpc.ts`'s "Take over shortcuts" button, `index.ts`'s "Open Save Folder". Left as-is (log-only, on purpose): `settingsWindow.ts`/`onboardingWindow.ts`'s `loadURL`/`loadFile` failure catch — a renderer bundle failing to load post-build is effectively can't-happen, and there's no window to show a message in at that point anyway. `magnifier.ts`'s silent catch on stream startup is also intentional (documented as a best-effort cosmetic aid, not part of the core capture flow).
- [x] App icon — **placeholder only, by explicit agreement with the user** ("demo icon for now, will design a better one"). `build/icon.png` (1024×1024, alpha), a crop-corners/viewfinder motif in the app's existing accent blue. Wired via `electron-builder.yml`'s `mac.icon`. Meets electron-builder's requirements for auto-`.icns` generation but the actual packaged `.icns` hasn't been produced/inspected — that needs `npm run dist`, which needs Apple credentials not available in this environment. Swap this file out whenever real branding is ready; nothing else references it.
- [ ] Onboarding polish — reviewed the window (`renderer/onboarding/`): copy is accurate (`electron-builder.yml`'s `productName: Screenshot` matches what the onboarding text tells users to look for in System Settings — verified, not just assumed), flow is functionally solid, both buttons wired to real actions. Fixed the one concrete gap: default keyboard focus on "Open System Settings" so Enter works without tabbing first. What's left (visual branding, in-window icon/graphic) is blocked on the same design input as the App Icon item above — not something to invent unilaterally.

## Phase 7 — Ship

- [ ] Developer ID signing + hardened runtime + entitlements
- [ ] Notarization + stapling
- [ ] DMG with drag-to-Applications
- [ ] `electron-updater` feed (S3/R2)
- [ ] Privacy policy

---

## Pre-release hardening pass

Multi-angle code review across everything uncommitted (cross-display drag, focus-restore, magnifier, error handling). 8 real issues found and fixed:

- `showOverlays()` re-entrancy guard — a double-trigger (rapid hotkey re-press, or hotkey + tray click) could clobber the recorded frontmost-app id with the app's own overlay window, silently breaking focus-restore.
- Unsafe `getBounds()` fallback removed from both `dragCoordinator.ts` and `overlayManager.ts` (was duplicated in two places, and reachable via a destroyed `BrowserWindow` if a display disconnects mid-drag) — replaced with one shared `originForDisplayId()` in `displayManager.ts` that returns `null` instead of guessing, consistently handled everywhere now (previously one path guessed, another silently excluded).
- `rebuildOverlayWindows()` now cancels any in-flight drag before destroying windows, closing the root cause of the above (a poll timer ticking against a stale, pre-rebuild window array).
- `magnifier.ts`: empty catch block now logs (was completely silent — CLAUDE.md violation); hex-color sampling now clamps coordinates (was reading out-of-bounds pixels at display edges, always returning `#000000` there).
- Redundant `screen.getAllDisplays()` call removed from the drag poll loop (was calling it twice per 16ms tick).
- Failure-notification pattern deduplicated into `main/notify.ts` (was copy-pasted 4 times across `index.ts`, `onboardingWindow.ts`, `settingsIpc.ts`, `captureService.ts`).

One candidate finding (focus-restore racing the actual `screencapture` call on Copy/Save) was investigated and refuted — `hideOverlays()` hides the overlay windows synchronously before the app-reactivation fires, and `screencapture` reads on-screen pixels regardless of keyboard focus, so there's no actual race.

Verified: typecheck, lint, and all 52 unit tests pass. Full live re-verification of the cross-display E2E path wasn't possible in this pass — the external monitor was disconnected by the time fixes landed, and this sandbox's Screen Recording permission also lapsed (confirmed via a direct `screencapture` call outside Electron entirely — not a code issue). Re-run `spikes/verify-cross-display-drag.js` next time a second display + permission are both available, to confirm the refactor didn't regress the earlier-passing result.

---

## Phase 8 — Universal Text Capture (beta track, BUILD-SPEC.md §2.4.1 / §3.10 / §4.9)

Not gated on Phase 7 (Ship) — built and tested in dev/beta now, Phase 7's signing/notarization/DMG work stays parked. Vision framework only, on-device — see BUILD-SPEC.md §3.10 for why a cloud OCR API isn't an option here (Hard Rule 1).

### 8.0 — Spikes (gate the rest, same discipline as Phase 0)

- [x] Spike A: minimal Swift CLI (`spikes/text-recognition-helper.swift`) — confirmed. Recognized every line of two synthetic fixtures (3 lines and a 10-sentence paragraph, both via `sharp` SVG rendering — no screen-capture permission needed) at 100% confidence, byte-exact text. Steady-state cold-process latency 180–320ms depending on text density, under the 300ms target for typical crops. First-ever invocation after compile was an outlier (~1s) — a one-time OS paging cost, not per-call. Full numbers in `spikes/FINDINGS.md`.
- [x] Spike B: confirmed empirically (not just from docs) — Vision's bounding boxes are normalized with **bottom-left origin**, verified by checking known-top vs. known-bottom fixture text against reported `y` values. **Decided:** the conversion lives as new exported functions in `displayManager.ts`, not a sibling module — it's the same category of pure coordinate translation the file already owns (Hard Rule 3). See `spikes/FINDINGS.md`.
- [x] Spike C: confirmed — same finding as Spike A (clean subprocess invocation, JSON on stdout, no new npm dependency, no new toolchain beyond the Xcode Command Line Tools already needed for notarization).
- [x] Spike D: confirmed and reliable — `VNRecognizedText.boundingBox(for:)` on word-substring ranges recovered all 24 words across both fixtures with correct, monotonically-ordered per-word boxes. One minor edge case noted (a line with an embedded quote mark got split by Vision's own line segmentation) but doesn't block word-level hit-testing. **Gate cleared:** Phase 8.4 proceeds with word-level highlighting, no fallback to line-level-only needed.
- [x] Confirm against Apple docs: does Vision text recognition on already-captured pixels need any permission beyond the Screen Recording permission this app already has? **Confirmed: no.** The only privacy key associated with `VNRecognizeTextRequest` anywhere in Apple's docs/forums is `NSCameraUsageDescription` — and that's specifically for apps that feed Vision *live camera frames*. This helper only ever processes an already-captured PNG (via `screencapture`, already gated on Screen Recording), so no additional Info.plist key or TCC permission applies.

### 8.1 — Native bridge

- [x] Swift helper source — `native/textRecognizer/main.swift` (promoted from the spike, cleaned up) + `scripts/buildTextRecognizer.mjs` (mirrors `buildPreloads.mjs`'s role), compiling to `resources/bin/text-recognizer`. Wired into `npm run dev` / `npm run build` (`build:native`). electron-builder `extraResources` entry added for Phase 7 (untested — flagged there re: `mac.target.arch: [universal]` needing a universal binary, not just a plain `swiftc` build).
- [x] `src/main/capture/textRecognition.ts` — typed wrapper over the helper: spawn via `child_process`, parse JSON, typed `TextRecognitionError` on failure or malformed output (never a silent no-op).
- [x] `shared/types.ts`: `NormalizedBoxBottomLeft`, `RecognizedWord`, `RecognizedLine`, `TextRecognitionResult`.
- [x] Unit tests (`test/unit/textRecognition.test.ts`) for the parsing contract — pulled `parseHelperOutput` out as a pure function (matching how `screencapture.ts`'s `buildRegionSpec` is tested separately from the real shell-out) so no `child_process` mocking is needed.

### 8.2 — Coordinate mapping

- [x] `displayManager.ts`'s new `visionBoxToGlobalPoints` — Vision normalized box → global Electron points, given the captured region's rect in points. Turned out to need no explicit `scaleFactor` math at all (Hard Rule 3 still satisfied — see the function's own comment for why: Vision's box is a fraction of the image, and that fraction is scale-invariant).
- [x] New cases in `test/unit/displayManager.test.ts`: identity box (whole image), top-of-image flip, bottom-of-image flip, negative-origin region offset. All 4 pass.

### 8.3 — Orchestration & IPC

- [x] New channels in `main/ipc/channels.ts`: `TEXT_CAPTURE_START` / `_RESULT` / `_COPY` / `_CANCEL`.
- [x] New `src/main/capture/textCaptureService.ts` — `captureTextInRegion()` orchestrates one text capture end-to-end: reuses `captureService.ts`'s `captureToTemp` (newly exported, no logic duplicated — the composite PNG it produces always spans exactly the input rect regardless of cross-display stitching, which is exactly what `visionBoxToGlobalPoints` needs) → `textRecognition.ts` → converts every box to GLOBAL points. Also folds in the "no text found" case from 8.5 below (checked off there too).
- [x] `main/output/clipboard.ts`: added `copyTextToClipboard` alongside the existing `copyImageFileToClipboard`.
- [x] IPC payload shapes added to `shared/types.ts`: `TextCaptureLine`, `TextCaptureWord`, `TextCaptureResultPayload`, `TextCaptureCopyPayload` — deliberately in each RECIPIENT overlay window's local points (matching `OverlaySelectionStatePayload`'s existing convention), which is why `textCaptureService.ts` itself returns GLOBAL points and a separate global→local translation step belongs in 8.4, not here.
- [x] **Re-scoped, moved to 8.4 — done there.** The new shortcut default and its `shortcutManager.ts`/`index.ts` wiring needed the overlay's text-capture mode to exist first (a real handler has nothing coherent to call otherwise), so it was built alongside the rest of the mode-switch logic in 8.4 instead of split across two phases. See 8.4's first item.

### 8.4 — Overlay UX: selection → text layer

- [x] New shortcut default `Control+Shift+2` (`shortcuts/defaults.ts`) + `ShortcutActionId` addition + a real `captureText()` handler in `index.ts`, wired through `initShortcuts`/`shortcutManager.ts`. Also added a `backfillMissingShortcuts` step in `settings/store.ts` (an existing dev settings file predating this feature wouldn't otherwise pick up the new default — electron-store doesn't deep-merge into an already-present `shortcuts` object) and a Settings UI row (`renderer/settings/App.tsx`) so it's visible/rebindable.
- [x] Mode flag threaded through: `CaptureMode`/`OverlayResetPayload` (`shared/types.ts`), `showOverlays(mode)` + new `showOverlaysForTextCapture()` (`overlayManager.ts`), sent to every renderer via `OVERLAY_RESET`'s payload (previously argument-less).
- [x] On mouse-up in text-capture mode: `overlayManager.ts`'s `OVERLAY_DRAG_END` handler now also calls a new `handleTextCaptureFinalized()`, which reads the just-finalized rect straight from `dragCoordinator.ts` (new exported `getFinalizedSelection()`, added rather than round-tripping through a renderer button click — matches the feature's "release, and it's instantly read" framing), calls `textCaptureService.captureTextInRegion()`, translates the global-point result into the host window's local points, sends via `TEXT_CAPTURE_RESULT`. "Reading…" status shown/hidden via a new `#text-status` element (`index.html`), anchored the same way the toolbar is (refactored into a shared `positionBelowSelection` helper).
- [x] `renderer/overlay/textLayer.ts` — vanilla TS, no React. Renders highlight boxes for the current word/line selection; hit-testing itself lives in pure, unit-tested `shared/textSelection.ts` (11 new tests).
- [x] **Decision made:** custom hit-testing over Vision's word boxes, not real DOM text selection — as recommended. `wordAtPoint` for a click, `wordsIntersectingRect` for a drag (a zero-size rect can't reuse `rectIntersection`, which always rejects it — this needed a separate point-containment check, not a shared code path).
- [x] Click-drag highlighting (mousedown inside the recognized region starts a `textLayer` drag instead of a new region-select drag), `⌘A` selects all, `⌘C` copies via `TEXT_CAPTURE_COPY` → `copyTextToClipboard` (new in `clipboard.ts`) → `hideOverlays()`. No separate Copy button — matches native text-selection UX (select, then ⌘C) per the feature's own framing.
- [x] `Esc` cancels via the existing `triggerCancel()`/`frontmostApp.ts` path, unchanged — just also clears `textLayer` state now.
- **Known scope cut, not fixed now:** a text-capture selection spanning two displays only gets recognized/shown on whichever display hosts the finalized rect (same "one host" rule the region-capture toolbar already uses) — not specially handled or tested here.

### 8.5 — Error handling & edge cases

- [x] No text found in region → visible message. Built into `textCaptureService.ts` (see 8.3) rather than as a separate later pass — natural to handle right where the empty-result case is already known, via the existing `main/notify.ts` pattern (title "Text capture failed", body "No text found in the selected region.").
- [x] Vision request failure or helper crash → typed error (`TextRecognitionError`) surfaced via the same `main/notify.ts` pattern, also in `textCaptureService.ts`.

### 8.6 — Verification

- [x] `npm test` passes — 71 tests (up from 60: 11 new for `textSelection.ts`'s hit-testing/ordering logic). `npm run typecheck`, `npm run lint`, and `npm run build` (full pipeline: typecheck → electron-vite bundle → preloads → native helper) all clean too.
- [ ] **Manual verification — needs a real Mac session, not done here.** This sandboxed environment can't drive a global-shortcut Electron app on a real display (no Screen Recording permission grant, no physical keyboard/mouse input to a GUI window). Needs a human: `npm run dev`, press `⌃⇧2`, drag over real on-screen text (try a webpage, a PDF in Preview, a code editor), confirm the "Reading…" status appears then resolves, drag-select a subset of words and confirm the highlight lands on the right ones, `⌘A` then `⌘C`, paste somewhere and confirm it matches. Also try a region with no text (confirm the "No text found" notification appears and the overlay just closes, nothing hangs) and a two-display setup (confirm the known scope cut above behaves as expected — no crash, just no result shown for the non-host display).

**Explicitly not part of this track:** OCR-based secret redaction (stays tied to the deferred annotation editor, BUILD-SPEC.md §4.5), multi-language tuning beyond Vision's defaults, handwriting/table recognition, and signing/notarizing the new helper binary (belongs to Phase 7 whenever that resumes).

---

## Phase 9 — Minimal Inline Annotation (BUILD-SPEC.md §2.4.2 / §4.5a)

Not gated on Phase 7 (Ship) or Phase 8 (OCR) — an independent lightweight track, built at explicit user request. Not the full document-model editor from §4.5; see §2.4.2 for exactly what's excluded.

**Revised same day (2026-08-27):** first built as a separate editor `BrowserWindow` (an "Annotate" toolbar button opened it). At explicit user request — "I don't want to go in separate page... use it in right corner row, same like Lightshot" — reworked to draw inline on the region-capture overlay itself, a vertical icon column anchored to the selection's right edge. The separate-window items below were built, then **reverted**: `main/editor/editorWindow.ts` deleted, `renderer/editor/App.tsx` and `preload/editor.preload.ts` restored to their original unwired Phase-1 stub content, `EDITOR_*` IPC channels and `EditorTool`/`EditorImagePayload`/`EditorExportPayload` types removed. What's below reflects the current, inline architecture only.

- [x] Once a selection finalizes in region mode, the overlay shows a vertical tool column (Arrow/Box/Oval/Line/Undo/color swatch) at the selection's right edge (flips left if it'd go off-screen) — `renderer/overlay/annotationToolbar.ts` (new), markup + CSS in `renderer/overlay/index.html`.
- [x] Click-drag inside the finalized selection draws the active shape directly on the transparent overlay canvas (visible against the real screen showing through underneath — no frozen preview image needed); click-drag outside it still starts a new selection, as before. Shape math/rendering: `renderer/overlay/annotationShapes.ts` (new). Wiring (mousedown/move/up branching, render(), Undo, `⌘Z`): `renderer/overlay/main.ts`.
- [x] Shapes are tied to the current finalized selection's lifetime — a new drag, an arrow-key nudge, or Redo Selection clears them (documented tradeoff: no per-shape move/resize, so keeping shapes positioned against a moved rect isn't attempted).
- [x] Copy/Save now send `{ rectInPoints, shapes }` (`OverlayExportPayload`, `shared/types.ts`) over the existing `OVERLAY_ACTION_COPY`/`OVERLAY_ACTION_SAVE` channels — no new IPC channels needed. `overlayManager.ts`'s `handleCopyAction`/`handleSaveAction` convert shape endpoints from local to global points (`toGlobalShapes`, reusing `displayManager.ts`'s existing `overlayLocalPointToGlobalPoint`).
- [x] `displayManager.ts` gains `globalPointToCapturePixels` (global point → the captured image's own pixel space, given the capture's origin and `compositeScaleFactor`) and exposes `compositeScaleFactor` on `CapturePlan` — real scaleFactor math, Hard Rule 3, so it lives here and nowhere else.
- [x] `captureService.ts`'s `captureToTemp`/`captureRectAndCopy`/`captureRectAndSave` take an optional `shapes` param; when present, converts them to the capture's pixel space and calls the new compositor after the real screenshot pixels exist (never before). `captureRectForAnnotation` (the old editor-handoff export) removed — nothing needs it now.
- [x] `main/output/annotationOverlay.ts` (new) — `compositeAnnotations()` builds an SVG from the shapes and composites it onto the captured PNG via `sharp` (already a project dependency, Hard Rule 9 — no new package), overwriting the file. A no-op when there are no shapes, so Copy/Save's fast path is unchanged for captures with no annotation. Degrades gracefully on compositing failure (notifies, still returns the real un-annotated capture rather than losing the screenshot).
- [x] `npm run typecheck` / `npm run lint` (scoped to touched files) / `npm test` (71 passed) / `npm run build` all pass after the rework.
- [x] Manual verification against the live app: confirmed live by the user against a freshly restarted dev build (2026-08-27) — capture, draw shapes in multiple colors, Undo, Copy/Save all worked as expected with the vertical icon column in place, no separate window opened. Full matrix (every tool/color individually, Save specifically, clicking outside the selection to redo) not separately itemized — flag if any of those show a problem.

**Not built in this track** (see §2.4.2): shape restyle-after-placement, layers, crop, text, blur/pixelate, per-tool style memory, unbounded undo (or undo that survives a re-finalized selection). Those stay tied to §4.5's full editor.

---

## Deferred — not scheduled, no phase number (BUILD-SPEC.md §2.4)

Design notes preserved in `BUILD-SPEC.md` (§3.5, §4.5, §4.8) as reference. Don't start on these without an explicit decision to bring them back into scope:

- Full non-destructive annotation editor (§4.5) — the minimal inline version is Phase 9 above, not this
- Scrolling capture
- Screenshot history
- Pin-to-screen
- Licensing / monetization
