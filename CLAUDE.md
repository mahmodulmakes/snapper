# CLAUDE.md

Instructions for Claude Code working in this repository.

---

## What this project is

A macOS menu-bar screenshot app built with Electron + TypeScript. **v1.0 is free** — no purchase, no license, no account.

**Positioning: local-only, no account, no cloud, no telemetry.** This is the product's entire reason to exist against CleanShot X and Shottr. It constrains what you are allowed to build — see "Hard rules" below.

Full product spec lives in `BUILD-SPEC.md`. Read it before starting a new phase. If this file and the spec disagree, this file wins for *how to write code*; the spec wins for *what to build*.

---

## Hard rules — never violate these

1. **No network requests except one.** The update-feed check (electron-updater). No analytics, no crash reporting that phones home, no font/CDN fetches, no "just for debugging" pings, no license/account calls — there is no license, the app is free. If a dependency makes a network call at runtime, it does not go in this project. If you think you need a second network call, stop and ask.

2. **All macOS system access lives in `src/main/capture/`.** `child_process`, `screencapture`, AppleScript, and any native bridging appear nowhere else in the codebase. This keeps a future Swift-helper rewrite contained.

3. **All `scaleFactor` math lives in `src/main/capture/displayManager.ts`.** No other file multiplies or divides by a scale factor, ever. This is the single largest source of multi-monitor bugs. If you find yourself writing `* scaleFactor` outside that file, you are writing a bug.

4. **Every BrowserWindow uses `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, and an explicit preload.** No exceptions, including for "temporary" debug windows.

5. **Never expose `fs`, `child_process`, `shell`, or arbitrary paths to a renderer.** Renderers get a narrow, typed API surface through preload and nothing else.

6. **Blur and pixelate must be destructive on export.** The exported file must not contain recoverable original pixels under a redaction. This is a security promise, not a visual effect. (Applies once the annotation editor ships — it's deferred, out of v1.0 scope. Don't let this rule lapse when it comes back.)

7. **Never write files outside the user's configured save folder, the app's Application Support directory, or the app's temp directory.**

8. **The app never appears in the Dock or app switcher.** `LSUIElement: true` and `app.dock.hide()`.

9. **Ask before adding a dependency.** Bundle size is already a competitive weakness. Prefer writing 40 lines over adding a package.

---

## Architecture you must follow

```
src/
├── main/        Node context. Owns capture, windows, shortcuts, files.
├── preload/     One preload per window type. Typed, minimal, explicit.
├── renderer/    Browser context. UI only. Zero Node access.
└── shared/      Types that cross the IPC boundary. No runtime logic.
```

**Directory ownership** — when a task touches these concerns, work in these files and not elsewhere:

| Concern | Owner |
|---|---|
| Running `screencapture` | `main/capture/screencapture.ts` |
| Display enumeration, coordinate/scale conversion | `main/capture/displayManager.ts` |
| Orchestrating one capture end-to-end | `main/capture/captureService.ts` |
| Overlay window pool | `main/overlay/overlayManager.ts` |
| Global shortcut registration | `main/shortcuts/shortcutManager.ts` |
| Persisted settings | `main/settings/store.ts` |
| IPC channel names | `main/ipc/channels.ts` |
| Rasterizing drawn shapes onto the captured PNG | `main/output/annotationOverlay.ts` |

Scrolling capture (`scrollingCapture.ts`, `stitcher.ts`), the **full** non-destructive annotation editor (per-shape move/resize, layers, crop, blur/pixelate, text), history, and pin windows are **deferred, not in v1.0 scope** — see BUILD-SPEC.md §2.4/§4.5. A **minimal** inline annotation track (arrows/boxes/ovals/lines, color picker, bake-on-export) is in scope per §2.4.2/§4.5a — drawn directly on the region-capture overlay (`renderer/overlay/annotationShapes.ts`, `annotationToolbar.ts`), not a separate window. `main/editor/` and `src/renderer/editor/` are unused Phase-1 scaffold again — don't build further ownership around the deferred items above until they're explicitly back in scope.

**IPC discipline:** every channel name is a constant in `main/ipc/channels.ts`. No string literals for channels anywhere else. Every payload type is declared in `shared/types.ts`.

**Overlay renderer is vanilla TypeScript + Canvas. Do not put React in it.** It must hit 60 fps and start in single-digit milliseconds. React is for the settings window only (v1.0 has no editor window) — inline annotation (BUILD-SPEC.md §2.4.2) lives in the vanilla-TS overlay renderer alongside everything else there, not in React.

---

## Coordinate systems — read this before touching capture or overlay code

Three spaces are in play:

1. **Electron points** — `screen.getAllDisplays()`, origin at primary display top-left, other displays may have negative x/y.
2. **screencapture points** — what `-R x,y,w,h` expects.
3. **Image pixels** — points × `scaleFactor`.

Name every variable with its space: `rectInPoints`, `rectInPixels`, `displayIdCG`. Never a bare `rect`, `x`, or `width` crossing a function boundary.

When implementing anything here, add a unit test case to `test/unit/displayManager.test.ts` covering: single Retina; Retina primary + 1× external to the right; external to the *left* (negative x); external *above* (negative y); rotated 90° display; and a selection spanning two displays of different scale factors.

---

## Conventions

- TypeScript `strict: true`. No `any` — use `unknown` and narrow. No non-null `!` assertions; handle the null.
- Async/await, never raw `.then()` chains.
- Errors: every `screencapture` invocation, file write, and permission check returns a typed result or throws a typed error. **Never swallow an error into a silent no-op** — a screenshot tool that quietly does nothing is worse than one that shows an error.
- Every user-facing failure produces a native notification or an inline message. Nothing fails silently.
- No `console.log` in committed code. Use the app logger.
- Files stay under ~300 lines. Split by responsibility when they grow.
- Comments explain *why*, not *what*. macOS quirks and workarounds get a comment with a link to the issue or Apple forum thread.

---

## Testing

- **`displayManager.ts` requires unit tests. Non-negotiable.** It's pure-ish, impossible to debug by hand, and where the expensive multi-monitor bugs live.
- If/when scrolling capture returns to scope, `stitcher.ts` gets the same treatment: fixture-based tests that slice a tall known image into overlapping frames at known offsets, stitch, and assert the result matches the original within tolerance.
- Run `npm test` before declaring any task done.
- UI work needs a manual verification note in your summary: what you clicked, on what display setup, what you observed.

---

## Build & run

```bash
npm run dev          # electron-vite dev with HMR
npm run build        # typecheck + bundle
npm run typecheck    # tsc --noEmit
npm run lint
npm test             # vitest
npm run dist         # signed, notarized .dmg (needs Apple creds in env)
```

**Dev-mode permission gotcha:** in development the binary that requests Screen Recording is Electron itself, not the final app. Permission granted in dev does not carry over to the packaged app, and vice versa. When debugging a permission issue, always confirm which binary System Settings is actually listing before concluding the code is wrong.

---

## Working style for this repo

- **Follow the phase order in `BUILD-SPEC.md` §5.** Do not start Phase 3 work while Phase 2 has failing tests.
- **Phase 0 spikes gate everything.** If a spike result contradicts an assumption in the spec, say so and stop — do not silently code around it.
- Prefer the smallest change that satisfies the task. This is a product that must be maintained by one person.
- When a macOS API behaves unexpectedly, **verify against Apple's docs or a linked issue before working around it**. Half the "Electron bugs" in this domain are actually correct-but-surprising macOS behaviour, and a workaround built on a wrong diagnosis becomes permanent.
- If a requested feature would break a Hard Rule (especially the network rule), say so and propose an alternative instead of implementing it.

---

## Things that look like good ideas and are not

- **Using `desktopCapturer` for still screenshots.** It's a video-streaming API. Thumbnail-size traps, slow enumeration, multi-monitor bugs. Use `screencapture`.
- **Creating overlay windows on hotkey press.** Too slow. Pre-warm one hidden window per display at launch; rebuild the pool on display change events.
- **Polling `getMediaAccessStatus('screen')` after sending the user to System Settings.** It does not refresh inside a running process. Offer a restart instead.
- **Defaulting shortcuts to `⌘⇧3/4/5`.** Those belong to macOS. Ship on `⌃⇧` and offer a guided takeover.
- **Baking annotations into pixels as the user draws** (applies once the annotation editor is back in scope — see BUILD-SPEC.md §2.4). The editor document model is non-destructive until export. Everything must stay editable and undoable.
- **Adding a "quick cloud upload" convenience feature.** It kills the product's only real differentiator. Out of scope, permanently, for v1.

---

## When you are unsure

Ask. Specifically ask — with the tradeoff spelled out — rather than picking a direction and building on it for an hour. The expensive mistakes in this project are architectural (coordinate model, capture backend, editor document model), and they are cheap to discuss and costly to unwind.
