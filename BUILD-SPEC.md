# Mac Screenshot App — Build Spec

**Product:** Menu-bar screenshot tool for macOS, built with Electron
**Model:** Free (v1.0). No license, no trial, no account, no payment processor.
**Date:** August 2026
**Status:** Pre-development spec

---

## 1. Competitor Analysis

### 1.1 The landscape

| App | Price | Tech | Size | Strength | Weakness |
|---|---|---|---|---|---|
| **CleanShot X** | $29 one-time + $19/yr for updates, or $8/user/mo Cloud Pro | Native Swift | ~60 MB | Most complete: scrolling capture, OCR, recording, cloud links, annotation | Renewal/subscription pressure; cloud-centric; feature-heavy for casual users |
| **Shottr** | Free / pay-what-you-want | Native Swift | **2.3 MB** | Blistering speed (~17 ms capture), pixel ruler, OCR, contrast checker, scrolling capture, S3 upload | No polished cloud, minimal visual design, solo-dev risk |
| **Xnapper** | ~$15 one-time (free w/ watermark) | Native Swift | small | Auto-beautification, one-click redaction of emails/API keys, OCR | Thin annotation set, no scrolling capture, no cloud |
| **Snagit** | ~$63 one-time | Native, cross-platform | large | Enterprise-grade, Mac+Windows parity, templates, video | Expensive, dated UI, heavy |
| **Monosnap** | Freemium | Electron-ish/native | medium | 2 GB free cloud, multi-cloud targets | Watermarks, aging UI |
| **macOS built-in** (Cmd+Shift+5) | Free | Native | 0 | Always there, zero friction, screen recording included | No scrolling capture, weak markup, no history, no naming templates |

### 1.2 What every serious competitor ships (table stakes)

- Region and full-screen capture with a shortcut
- Multi-monitor support with correct Retina resolution
- Clipboard + auto-save simultaneously
- Menu bar presence + launch at login

A few things every serious competitor *also* ships — an annotation editor, scrolling capture, screenshot history — are **deliberately cut from this project's v1.0** (§2.4). That's a scope decision, not an oversight: don't add them back in unprompted because a competitor has them.

### 1.3 Where competitors are genuinely weak — your openings

1. **Nobody has a clean "completely free, zero cloud, zero account" story.** CleanShot is $29+$19/yr. Shottr is free but pay-what-you-want with an unclear business model, which enterprise buyers dislike. Snagit is $63. Being outright free with no account, no watermark, and no nag removes the one friction even Shottr still has.

2. **Privacy is unclaimed territory.** Every cloud-first competitor requires an account for its best features. A screenshot tool sees passwords, API keys, customer PII, and internal dashboards. "This app makes zero network requests except an update check — here's the proof" is a claim CleanShot structurally cannot make. Developers, finance, healthcare, legal, and security-conscious enterprises buy on this.

3. **Multi-monitor is under-served.** Mixed-DPI setups (Retina laptop + 4K external + 1080p vertical) produce wrong-resolution or wrong-monitor captures in most tools. Doing this *correctly* is unglamorous, hard, and noticed by exactly the professionals who care.

### 1.4 Where you cannot win — be honest about this

The stated constraint is Electron. That costs you the two axes Shottr wins on:

- **Bundle size:** Electron ships ~100–150 MB against Shottr's 2.3 MB. You will lose every "lightweight" comparison.
- **Idle memory:** ~120–200 MB against a native app's ~30–50 MB. Menu bar apps run 24/7 and users watch Activity Monitor.
- **Cold capture latency:** if a BrowserWindow has to be created when the hotkey fires, you're at 200–400 ms against Shottr's 17 ms.

Section 3.1 gives the architecture that mitigates all three. But do not market this app as "lightweight" or "fastest" — you will be fact-checked in the first review. Market it on **privacy, free, and multi-monitor correctness**.

If bundle size and memory turn out to matter more than you expect after launch, the migration path is to move capture + overlay into a small Swift helper and keep Electron for settings (and an editor, if one returns). Section 3.6 keeps that door open.

---

## 2. Product Definition

### 2.1 Positioning statement

> A fast, local-only screenshot tool for macOS. Everything stays on your Mac — no account, no cloud, no telemetry. It's free.

### 2.2 Target user

Primary: developers, designers, technical writers, and support engineers on multi-monitor Macs who take 20+ screenshots a day and are irritated by subscription creep.

Secondary: privacy-constrained teams (security, legal, finance, health) whose IT will not approve a cloud screenshot tool.

### 2.3 Pricing

**Free.** No license, no trial countdown, no account, no payment processor, no watermark. There is no Phase for licensing in this build — it doesn't exist for v1.0.

If monetization becomes relevant later, revisit it as its own scoping conversation once the free v1.0 has validated demand — don't build license-check infrastructure preemptively "just in case." Ship direct via Developer ID + notarization (§2.4 explains why the Mac App Store is still the wrong distribution channel even for a free app: sandboxing fights global shortcuts, screen capture, floating windows, and launch-at-login).

### 2.4 Scope decisions

**In scope for v1.0** (this is the actual requirement list this build targets):

- Region capture — drag-select a specific screen area
- Full-screen capture
- Multi-monitor support, including capture across multiple monitors
- Automatic clipboard copy
- Automatic local save (fixed default location for v1.0, e.g. `~/Pictures/Screenshots`; configurable save folder and filename templates are a fast-follow, not required for launch)
- Floating toolbar that appears over other apps during capture, stays visible while capturing, disappears after
- Menu bar presence: tools and settings reachable from the tray icon
- Global shortcuts, customizable via a recorder in Settings
- Launch at login
- Runs continuously in the background; main app window stays hidden; never appears in the Dock or app switcher

**Deferred — not in v1.0, may return later.** These have real design thinking already written up in this spec (§3.5, §4.5, §4.8) — that content is preserved as reference, not deleted, but none of it gets built until it's explicitly back in scope:

- Annotation editor (arrows, shapes, text, blur/pixelate, crop, etc.) — §4.5
- Scrolling capture — §3.5, §4.5 not applicable; see §3.5
- Screenshot history — §4.8
- "Pin to screen" floating pinned captures
- Window capture as a distinct mode (hover-to-highlight-window, dedicated shortcut) — region capture covers the requirement list; this is extra interaction surface not currently requested
- Licensing / payment / trial — see §2.3

**Explicitly out of scope, not just deferred** (say no to these, don't reconsider without a real reason):

- Screen recording / GIF — doubles engineering surface, pulls in codec/audio-permission/file-size problems.
- Cloud upload and shareable links — contradicts the local-only positioning and adds hosting cost, abuse handling, GDPR obligations.
- Windows or Linux — the whole product thesis is macOS-native feel.
- OCR — needs a native Vision bridge; revisit only alongside a real editor.
- Background/beautification presets — Xnapper owns this; not this product's fight.

---

## 3. Technical Architecture

### 3.1 The core decision: how you actually capture pixels

**Do not use Electron's `desktopCapturer` for still screenshots.** It is built for video streaming: it returns thumbnails (default 150×150), forces you to reason about `thumbnailSize` to get full resolution, is slow to enumerate sources, and has a long history of multi-monitor bugs.

**Use the macOS `screencapture` binary at `/usr/sbin/screencapture`.** It is present on every Mac, is a thin wrapper over Apple's own capture stack, respects Retina native resolution, and is fast.

Relevant flags:

| Flag | Meaning |
|---|---|
| `-x` | No shutter sound (always use this — you're drawing your own UI) |
| `-c` | Send to clipboard instead of a file |
| `-R x,y,w,h` | Capture an exact rectangle |
| `-D n` | Capture display `n` |
| `-l <windowid>` | Capture a specific window by CGWindowID |
| `-o` | No window drop shadow |
| `-t png` | Format |
| `-T n` | Delay in seconds |

Your capture path is: draw your own selection overlay in Electron → compute the rect → shell out to `screencapture -x -R … out.png` → read the file → hand to clipboard and disk.

**Retina caveat — RESOLVED by Phase 0 spike, see `spikes/FINDINGS.md`.** `-R x,y,w,h` takes Electron's global point coordinates as input and returns native (scaleFactor-multiplied) pixels as output, confirmed on this dev machine's single Retina display plus an independent `-D` full-display cross-check. The negative-origin / mixed-DPI / rotated-display matrix below is still unverified — needs a second physical display.

### 3.2 Coordinate systems — the #1 source of multi-monitor bugs

You will be juggling three coordinate spaces:

1. **Electron `screen` API** — logical points, origin top-left of the primary display, other displays can have negative x/y.
2. **`screencapture -R`** — global points, same origin convention (confirmed in the spike for the single-display case).
3. **Image pixels** — points × `display.scaleFactor`.

**Rule: write one module, `displayManager.ts`, that owns every conversion. No other file is allowed to multiply or divide by `scaleFactor`.** Unit-test it against fixtures for: single Retina, Retina + non-Retina external, display to the left of primary (negative x), display above primary (negative y), and a vertical/rotated display.

### 3.3 Window inventory

| Window | Purpose | Key properties |
|---|---|---|
| **Overlay** (one per display) | Region selection + floating toolbar | `transparent: true`, `frame: false`, `alwaysOnTop` at `screen-saver` level, `visibleOnAllWorkspaces: true` **with `{ visibleOnFullScreen: true }`**, `skipTaskbar`, `hasShadow: false`, `enableLargerThanScreen: true`, **`fullscreenable: true`** |

**`fullscreenable: true`, not `false`.** Phase 0 spike 3 (`spikes/FINDINGS.md`) found that `fullscreenable: false` — set at `BrowserWindow` construction time — silently prevents the window from ever joining another app's native-fullscreen Space, regardless of `visibleOnAllWorkspaces`/`visibleOnFullScreen` settings, and calling `setFullScreenable(true)` afterward does not fix it. This is safe: the overlay is frameless with no title bar, so there's no user-facing affordance to actually fullscreen it — just never call `setFullScreen(true)` on it yourself.
| **Settings** | Preferences | Normal window, lazy |

Editor and Pin windows are deferred (§2.4) — not part of the v1.0 window inventory.

**Latency mitigation:** create the overlay windows at app launch, one per display, and keep them alive but hidden (`hide()`, not `close()`). On hotkey, you only call `show()` + `focus()` — sub-50 ms. Rebuild the pool on `screen.on('display-added' | 'display-removed' | 'display-metrics-changed')`.

**Critical:** the app must never appear in the Dock or the app switcher. Call `app.dock.hide()` and set `LSUIElement: true` in Info.plist. When the overlay takes focus, restore focus to the previously frontmost app afterward — otherwise you break the user's flow every single capture.

### 3.4 Permissions

Screen capture requires user consent on macOS 10.15+.

- Check with `systemPreferences.getMediaAccessStatus('screen')` on launch.
- Known bug: the status **does not refresh within a running process** after the user flips the toggle in System Settings. Design for this — after sending the user to System Settings, show a "Restart app" button rather than polling for a change that will never arrive.
- Add `NSScreenCaptureUsageDescription` to Info.plist via electron-builder's `extendInfo`.
- Build a proper onboarding screen: explain *why* you need the permission, deep-link to `x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture`, then offer restart.
- **Dev-mode gotcha, confirmed firsthand during Phase 0 spikes:** `screencapture`, invoked from a dev Electron process, needs Screen Recording permission granted to *that specific Electron binary* (`node_modules/electron/dist/Electron.app`), not the terminal and not the eventual packaged app. Without it, every capture fails with `could not create image from rect` / `could not create image from display`.
- Accessibility permission would additionally be required if scrolling capture synthesizes scroll events — moot while scrolling capture is deferred (§3.5).

### 3.5 Scrolling capture — DEFERRED, not in v1.0 (§2.4)

Kept here as reference design work for whenever this comes back into scope. Do not build against this section until it's explicitly back in the "in scope" list.

The hardest feature on the list. Approach:

1. User selects a region (typically a scrollable pane).
2. Capture frame 1.
3. Synthesize a scroll event over the region — via a native helper using `CGEventCreateScrollWheelEvent`, or by driving `System Events` through AppleScript. **This needs Accessibility permission**, separate from Screen Recording. Request it only when the user first uses scrolling capture, not at launch.
4. Wait for the scroll animation to settle (adaptive: poll captures until two consecutive frames are identical, cap at ~400 ms).
5. Capture frame N.
6. Stitch: find the vertical overlap between frame N-1 and frame N by normalized cross-correlation on a horizontal strip of rows, then append the non-overlapping remainder.
7. Stop when a new frame produces no new content (bottom reached), or at a hard cap (e.g. 50 frames / 30 000 px tall) to prevent runaway on infinite-scroll pages.

Stitching would live in `sharp` (already a dependency for cropping). Write it as a pure function `stitch(frames: Buffer[]): Buffer` with **fixture-based tests** — generate synthetic frames from a tall test image at known offsets and assert the reconstruction matches the original.

Known failure modes to handle gracefully: sticky headers/footers (offer a "trim edges" setting), lazy-loaded content, and horizontal scroll (out of scope — reject with a clear message).

### 3.6 Keeping the native-rewrite door open

Everything that touches macOS goes behind an interface in `src/main/capture/`. If you later replace `screencapture` shell-outs with a Swift helper binary or a native Node addon, only the files inside that folder change. Do not let `child_process` or `screencapture` strings leak into overlay or settings code (or editor code, if/when it returns).

### 3.7 Stack

```
Electron (latest stable)     app shell
TypeScript, strict mode      everything
electron-vite                build/HMR
React + Tailwind             settings window (overlay uses vanilla — see below;
                              editor would use this too, if/when it returns)
sharp                         crop, encode (stitch, if/when scrolling capture returns)
electron-store                settings persistence (with a schema)
electron-updater              auto-update from a static host — the one network call this app makes
electron-builder              packaging, signing, notarization
Vitest + Playwright           unit + E2E
```

**The overlay renderer should be vanilla TS + Canvas, not React.** It must render a selection rectangle at 60 fps while tracking the mouse; React's reconciler is dead weight there and adds startup cost to the most latency-sensitive window in the app.

### 3.8 Repository layout

```
screenshot-app/
├── CLAUDE.md
├── package.json
├── electron.vite.config.ts
├── electron-builder.yml
├── build/
│   ├── entitlements.mac.plist
│   ├── icon.icns
│   └── notarize.cjs
├── src/
│   ├── main/
│   │   ├── index.ts                  app bootstrap, single-instance lock
│   │   ├── tray/
│   │   │   ├── trayManager.ts
│   │   │   └── menuBuilder.ts
│   │   ├── capture/                  ← ONLY place macOS APIs are touched
│   │   │   ├── captureService.ts     orchestrates one capture end-to-end
│   │   │   ├── screencapture.ts      typed wrapper over /usr/sbin/screencapture
│   │   │   └── displayManager.ts     ← ONLY place scaleFactor math lives
│   │   ├── overlay/
│   │   │   ├── overlayManager.ts     window pool, one per display
│   │   │   └── overlayIpc.ts
│   │   ├── shortcuts/
│   │   │   ├── shortcutManager.ts    register/unregister, conflict detection
│   │   │   └── defaults.ts
│   │   ├── output/
│   │   │   ├── clipboard.ts
│   │   │   └── fileWriter.ts         default save location, PNG write
│   │   ├── permissions/
│   │   │   └── screenRecording.ts
│   │   ├── settings/
│   │   │   ├── store.ts              electron-store schema + migrations
│   │   │   └── settingsWindow.ts
│   │   ├── updater/autoUpdater.ts
│   │   └── ipc/channels.ts           single source of truth for channel names
│   ├── preload/
│   │   ├── overlay.preload.ts
│   │   └── settings.preload.ts
│   ├── renderer/
│   │   ├── overlay/                  vanilla TS + Canvas
│   │   ├── settings/                 React
│   │   └── shared/
│   └── shared/types.ts               types crossing the IPC boundary
└── test/
    ├── unit/
    └── fixtures/
```

`scrollingCapture.ts`, `stitcher.ts`, `editor/`, `pin/`, `licensing/`, `output/history.ts`, and `accessibility.ts` (scrolling-capture-only) are deliberately absent — they belong to deferred features (§2.4). The current scaffold still has a few leftover stub files for the editor window from before this scope trim (`src/renderer/editor/*`, `src/preload/editor.preload.ts`, and the corresponding `electron.vite.config.ts` build input); they're inert and can be removed whenever it's convenient, or left until the editor is back in scope.

### 3.9 Security posture

Non-negotiable for every BrowserWindow:

```ts
webPreferences: {
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: true,
  preload: /* explicit path */
}
```

All main↔renderer traffic goes through a narrow, typed preload API. Renderers never receive `fs`, `child_process`, or raw file paths outside the app's own temp directory.

Because "no telemetry" is a marketing claim, it must be literally true: the only outbound request in the entire app is the update-feed check, listed in the privacy policy. No analytics SDK, no crash reporter that phones home without consent, no font CDN, no license/account call — there is no license.

---

## 4. Feature Specification

### 4.1 Menu bar

Icon: monochrome template image, so it adapts to light/dark automatically. Menu:

```
Capture Area              ⌃⇧4
Capture Full Screen       ⌃⇧3
──────────────────
Open Save Folder
──────────────────
Settings…                 ⌘,
Pause Shortcuts
──────────────────
About / Check for Updates
Quit                      ⌘Q
```

Shortcut labels shown here use `⌃⇧` (Control-Shift) defaults, matching §4.6 — do not default to `⌘⇧3/4` (see §4.6 for why).

"Pause Shortcuts" matters more than it looks — users who record demos or play games need a kill switch that isn't Quit.

### 4.2 Region capture flow

1. Hotkey fires → record the currently frontmost app (to restore later).
2. Show overlay on every display simultaneously. Dim to ~35% black.
3. Crosshair cursor; live magnifier loupe near the cursor showing zoomed pixels + coordinates + hex colour under the cursor. (Cheap to build, and it's the feature power users screenshot for their own reviews.)
4. Drag to select. Show live `W × H` badge in device pixels.
5. Modifier keys during drag: `Shift` = constrain to square, `Space` = move the existing selection, `Option` = resize from centre.
6. Arrow keys nudge the selection 1 px; `Shift`+arrow, 10 px.
7. `Esc` cancels. Cancel must be instant and must restore focus.
8. On mouse-up, **the overlay stays visible** and the floating toolbar appears anchored to the selection.

(Window-under-cursor detection / click-to-capture-a-window is deferred, §2.4 — not part of this flow for v1.0.)

### 4.3 Floating toolbar

Appears at mouse-up, anchored below the selection (flip above if it would go offscreen, clamp to display bounds). Buttons:

`Copy` · `Save` · `Redo Selection` · `Cancel`

(`Annotate` and `Pin` are deferred with the editor and pin-window features, §2.4.)

Toolbar disappears the instant an action is chosen. Which action is the default on `Enter` is a setting — for most users it's Copy.

Because the toolbar lives inside the already-open overlay window, it inherits always-on-top for free and needs no separate window.

### 4.4 Output behaviour

Both can be on at once (default: both):

- **Clipboard:** write PNG to `clipboard.writeImage()`.
- **Disk:** write to a fixed default folder (e.g. `~/Pictures/Screenshots`) as `Screenshot {date} at {time}.png`. Configurable save folder and filename templates are a fast-follow, not required for v1.0.

Settings: format (PNG/JPEG), JPEG quality.

### 4.5 Annotation editor — DEFERRED, not in v1.0 (§2.4)

Kept here as reference design work for whenever this comes back into scope.

Tools: select/move, arrow, line, rectangle, ellipse, freehand, text, highlighter, blur, pixelate, counter badge (auto-incrementing 1,2,3…), crop, spotlight/dim-outside.

Requirements, if/when built:

- **Fully non-destructive.** Annotations are objects in a document model, not baked pixels, until export. Every tool supports select, move, resize, restyle, delete, and undo.
- Unbounded undo/redo (`⌘Z` / `⌘⇧Z`).
- Per-tool style memory — if the user sets arrows to red 4 px, the next arrow is red 4 px, forever.
- Blur/pixelate must be **irreversible on export**: rasterize the blurred region into the output. Do not ship an "obfuscation" that leaves the original pixels recoverable in the file. This is a reputational landmine (see CLAUDE.md Hard Rule 6).
- Keyboard shortcut per tool (`A` arrow, `R` rect, `T` text, `B` blur…).
- `⌘C` copies the flattened result, `⌘S` saves, `Esc` closes.

**Possible stretch, if this returns:** run macOS Vision OCR over the image, regex for emails, API-key-shaped strings, credit cards, and IPs, and offer one-click "Redact detected secrets."

### 4.6 Shortcuts

- Defaults must **not** collide with macOS's own `⌘⇧3/4/5`. Ship defaults on `⌃⇧` (Control-Shift) instead, and offer a one-click "Take over the system screenshot shortcuts" that instructs the user how to disable Apple's in System Settings → Keyboard → Shortcuts.
- Every action rebindable via a recorder widget in Settings.
- Detect conflicts: `globalShortcut.register()` returns `false` when another app owns the combo — surface that as an inline error, never fail silently.
- Re-register all shortcuts after wake-from-sleep and after `Pause Shortcuts` toggles off.

### 4.7 Launch at login

`app.setLoginItemSettings({ openAtLogin, openAsHidden: true })`. On by default is acceptable for a menu bar utility, but **ask during onboarding** rather than assuming — and surface it as a toggle in Settings.

### 4.8 History — DEFERRED, not in v1.0 (§2.4)

Kept here as reference design work for whenever this comes back into scope.

Last 100 captures, stored as files in Application Support with a JSON index. Grid view with search by app name and date. Explicit "Clear history" and a "Never store history" privacy setting. History must respect the privacy promise: nothing leaves the disk.

---

## 5. Delivery Plan

Estimates assume one focused developer working with Claude Code.

### Phase 0 — Spikes (2–4 days)

Answer these before writing production code. Each is a throwaway script, kept in `spikes/`.

1. ✅ **Done.** Does `screencapture -R` return native Retina pixels? — confirmed yes (native pixels out, points in). See `spikes/FINDINGS.md`.
2. 🟡 **Partially done.** Do global coordinates from Electron's `screen` API map 1:1 onto `screencapture -R` on a mixed-DPI, negative-origin multi-monitor setup? Single-display origin/edges confirmed correct; the actual negative-origin/mixed-DPI/rotated matrix still needs a second physical display.
3. ✅ **Done.** Can a transparent always-on-top `screen-saver`-level BrowserWindow cover a display *including* over a fullscreen app? — confirmed yes, but only with `fullscreenable: true` (the spec originally said `false` — that was wrong, see §3.3 and `spikes/FINDINGS.md`). Click-through (`setIgnoreMouseEvents`) confirmed independent of this, no conflict.
4. ⏸️ **Skipped for now.** Measure hotkey→overlay-visible latency with a pre-warmed hidden window pool. Target < 80 ms. Revisit once `overlayManager.ts` exists for real — no need to spike this in isolation first.
5. ⏸️ **Skipped for now**, deferred along with scrolling capture (§2.4/§3.5). Can you synthesize a scroll event into another app, and what permission does it actually cost?

**Gate:** if spike 1 or 2 fails, the coordinate model changes and Phase 3 must be redesigned. Do not skip.

### Phase 1 — Skeleton (1 week) — ✅ done

Menu bar tray, `LSUIElement`, dock hidden, single-instance lock, build pipeline producing a runnable `.app`. (Settings store schema, permission check + onboarding screen, and launch-at-login are still open — small enough to fold into Phase 2/5 rather than reopening this phase.)

**Done when:** app launches to the menu bar, survives a restart, and correctly reports permission state.

### Phase 2 — Basic capture (1 week)

`screencapture.ts` wrapper, `displayManager.ts` with full unit tests, full-screen and per-display capture, clipboard write, file write to the default save folder. Permission check + onboarding screen belongs here too.

**Done when:** a hotkey captures the correct display at correct resolution on a 3-monitor mixed-DPI rig.

### Phase 3 — Region selection (1.5–2 weeks)

Overlay window pool, Canvas selection UI, magnifier loupe, modifier keys, multi-display drag, focus restore.

**Done when:** selecting a region that spans the boundary between two displays with different scale factors produces a correct image.

### Phase 4 — Floating toolbar (3–4 days)

Anchored toolbar (Copy / Save / Redo Selection / Cancel), edge flipping, actions wired, disappears on action.

### Phase 5 — Settings & shortcuts (1 week)

Settings window, shortcut recorder, conflict detection, launch-at-login toggle, all preferences wired and persisted.

### Phase 6 — Polish (3–4 days)

Empty states, error states, app icon, onboarding polish.

### Phase 7 — Ship (1 week)

Developer ID signing, hardened runtime, entitlements, notarization + stapling, DMG with drag-to-Applications, `electron-updater` feed on S3/R2, privacy policy, landing page.

**Total: roughly 6–8 weeks** to a credible free v1.0.

### Deferred to post-v1.0 (§2.4) — not scheduled, no phase number

Annotation editor, scrolling capture, screenshot history, pin-to-screen, and any licensing/monetization work. Each has design notes preserved in this spec (§3.5, §4.5, §4.8) for whenever it's explicitly brought back into scope — don't start on these without that explicit decision.

---

## 6. Risk Register

| Risk | Impact | Mitigation |
|---|---|---|
| `screencapture -R` doesn't give native pixels | Rewrites the coordinate model | Phase 0 spike (done — confirmed native pixels, no fallback needed) |
| Electron bundle size hurts reviews | Unfavorable Shottr comparisons | Don't compete on size; prune with `asar` + `files` allowlist; consider Swift helper later |
| Multi-monitor edge cases | Bad reviews from exactly the target user | `displayManager` unit tests; test on a real multi-monitor rig before shipping (spike 2 is still open) |
| Screen Recording permission confusion | Support burden, 1-star "doesn't work" reviews | Dedicated onboarding screen with deep link + restart button |
| Notarization rejection | Launch delay | Notarize from Phase 1, not Phase 7 — find the problems early |
| Solo maintenance load | Burnout | Ruthless v1 scope; the "deferred" and "out of scope" lists in §2.4 are load-bearing |

---

## 7. Success Criteria for v1.0

- Hotkey → overlay visible: **< 80 ms** (p95)
- Capture → clipboard ready: **< 300 ms** for a full 5K display
- Idle memory: **< 200 MB** RSS
- Zero unhandled network requests, verifiable with Little Snitch — this is a claim you should invite reviewers to test
- Correct output on a 3-display mixed-DPI setup including a negative-origin and a rotated display
- Notarized, stapled, opens on a clean Mac with no Gatekeeper warning

---

## Sources

- [CleanShot X — Pricing](https://cleanshot.com/pricing)
- [Shottr — official site](https://shottr.cc/)
- [Xnapper — official site](https://xnapper.com/)
- [Electron — desktopCapturer docs](https://www.electronjs.org/docs/latest/api/desktop-capturer)
- [Electron issue #22364 — desktopCapturer multi-screen detection](https://github.com/electron/electron/issues/22364)
- [Electron issue #36722 — getMediaAccessStatus('screen') doesn't refresh](https://github.com/electron/electron/issues/36722)
- [electron-builder — macOS Notarization](https://www.electron.build/docs/features/code-signing/notarization/)
- [ss64 — macOS screencapture command reference](https://ss64.com/mac/screencapture.html)
- [Apple Developer Forums — screencapture CLI DPI change in Sonoma](https://developer.apple.com/forums/thread/738444)
- [Best Screenshot Apps for Mac 2026 — comparison](https://www.screensnap.pro/guides/best-screenshot-apps-mac-2026)
- [Snagit alternatives for Mac — comparison](https://blog.apps.deals/snagit-alternatives-mac)
