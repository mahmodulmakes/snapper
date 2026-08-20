// Phase 0 spike 3 — BUILD-SPEC.md §5, spike 3 / §3.3. THROWAWAY, not app code.
//
// Question: can a transparent, always-on-top overlay window render above a
// normal windowed app AND above an app in native fullscreen (its own macOS
// Space)? If the default alwaysOnTop isn't enough for the fullscreen case,
// what extra setting is required?
//
// Method: show a full-display transparent window with an opaque magenta
// marker square in the center, screencapture the whole display with the
// external `screencapture` binary (not Electron's own rendering — this
// proves the *composited* result, not just what Electron thinks it did),
// then sample the center pixel of the resulting PNG. Magenta = marker won on
// z-order. Anything else = the window underneath (or the desktop) won.
//
// Run in two phases across two invocations, because the fullscreen phase
// needs a human to actually put an app into native fullscreen first:
//
//   ./node_modules/.bin/electron spikes/overlay-fullscreen-spike.js windowed
//   ./node_modules/.bin/electron spikes/overlay-fullscreen-spike.js fullscreen
//
// `windowed` opens TextEdit as a normal background window and tests Config A.
// `fullscreen` assumes YOU have already put some app into native fullscreen
// (green button, or the app's View > Enter Full Screen), then tests Config A
// (expected to fail) and Config B (expected to pass) against it, plus a
// click-through sanity check.
//
// Results accumulate in <tmpdir>/overlay-fullscreen-spike/results.json across
// both invocations.

import { app, screen, BrowserWindow } from 'electron'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT_DIR = join(tmpdir(), 'overlay-fullscreen-spike')
const RESULTS_FILE = join(OUT_DIR, 'results.json')
const MARKER_RGB = { r: 255, g: 0, b: 255 }

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function countdown(seconds, message) {
  for (let s = seconds; s > 0; s--) {
    console.log(`  ${message} — capturing in ${s}s`)
    await sleep(1000)
  }
}

function screencapture(args) {
  execFileSync('/usr/sbin/screencapture', args, { stdio: 'pipe' })
}

async function sampleCenterPixel(pngPath) {
  const { data, info } = await sharp(pngPath).raw().toBuffer({ resolveWithObject: true })
  const cx = Math.floor(info.width / 2)
  const cy = Math.floor(info.height / 2)
  const idx = (cy * info.width + cx) * info.channels
  return { r: data[idx], g: data[idx + 1], b: data[idx + 2] }
}

function isMarkerColor({ r, g, b }, tolerance = 40) {
  return (
    Math.abs(r - MARKER_RGB.r) <= tolerance &&
    Math.abs(g - MARKER_RGB.g) <= tolerance &&
    Math.abs(b - MARKER_RGB.b) <= tolerance
  )
}

function loadResults() {
  if (!existsSync(RESULTS_FILE)) return {}
  try {
    return JSON.parse(readFileSync(RESULTS_FILE, 'utf8'))
  } catch {
    return {}
  }
}

function saveResult(key, result) {
  const all = loadResults()
  all[key] = result
  mkdirSync(OUT_DIR, { recursive: true })
  writeFileSync(RESULTS_FILE, JSON.stringify(all, null, 2))
}

async function captureAndSample(fileName, expectVisible, roundLabel) {
  const outfile = join(OUT_DIR, fileName)
  screencapture(['-x', '-D', '1', '-t', 'png', outfile])
  const rgb = await sampleCenterPixel(outfile)
  const visible = isMarkerColor(rgb)
  const hypothesisMatched = visible === expectVisible
  console.log(
    `${roundLabel}: center pixel rgb(${rgb.r},${rgb.g},${rgb.b}) => marker ${
      visible ? 'VISIBLE' : 'NOT VISIBLE'
    } (expected ${expectVisible ? 'VISIBLE' : 'NOT VISIBLE'}) — ${
      hypothesisMatched ? 'MATCHES HYPOTHESIS' : 'CONTRADICTS HYPOTHESIS'
    }`
  )
  const result = { outfile, rgb, visible, expectVisible, hypothesisMatched }
  saveResult(roundLabel, result)
  return result
}

function createOverlayWindow(display, { fullscreenable = false } = {}) {
  const win = new BrowserWindow({
    x: display.bounds.x,
    y: display.bounds.y,
    width: display.bounds.width,
    height: display.bounds.height,
    transparent: true,
    frame: false,
    hasShadow: false,
    resizable: false,
    movable: false,
    skipTaskbar: true,
    fullscreenable,
    enableLargerThanScreen: true,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: join(__dirname, 'overlay-preload.cjs')
    }
  })
  return win
}

function applyConfig(win, config) {
  // Base per BUILD-SPEC.md §3.3: "alwaysOnTop at screen-saver level".
  win.setAlwaysOnTop(true, 'screen-saver')
  if (config === 'A') {
    // "Default" reading of the spec table: on-all-workspaces, no extra option.
    win.setVisibleOnAllWorkspaces(true)
  } else if (config === 'B') {
    // Extra option required to cross into a native-fullscreen app's own Space.
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  }
}

async function setLabel(win, text) {
  await win.webContents.executeJavaScript(
    `document.getElementById('label').textContent = ${JSON.stringify(text)}`
  )
}

async function runWindowedPhase() {
  console.log('=== Phase: windowed ===')
  console.log('Opening TextEdit with a fresh blank document (avoids the Open-file picker sheet)...')
  try {
    execFileSync('osascript', [
      '-e',
      'tell application "TextEdit" to activate',
      '-e',
      'tell application "TextEdit" to make new document'
    ])
  } catch (err) {
    console.log(`  (non-fatal) could not open TextEdit: ${String(err)}`)
  }
  await sleep(1500)

  const display = screen.getPrimaryDisplay()
  const win = createOverlayWindow(display)
  await win.loadFile(join(__dirname, 'overlay-marker.html'))
  applyConfig(win, 'A')
  await setLabel(win, 'Round 1: Config A (screen-saver + visibleOnAllWorkspaces) vs normal windowed app')
  win.showInactive()

  await countdown(3, 'Round 1: normal windowed app underneath')
  await captureAndSample('round1-windowed-configA.png', true, 'round1_windowed_configA')

  win.close()
  console.log('\nPhase "windowed" done. Next: put an app into native fullscreen, then run:')
  console.log('  ./node_modules/.bin/electron spikes/overlay-fullscreen-spike.js fullscreen')
}

function activateApp(appName) {
  // Whichever app the human currently has focused owns the active Space. If
  // that's this Electron/terminal process rather than the fullscreen app,
  // screencapture -D captures the WRONG Space (the normal desktop, not the
  // fullscreen one) — that's exactly what happened on the first attempt here.
  // Explicitly activating the fullscreen app switches macOS to its Space
  // first, matching what a real hotkey-triggered capture would see if fired
  // while that app is what the user is actually looking at.
  execFileSync('osascript', ['-e', `tell application "${appName}" to activate`])
}

async function runFullscreenPhase(appName) {
  console.log('=== Phase: fullscreen ===')
  console.log(`Assuming "${appName}" is ALREADY in native fullscreen (its own Space) right now.\n`)

  const display = screen.getPrimaryDisplay()
  const win = createOverlayWindow(display)
  await win.loadFile(join(__dirname, 'overlay-marker.html'))

  applyConfig(win, 'A')
  await setLabel(win, 'Round 2: Config A vs NATIVE FULLSCREEN (expect marker NOT visible)')
  win.showInactive()
  activateApp(appName)
  await sleep(500)
  await countdown(3, 'Round 2: Config A over native fullscreen (expect FAIL)')
  await captureAndSample('round2-fullscreen-configA.png', false, 'round2_fullscreen_configA')

  applyConfig(win, 'B')
  await setLabel(win, 'Round 3: Config B (+ visibleOnFullScreen) vs NATIVE FULLSCREEN (expect marker visible)')
  activateApp(appName)
  await sleep(500)
  await countdown(3, 'Round 3: Config B over native fullscreen (expect PASS)')
  await captureAndSample('round3-fullscreen-configB.png', true, 'round3_fullscreen_configB')

  win.setIgnoreMouseEvents(true, { forward: true })
  await setLabel(win, 'Round 4: Config B + click-through enabled (expect marker still visible)')
  activateApp(appName)
  await sleep(500)
  await countdown(2, 'Round 4: click-through sanity check')
  await captureAndSample('round4-fullscreen-configB-clickthrough.png', true, 'round4_fullscreen_configB_clickthrough')
  win.setIgnoreMouseEvents(false)

  // Round 3 contradicted the hypothesis: Config B (visibleOnFullScreen) still
  // didn't show over native fullscreen. Isolate whether `fullscreenable: false`
  // (also in BUILD-SPEC.md's window table) is what's blocking it. Toggling it
  // post-construction didn't help (round 5) — try a genuinely fresh window
  // built with fullscreenable:true from the constructor (round 6).
  console.log('  debug: isFullScreenable() =', win.isFullScreenable())
  win.setFullScreenable(true)
  applyConfig(win, 'B')
  await setLabel(win, 'Round 5: Config B + setFullScreenable(true) post-construction (isolating the conflict)')
  activateApp(appName)
  await sleep(500)
  await countdown(3, 'Round 5: Config B with fullscreenable toggled true')
  await captureAndSample('round5-fullscreen-configB-fullscreenable.png', true, 'round5_fullscreen_configB_fullscreenable')
  win.close()

  const win2 = createOverlayWindow(display, { fullscreenable: true })
  await win2.loadFile(join(__dirname, 'overlay-marker.html'))
  applyConfig(win2, 'B')
  await setLabel(win2, 'Round 6: fresh window, fullscreenable:true from construction + Config B')
  win2.showInactive()
  activateApp(appName)
  await sleep(500)
  await countdown(3, 'Round 6: fresh fullscreenable:true window')
  await captureAndSample('round6-fullscreen-fresh-fullscreenable.png', true, 'round6_fullscreen_fresh_fullscreenable')

  // Redo the click-through check against the WORKING config — round 4 tested
  // it on the fullscreenable:false window, where the marker was already
  // invisible before the toggle, so it never actually proved anything.
  win2.setIgnoreMouseEvents(true, { forward: true })
  await setLabel(win2, 'Round 7: working config + click-through enabled (expect marker still visible)')
  activateApp(appName)
  await sleep(500)
  await countdown(2, 'Round 7: click-through sanity check on working config')
  await captureAndSample('round7-fullscreen-working-clickthrough.png', true, 'round7_fullscreen_working_clickthrough')
  win2.setIgnoreMouseEvents(false)

  win2.close()
  console.log('\nPhase "fullscreen" done. Inspect', RESULTS_FILE)
}

async function main() {
  await app.whenReady()
  mkdirSync(OUT_DIR, { recursive: true })

  const phase = process.argv[2]
  const appName = process.argv[3] || 'Safari'
  if (phase === 'windowed') {
    await runWindowedPhase()
  } else if (phase === 'fullscreen') {
    await runFullscreenPhase(appName)
  } else {
    console.error('Usage: electron spikes/overlay-fullscreen-spike.js <windowed|fullscreen>')
    app.exit(1)
    return
  }

  app.quit()
}

main().catch((err) => {
  console.error(err)
  app.exit(1)
})
