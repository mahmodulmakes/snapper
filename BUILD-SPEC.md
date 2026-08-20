# Mac Screenshot App — Build Spec

**Product:** Menu-bar screenshot tool for macOS, built with Electron
**Model:** Paid, one-time license
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

If your app lacks these, reviewers will call it unfinished:

- Region, window, and full-screen capture with a shortcut
- Multi-monitor support with correct Retina resolution
- Clipboard + auto-save simultaneously
- An annotation editor (arrow, box, text, blur/pixelate, highlight)
- Screenshot history with re-open
- Configurable save location and filename template
- Menu bar presence + launch at login
- **Scrolling capture** — CleanShot, Shottr, and Snagit all have it; it is no longer a differentiator, it is expected

### 1.3 Where competitors are genuinely weak — your openings

1. **Nobody has a clean "buy once, own forever, zero cloud" story.** CleanShot's $29 buys one year of updates then nudges you to $19/yr. Shottr is free but its business model is unclear (solo dev, PWYW), which enterprise buyers dislike. Snagit is $63. There's a real gap at **$19–29, one-time, updates included for the major version, no account required**.

2. **Privacy is unclaimed territory.** Every cloud-first competitor requires an account for its best features. A screenshot tool sees passwords, API keys, customer PII, and internal dashboards. "This app makes zero network requests except a license check and an update check — here's the proof" is a claim CleanShot structurally cannot make. Developers, finance, healthcare, legal, and security-conscious enterprises buy on this.

3. **Multi-monitor is under-served.** Mixed-DPI setups (Retina laptop + 4K external + 1080p vertical) produce wrong-resolution or wrong-monitor captures in most tools. Doing this *correctly* is unglamorous, hard, and noticed by exactly the professionals who pay.

4. **Redaction is treated as an afterthought.** Xnapper's auto-redaction of emails and API keys is its best feature and nobody else copies it well. A blur tool that *finds* sensitive strings for you is a demo-able differentiator.

### 1.4 Where you cannot win — be honest about this

Your stated constraint is Electron. That costs you the two axes Shottr wins on:

- **Bundle size:** Electron ships ~100–150 MB against Shottr's 2.3 MB. You will lose every "lightweight" comparison.
- **Idle memory:** ~120–200 MB against a native app's ~30–50 MB. Menu bar apps run 24/7 and users watch Activity Monitor.
- **Cold capture latency:** if a BrowserWindow has to be created when the hotkey fires, you're at 200–400 ms against Shottr's 17 ms.

Section 3.1 gives the architecture that mitigates all three. But do not market this app as "lightweight" or "fastest" — you will be fact-checked in the first review. Market it on **privacy, price, and multi-monitor correctness**.

If bundle size and memory turn out to matter more than you expect after launch, the migration path is to move capture + overlay into a small Swift helper and keep Electron for the editor and settings. Section 3.6 keeps that door open.

---

## 2. Product Definition

### 2.1 Positioning statement

> A fast, local-only screenshot tool for macOS. Everything stays on your Mac — no account, no cloud, no telemetry. Buy it once.

### 2.2 Target user

Primary: developers, designers, technical writers, and support engineers on multi-monitor Macs who take 20+ screenshots a day and are irritated by subscription creep.

Secondary: privacy-constrained teams (security, legal, finance, health) whose IT will not approve a cloud screenshot tool.

### 2.3 Pricing recommendation

- **$19 launch price**, rising to **$29** after v1.0 settles.
- One-time. Includes all v1.x updates. v2.0 is a paid upgrade at ~50% off for existing users.
- **14-day trial**, full features, no watermark, no account. A watermark trial trains people to hate the product.
- Sell direct via **Paddle or Lemon Squeezy** (they act as merchant of record and handle global VAT/sales tax — do not attempt this yourself).
- Skip the Mac App Store for v1. Sandboxing fights nearly every requirement on your list (global shortcuts, screen capture, floating windows, launch at login). Direct distribution with Developer ID + notarization is the correct call.

### 2.4 Scope decisions

**In scope for v1.0** — your requirement list, plus:

- Annotation editor (arrow, rectangle, ellipse, line, freehand, text, highlight, blur/pixelate, counter/step badges, crop)
- Scrolling capture
- Screenshot history (last 100, local, re-openable)
- Filename templates and configurable save folder
- "Pin to screen" — float a capture above all windows for reference

**Explicitly out of scope for v1.0** (say no to these, ship, then reconsider):

- Screen recording / GIF — doubles your engineering surface and pulls you into codec, audio permission, and file size problems. It's a v2 headline feature, not a v1 tax.
- Cloud upload and shareable links — contradicts your positioning and adds hosting cost, abuse handling, and GDPR obligations.
- Windows or Linux — the whole product thesis is macOS-native feel.
- OCR — tempting because macOS Vision makes it cheap, but it needs a native bridge. Move to v1.1.
- Background/beautification presets — Xnapper owns this. Fight elsewhere.

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

Your capture path is: draw your own selection overlay in Electron → compute the rect → shell out to `screencapture -x -R … out.png` → read the file → hand to clipboard, disk, and editor.

**Retina caveat that will bite you.** Whether `-R` returns logical points or native pixels has varied across macOS releases, and Sonoma changed DPI metadata behaviour in the CLI. Do not assume. **Phase 0 spike:** on a Retina display and a non-Retina display, capture a known 100×100 region and assert the output PNG's pixel dimensions. If `-R` under-samples, fall back to capturing the whole display with `-D` at native resolution and cropping with `sharp` using `rect × scaleFactor`. Decide this before writing any overlay code — it determines your entire coordinate model.

### 3.2 Coordinate systems — the #1 source of multi-monitor bugs

You will be juggling three coordinate spaces:

1. **Electron `screen` API** — logical points, origin top-left of the primary display, other displays can have negative x/y.
2. **`screencapture -R`** — global points, same origin convention (verify in the spike).
3. **Image pixels** — points × `display.scaleFactor`.

**Rule: write one module, `displayManager.ts`, that owns every conversion. No other file is allowed to multiply or divide by `scaleFactor`.** Unit-test it against fixtures for: single Retina, Retina + non-Retina external, display to the left of primary (negative x), display above primary (negative y), and a vertical/rotated display.

### 3.3 Window inventory

| Window | Purpose | Key properties |
|---|---|---|
| **Overlay** (one per display) | Region selection + floating toolbar | `transparent: true`, `frame: false`, `alwaysOnTop` at `screen-saver` level, `visibleOnAllWorkspaces: true`, `skipTaskbar`, `hasShadow: false`, `enableLargerThanScreen: true`, `fullscreenable: false` |
| **Editor** | Annotation | Normal window, created lazily, kept alive after first use |
| **Settings** | Preferences | Normal window, lazy |
| **Pin** (0..n) | Floating pinned screenshots | `alwaysOnTop`, frameless, draggable |

**Latency mitigation:** create the overlay windows at app launch, one per display, and keep them alive but hidden (`hide()`, not `close()`). On hotkey, you only call `show()` + `focus()` — sub-50 ms. Rebuild the pool on `screen.on('display-added' | 'display-removed' | 'display-metrics-changed')`.

**Critical:** the app must never appear in the Dock or the app switcher. Call `app.dock.hide()` and set `LSUIElement: true` in Info.plist. When the overlay takes focus, restore focus to the previously frontmost app afterward — otherwise you break the user's flow every single capture.

### 3.4 Permissions

Screen capture requires user consent on macOS 10.15+.

- Check with `systemPreferences.getMediaAccessStatus('screen')` on launch.
- Known bug: the status **does not refresh within a running process** after the user flips the toggle in System Settings. Design for this — after sending the user to System Settings, show a "Restart app" button rather than polling for a change that will never arrive.
- Add `NSScreenCaptureUsageDescription` to Info.plist via electron-builder's `extendInfo`.
- Build a proper onboarding screen: explain *why* you need the permission, deep-link to `x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture`, then offer restart.
- Accessibility permission is additionally required if scrolling capture synthesizes scroll events (see 3.5).

### 3.5 Scrolling capture

The hardest feature on the list. Approach:

1. User selects a region (typically a scrollable pane).
2. Capture frame 1.
3. Synthesize a scroll event over the region — via a native helper using `CGEventCreateScrollWheelEvent`, or by driving `System Events` through AppleScript. **This needs Accessibility permission**, separate from Screen Recording. Request it only when the user first uses scrolling capture, not at launch.
4. Wait for the scroll animation to settle (adaptive: poll captures until two consecutive frames are identical, cap at ~400 ms).
5. Capture frame N.
6. Stitch: find the vertical overlap between frame N-1 and frame N by normalized cross-correlation on a horizontal strip of rows, then append the non-overlapping remainder.
7. Stop when a new frame produces no new content (bottom reached), or at a hard cap (e.g. 50 frames / 30 000 px tall) to prevent runaway on infinite-scroll pages.

Stitching lives in `sharp` (fast, native, already a dependency for cropping). Write it as a pure function `stitch(frames: Buffer[]): Buffer` with **fixture-based tests** — generate synthetic frames from a tall test image at known offsets and assert the reconstruction matches the original. You cannot debug this feature by hand.

Known failure modes to handle gracefully: sticky headers/footers (offer a "trim edges" setting), lazy-loaded content, and horizontal scroll (out of scope — reject with a clear message).

### 3.6 Keeping the native-rewrite door open

Everything that touches macOS goes behind an interface in `src/main/capture/`. If you later replace `screencapture` shell-outs with a Swift helper binary or a native Node addon, only the files inside that folder change. Do not let `child_process` or `screencapture` strings leak into overlay, editor, or settings code.

### 3.7 Stack

```
Electron (latest stable)     app shell
TypeScript, strict mode      everything
electron-vite                build/HMR
React + Tailwind             editor, settings (overlay uses vanilla — see below)
sharp                        crop, stitch, encode
electron-store               settings persistence (with a schema)
electron-updater             auto-update from a static host
electron-builder             packaging, signing, notarization
Vitest + Playwright          unit + E2E
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
│   │   │   ├── displayManager.ts     ← ONLY place scaleFactor math lives
│   │   │   ├── scrollingCapture.ts   scroll driver + frame loop
│   │   │   └── stitcher.ts           pure image stitching
│   │   ├── overlay/
│   │   │   ├── overlayManager.ts     window pool, one per display
│   │   │   └── overlayIpc.ts
│   │   ├── editor/editorWindow.ts
│   │   ├── pin/pinWindow.ts
│   │   ├── shortcuts/
│   │   │   ├── shortcutManager.ts    register/unregister, conflict detection
│   │   │   └── defaults.ts
│   │   ├── output/
│   │   │   ├── clipboard.ts
│   │   │   ├── fileWriter.ts         filename templates, save dir
│   │   │   └── history.ts
│   │   ├── permissions/
│   │   │   ├── screenRecording.ts
│   │   │   └── accessibility.ts
│   │   ├── settings/
│   │   │   ├── store.ts              electron-store schema + migrations
│   │   │   └── settingsWindow.ts
│   │   ├── licensing/
│   │   │   ├── licenseManager.ts     Ed25519 signature verification
│   │   │   └── trial.ts
│   │   ├── updater/autoUpdater.ts
│   │   └── ipc/channels.ts           single source of truth for channel names
│   ├── preload/
│   │   ├── overlay.preload.ts
│   │   ├── editor.preload.ts
│   │   └── settings.preload.ts
│   ├── renderer/
│   │   ├── overlay/                  vanilla TS + Canvas
│   │   ├── editor/                   React
│   │   ├── settings/                 React
│   │   └── shared/
│   └── shared/types.ts               types crossing the IPC boundary
└── test/
    ├── unit/
    └── fixtures/
```

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

Because "no telemetry" is a marketing claim, it must be literally true: the only outbound requests in the entire app are the license activation call and the update-feed check, both listed in the privacy policy. No analytics SDK, no crash reporter that phones home without consent, no font CDN.

---

## 4. Feature Specification

### 4.1 Menu bar

Icon: monochrome template image, so it adapts to light/dark automatically. Menu:

```
Capture Area              ⌘⇧4
Capture Full Screen       ⌘⇧3
Capture Window            ⌘⇧5
Scrolling Capture         ⌘⇧6
──────────────────
Recent  ▸  (last 10 thumbnails → click to open in editor)
Open Save Folder
──────────────────
Settings…                 ⌘,
Pause Shortcuts
──────────────────
About / Check for Updates
Quit                      ⌘Q
```

"Pause Shortcuts" matters more than it looks — users who record demos or play games need a kill switch that isn't Quit.

### 4.2 Region capture flow

1. Hotkey fires → record the currently frontmost app (to restore later).
2. Show overlay on every display simultaneously. Dim to ~35% black.
3. Crosshair cursor; live magnifier loupe near the cursor showing zoomed pixels + coordinates + hex colour under the cursor. (Cheap to build, and it's the feature power users screenshot for their own reviews.)
4. Drag to select. Show live `W × H` badge in device pixels.
5. Modifier keys during drag: `Shift` = constrain to square, `Space` = move the existing selection, `Option` = resize from centre.
6. Hovering without dragging highlights the window under the cursor; a single click captures that window.
7. Arrow keys nudge the selection 1 px; `Shift`+arrow, 10 px.
8. `Esc` cancels. Cancel must be instant and must restore focus.
9. On mouse-up, **the overlay stays visible** and the floating toolbar appears anchored to the selection.

### 4.3 Floating toolbar

Appears at mouse-up, anchored below the selection (flip above if it would go offscreen, clamp to display bounds). Buttons:

`Annotate` · `Copy` · `Save` · `Pin` · `Redo Selection` · `Cancel`

Toolbar disappears the instant an action is chosen. Which action is the default on `Enter` is a setting — for most users it's Copy.

Because the toolbar lives inside the already-open overlay window, it inherits always-on-top for free and needs no separate window.

### 4.4 Output behaviour

Both can be on at once (default: both):

- **Clipboard:** write PNG to `clipboard.writeImage()`.
- **Disk:** write to configured folder. Filename template with tokens: `{app}`, `{title}`, `{date}`, `{time}`, `{counter}`, `{width}`, `{height}`. Default: `Screenshot {date} at {time}.png`. Sanitize aggressively — window titles contain `/` and emoji.

Settings: format (PNG/JPEG/WebP), JPEG quality, whether to copy the *file path* instead of the image, and a "save silently vs. show editor first" toggle.

### 4.5 Annotation editor

Tools: select/move, arrow, line, rectangle, ellipse, freehand, text, highlighter, blur, pixelate, counter badge (auto-incrementing 1,2,3…), crop, spotlight/dim-outside.

Requirements:

- **Fully non-destructive.** Annotations are objects in a document model, not baked pixels, until export. Every tool supports select, move, resize, restyle, delete, and undo.
- Unbounded undo/redo (`⌘Z` / `⌘⇧Z`).
- Per-tool style memory — if the user sets arrows to red 4 px, the next arrow is red 4 px, forever.
- Blur/pixelate must be **irreversible on export**: rasterize the blurred region into the output. Do not ship an "obfuscation" that leaves the original pixels recoverable in the file. This is a reputational landmine.
- Keyboard shortcut per tool (`A` arrow, `R` rect, `T` text, `B` blur…).
- `⌘C` copies the flattened result, `⌘S` saves, `Esc` closes.

**Stretch (v1.1, strong differentiator):** run macOS Vision OCR over the image, regex for emails, API-key-shaped strings, credit cards, and IPs, and offer one-click "Redact detected secrets."

### 4.6 Shortcuts

- Defaults must **not** collide with macOS's own `⌘⇧3/4/5`. Ship defaults on `⌃⇧` (Control-Shift) instead, and offer a one-click "Take over the system screenshot shortcuts" that instructs the user how to disable Apple's in System Settings → Keyboard → Shortcuts.
- Every action rebindable via a recorder widget in Settings.
- Detect conflicts: `globalShortcut.register()` returns `false` when another app owns the combo — surface that as an inline error, never fail silently.
- Re-register all shortcuts after wake-from-sleep and after `Pause Shortcuts` toggles off.

### 4.7 Launch at login

`app.setLoginItemSettings({ openAtLogin, openAsHidden: true })`. On by default is acceptable for a menu bar utility, but **ask during onboarding** rather than assuming — and surface it as a toggle in Settings.

### 4.8 History

Last 100 captures, stored as files in Application Support with a JSON index. Grid view with search by app name and date. Explicit "Clear history" and a "Never store history" privacy setting. History must respect the privacy promise: nothing leaves the disk.

---

## 5. Delivery Plan

Estimates assume one focused developer working with Claude Code.

### Phase 0 — Spikes (3–5 days)

Answer these before writing production code. Each is a throwaway script.

1. Does `screencapture -R` return native Retina pixels? Test on Retina and non-Retina.
2. Do global coordinates from Electron's `screen` API map 1:1 onto `screencapture -R` on a mixed-DPI, negative-origin multi-monitor setup?
3. Can a transparent always-on-top `screen-saver`-level BrowserWindow cover a display *including* over a fullscreen app?
4. Measure hotkey→overlay-visible latency with a pre-warmed hidden window pool. Target < 80 ms.
5. Can you synthesize a scroll event into another app, and what permission does it actually cost?

**Gate:** if spike 1 or 2 fails, the coordinate model changes and Phase 3 must be redesigned. Do not skip.

### Phase 1 — Skeleton (1 week)

Menu bar tray, `LSUIElement`, dock hidden, single-instance lock, settings store with schema, permission check + onboarding screen, launch-at-login, build pipeline producing a runnable `.app`.

**Done when:** app launches to the menu bar, survives a restart, and correctly reports permission state.

### Phase 2 — Basic capture (1 week)

`screencapture.ts` wrapper, `displayManager.ts` with full unit tests, full-screen and per-display capture, clipboard write, file write with templates.

**Done when:** a hotkey captures the correct display at correct resolution on a 3-monitor mixed-DPI rig.

### Phase 3 — Region selection (1.5–2 weeks)

Overlay window pool, Canvas selection UI, magnifier loupe, modifier keys, window-under-cursor detection, multi-display drag, focus restore.

**Done when:** selecting a region that spans the boundary between two displays with different scale factors produces a correct image.

### Phase 4 — Floating toolbar (3–4 days)

Anchored toolbar, edge flipping, actions wired, disappears on action.

### Phase 5 — Annotation editor (2–3 weeks)

The largest single chunk. Document model first, then tools one at a time, then undo/redo, then export flattening.

**Done when:** blur is provably irreversible in the exported file.

### Phase 6 — Settings & shortcuts (1 week)

Settings window, shortcut recorder, conflict detection, all preferences wired and persisted.

### Phase 7 — Scrolling capture (1.5–2 weeks)

Stitcher with fixture tests first, then the scroll driver, then the UI. Test against: Safari, Chrome, Slack, Notes, VS Code, a Finder list view, and a Notion page.

### Phase 8 — History & polish (1 week)

History store + grid, pin windows, empty states, error states, app icon, onboarding polish.

### Phase 9 — Licensing (4–5 days)

Trial countdown, license entry, **Ed25519-signed license keys verified offline** (public key embedded in app; no server round-trip needed after activation), Paddle/Lemon Squeezy webhook → key issuance.

Accept that a determined user can crack any client-side check. Optimize for *not annoying honest customers*, not for perfect enforcement.

### Phase 10 — Ship (1 week)

Developer ID signing, hardened runtime, entitlements, notarization + stapling, DMG with drag-to-Applications, `electron-updater` feed on S3/R2, privacy policy, landing page.

**Total: roughly 11–14 weeks** to a credible paid v1.0.

### Suggested cut for an earlier revenue signal

Ship **Phases 0–4 + 6 + 9 + 10** as v0.9 beta (~7 weeks) — capture, toolbar, settings, licensing, distribution, no editor and no scrolling capture. Sell it at $9 as an "early access, price locked forever" deal. That validates demand before you spend 5 weeks on the editor and stitcher.

---

## 6. Risk Register

| Risk | Impact | Mitigation |
|---|---|---|
| `screencapture -R` doesn't give native pixels | Rewrites the coordinate model | Phase 0 spike; crop-from-full-display fallback ready |
| Electron bundle size hurts reviews | Lost sales to Shottr comparisons | Don't compete on size; prune with `asar` + `files` allowlist; consider Swift helper in v2 |
| Multi-monitor edge cases | Bad reviews from exactly your target user | `displayManager` unit tests; beta test on borrowed rigs |
| Scrolling capture unreliable on some apps | Refund requests | Ship a documented compatibility list; fail loudly with a clear message rather than producing a mangled image |
| Screen Recording permission confusion | Support burden, 1-star "doesn't work" reviews | Dedicated onboarding screen with deep link + restart button |
| Apple ships scrolling capture in a macOS update | Feature parity loss | Positioning is privacy + price, not any single feature |
| Notarization rejection | Launch delay | Notarize from Phase 1, not Phase 10 — find the problems early |
| Solo maintenance load | Burnout | Ruthless v1 scope; the "out of scope" list in 2.4 is load-bearing |

---

## 7. Success Criteria for v1.0

- Hotkey → overlay visible: **< 80 ms** (p95)
- Capture → clipboard ready: **< 300 ms** for a full 5K display
- Idle memory: **< 200 MB** RSS
- Zero unhandled network requests, verifiable with Little Snitch — this is a claim you should invite reviewers to test
- Correct output on a 3-display mixed-DPI setup including a negative-origin and a rotated display
- Scrolling capture succeeds on Safari, Chrome, and Slack
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
