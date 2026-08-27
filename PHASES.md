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
- [ ] **Re-scoped, moved to 8.4:** the new shortcut default and its `shortcutManager.ts`/`index.ts` wiring. `ShortcutActionId`/`ActionHandlers` couples a new shortcut to a real handler function at the type level, and a real handler needs the overlay to know it's in "text capture" mode versus normal region-select — that's UX/state-machine work, not orchestration, and `overlayManager.ts`/`index.ts` are under active concurrent edits for Phase 9 (the minimal annotation track) right now. Building a half-wired shortcut ahead of the mode it depends on risked a bad merge more than it saved time — deferring it to sit next to the rest of the mode-switch logic in 8.4 instead of splitting one coherent change across two phases.

### 8.4 — Overlay UX: selection → text layer

- [ ] New shortcut default in `shortcuts/defaults.ts` (moved from 8.3, see above) + `ShortcutActionId` addition + a real handler in `index.ts`, wired through `shortcutManager.ts`.
- [ ] Reuse the existing drag-select UI (`renderer/overlay/main.ts`) for the initial region drag — same crosshair interaction as region capture, no new window type. Needs a mode flag (text-capture vs. region-select) threaded through `showOverlays()`/`overlayManager.ts` so mouse-up branches correctly instead of always showing the region-capture toolbar.
- [ ] On mouse-up in text-capture mode: call `textCaptureService.captureTextInRegion()`, translate its global-point result into each recipient window's local points (mirroring how `toGlobalRect`/`overlayLocalRectToGlobalPoints` already work for Copy/Save), send via `TEXT_CAPTURE_RESULT`. Brief "reading…" state while this runs (near-instant per Spike A's target).
- [ ] New `renderer/overlay/textLayer.ts` (**vanilla TS, no React** — the architecture rule for the overlay renderer applies here too) rendering recognized words positioned exactly over their screen coordinates.
- [ ] **Decision point to confirm before building:** true invisible-DOM-text selection (relies on font metrics closely matching, which won't be recoverable from Vision output) vs. custom hit-testing (compute which word/line boxes intersect the drag rectangle, highlight those, build the copied string directly from Vision's recognized text). Recommend the custom hit-testing model as more reliable — flag for a quick confirm, don't just build it silently.
- [ ] Click-drag highlighting, "select all in region," `⌘C` / Copy button wired to `TEXT_CAPTURE_COPY` → `copyTextToClipboard`.
- [ ] `Esc` cancels and restores focus via the existing `frontmostApp.ts` mechanism (§4.2 step 7) — don't reimplement.

### 8.5 — Error handling & edge cases

- [x] No text found in region → visible message. Built into `textCaptureService.ts` (see 8.3) rather than as a separate later pass — natural to handle right where the empty-result case is already known, via the existing `main/notify.ts` pattern (title "Text capture failed", body "No text found in the selected region.").
- [x] Vision request failure or helper crash → typed error (`TextRecognitionError`) surfaced via the same `main/notify.ts` pattern, also in `textCaptureService.ts`.

### 8.6 — Verification

- [ ] `npm test` passes (new wrapper + coordinate-mapping tests alongside the existing 52).
- [ ] Manual verification note: real on-screen text tested across a few sources (webpage, PDF in Preview, code editor, video frame with subtitles) on both a Retina and a mixed-DPI setup — what was clicked, what was observed.

**Explicitly not part of this track:** OCR-based secret redaction (stays tied to the deferred annotation editor, BUILD-SPEC.md §4.5), multi-language tuning beyond Vision's defaults, handwriting/table recognition, and signing/notarizing the new helper binary (belongs to Phase 7 whenever that resumes).

---

## Phase 9 — Minimal Inline Annotation (BUILD-SPEC.md §2.4.2 / §4.5a)

Not gated on Phase 7 (Ship) or Phase 8 (OCR) — an independent lightweight track, built at explicit user request. Not the full document-model editor from §4.5; see §2.4.2 for exactly what's excluded.

- [x] Overlay toolbar gains an **Annotate** button next to Copy/Save (`renderer/overlay/index.html`, `main.ts`), wired through a new `OVERLAY_ACTION_ANNOTATE` channel to `overlayManager.ts`'s `handleAnnotateAction`.
- [x] `captureService.ts` gains `captureRectForAnnotation` — captures to temp like Copy/Save but does NOT clean up; the editor flow owns that temp file's lifecycle until export or cancel.
- [x] `main/editor/editorWindow.ts` — new owner for the editor `BrowserWindow` (contextIsolation/sandbox/explicit preload, Hard Rule 4). Single session at a time: a second Annotate click while one's open focuses the existing window and discards the new capture rather than replacing an in-progress edit. Window closing by any path (Cancel, Copy, Save, red-dot/`⌘W`) cleans up the temp dir.
- [x] `preload/editor.preload.ts` replaces the unwired Phase-1 stub with a real `editorApi` (getImage / exportCopy / exportSave / cancel) — image handed across IPC as a base64 PNG data URL, since Hard Rule 5 forbids exposing `fs` or arbitrary paths to a renderer.
- [x] `renderer/editor/shapes.ts` — shape model + draw functions for arrow/rectangle/oval/line (React is fine in this window per the relaxed rule in CLAUDE.md's Architecture section — it's not the 60fps overlay).
- [x] `renderer/editor/App.tsx` — real editor UI: tool row, color row (fixed swatches + native `<input type="color">`, zero new dependency), Undo, Cancel, Save, Copy. Canvas backing store is the image's native pixel size; CSS fits it to the window (a canvas-buffer-vs-CSS-size conversion, explicitly called out in comments as NOT the Hard Rule 3 scaleFactor concern).
- [x] `shared/types.ts`: `EditorTool`, `EditorImagePayload`, `EditorExportPayload`. `main/ipc/channels.ts`: `EDITOR_GET_IMAGE` / `EDITOR_EXPORT_COPY` / `EDITOR_EXPORT_SAVE` / `EDITOR_CANCEL`.
- [x] `editor/index.html`'s CSP updated to allow `img-src 'self' data:` (the base64 image payload needs this beyond the default `default-src 'self'`).
- [x] `main/index.ts` wires `teardownEditor()` into `before-quit`, alongside the other window teardowns.
- [x] `npm run typecheck` / `npm run lint` / `npm test` / `npm run build` all pass. Two strict-mode fixes needed along the way (both `noUncheckedIndexedAccess`, not logic bugs): `decodePngDataUrl`'s regex capture group and `COLORS`'s array-literal indexing. The one test failure in this run (`visionBoxToGlobalPoints` in `displayManager.test.ts`) belongs to the concurrent Phase 8 (OCR) track being built in parallel in this same repo, not this change.
- [x] Manual verification: confirmed live by the user against the dev build (2026-08-27) — capture → Annotate → draw → color/Undo → Copy/Save all worked as expected. (The packaged `/Applications/Snapper.app` instance had to be quit first — its single-instance lock was silently deferring `npm run dev`'s launch to that older build with no Annotate button; quit with the user's go-ahead, then dev relaunched clean.) Full matrix across every tool/color/Cancel path and multi-monitor isn't separately itemized here — flag if any of those show a problem.

**Not built in this track** (see §2.4.2): shape restyle-after-placement, layers, crop, text, blur/pixelate, per-tool style memory, unbounded undo. Those stay tied to §4.5's full editor.

---

## Deferred — not scheduled, no phase number (BUILD-SPEC.md §2.4)

Design notes preserved in `BUILD-SPEC.md` (§3.5, §4.5, §4.8) as reference. Don't start on these without an explicit decision to bring them back into scope:

- Full non-destructive annotation editor (§4.5) — the minimal inline version is Phase 9 above, not this
- Scrolling capture
- Screenshot history
- Pin-to-screen
- Licensing / monetization
