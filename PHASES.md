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

## Deferred — not scheduled, no phase number (BUILD-SPEC.md §2.4)

Design notes preserved in `BUILD-SPEC.md` (§3.5, §4.5, §4.8) as reference. Don't start on these without an explicit decision to bring them back into scope:

- Annotation editor
- Screenshot history
- Pin-to-screen
- Licensing / monetization

## Full-page (scrolling) capture — brought into scope, implemented

Explicitly requested and brought back into scope (was deferred per §2.4/§3.5). Feasibility spiked first (per this repo's "spike before building" convention) rather than building blind:

- **Spike result:** scroll-event synthesis works via `CGEventCreateScrollWheelEvent`, but **only when posted via `.cgSessionEventTap`** — `.cghidEventTap` was silently ignored by Safari/WebKit (worked fine in TextEdit, a native AppKit app) with no error, nothing scrolls. Found by testing against a real browser, not by reading it off Apple's docs. Documented at length in `native/scrollhelper/main.swift`'s header comment so this doesn't get "corrected" back to the wrong tap by someone who hasn't hit this.
- **Architecture:** a bundled native Swift helper (`native/scrollhelper/`, compiled by `scripts/buildScrollHelper.mjs` into `resources/scrollhelper`, invoked via `execFile` from `main/capture/scrollSynthesis.ts`) — same subprocess-helper pattern as `screencapture`, not a native Node addon, consistent with this app's existing architecture. Needs its own Accessibility permission grant (`main/permissions/accessibility.ts`), separate from Screen Recording — requested lazily on first use, not at launch, per `BUILD-SPEC.md` §3.5.
- **Stitching:** `main/capture/scrollStitcher.ts` — cross-correlation overlap detection on a horizontal strip of rows (BUILD-SPEC.md §3.5's design), with fixture-based tests (`test/unit/scrollStitcher.test.ts`) that slice a known tall image into overlapping frames at known offsets and assert exact reconstruction — same treatment CLAUDE.md already called for.
- **Orchestration:** `main/capture/scrollingCapture.ts` — capture, scroll, poll-until-settled (cap ~400ms), repeat until no new content or a hard cap (50 frames / 30,000px), stitch, output to both clipboard and disk (matching full-screen capture's default-both behavior, not a separate Copy/Save choice).
- **UI:** new "Full Page" button on the floating toolbar, alongside Copy/Save/Redo/Cancel.

**Not yet verified end-to-end in the packaged app** — typecheck, lint, and all fixture-based unit tests pass, and the underlying scroll-synthesis mechanism was proven against real TextEdit + Safari targets, but a live run of the fully-wired pipeline (real drag-select → Full Page click → scroll loop → stitched output) hasn't been completed. The test environment's Accessibility grant for `osascript` (used to drive the test targets) changed mid-session, and the target windows' positions shifted since the user was actively using the machine — needs a real hands-on test.
