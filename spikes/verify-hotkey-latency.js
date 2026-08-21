// Phase 0 spike 4 — throwaway, not app code.
//
// Question: is hotkey-fire -> overlay-visible under the 80ms target?
// `globalShortcut`'s own OS-to-callback latency isn't something the app
// controls or can instrument from inside itself, so this measures the part
// the app IS responsible for: from the shortcut handler's entry point
// (equivalent to captureArea() in main/index.ts, minus the cheap synchronous
// permission check) through every overlay window's show()+focus() call
// completing AND a subsequent renderer frame actually running — i.e. the
// renderer is not just told to show, it has resumed doing work.
//
// Run from out/main/ (relative renderer/preload path resolution needs it
// there, same as the other verify-*.js spikes).

import { app, screen } from 'electron'
import { writeFileSync } from 'node:fs'
import { initOverlayWindows, showOverlays, hideOverlays } from '../src/main/overlay/overlayManager.ts'
import { BrowserWindow } from 'electron'

function log(msg) {
  console.log(`[verify-latency] ${msg}`)
}

async function measureOnce(runIndex) {
  const t0 = performance.now()
  await showOverlays()
  const tShowReturned = performance.now()

  // showOverlays() resolving only proves show()/focus() were CALLED, not
  // that the renderer has painted a frame since. Round-trip a real
  // requestAnimationFrame in every window's renderer to prove it's actually
  // resumed doing work post-show, not just told to.
  const windows = BrowserWindow.getAllWindows()
  await Promise.all(
    windows.map((win) => win.webContents.executeJavaScript('new Promise((r) => requestAnimationFrame(() => r(true)))'))
  )
  const tFramePainted = performance.now()

  hideOverlays()

  return {
    run: runIndex,
    windowCount: windows.length,
    showCallMs: tShowReturned - t0,
    totalToFramePaintedMs: tFramePainted - t0
  }
}

async function main() {
  await app.whenReady()
  const displays = screen.getAllDisplays()
  log(`Displays: ${displays.length}`)

  initOverlayWindows()
  await new Promise((r) => setTimeout(r, 1200)) // let the pool actually pre-warm, not part of the measured path

  const results = []
  for (let i = 0; i < 10; i++) {
    results.push(await measureOnce(i))
    await new Promise((r) => setTimeout(r, 200)) // settle between runs
  }

  const totals = results.map((r) => r.totalToFramePaintedMs)
  const avg = totals.reduce((a, b) => a + b, 0) / totals.length
  const max = Math.max(...totals)
  const min = Math.min(...totals)

  const summary = { displays: displays.length, runs: results, avgMs: avg, minMs: min, maxMs: max }
  writeFileSync('/tmp/verify-hotkey-latency-result.json', JSON.stringify(summary, null, 2))
  log(`avg=${avg.toFixed(1)}ms min=${min.toFixed(1)}ms max=${max.toFixed(1)}ms (target: <80ms)`)

  app.exit(0)
}

main().catch((err) => {
  console.error(err)
  app.exit(1)
})
