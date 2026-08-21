// Throwaway verification driver, not app code. Drives a REAL cross-display
// drag through the new architecture: anchor placed (via synthetic
// mousedown) on the external (1x) display, ending at wherever the real OS
// cursor currently sits (read, not moved) — verifies live rendering on both
// windows, correct toolbar-host selection, and — the actual point of spike
// 4's fix — that the stitched output lands at native (2x) resolution
// instead of being silently downsampled to 1x.
//
// Run from out/main/ (see verify-single-display-drag's earlier notes on why
// — relative renderer/preload path resolution needs it there).

import { app, BrowserWindow, clipboard, screen } from 'electron'
import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { initOverlayWindows, showOverlays } from '../src/main/overlay/overlayManager.ts'

function log(msg) {
  console.log(`[verify-xdisplay] ${msg}`)
}

async function main() {
  await app.whenReady()

  const displays = screen.getAllDisplays()
  log(`Displays: ${JSON.stringify(displays.map((d) => ({ id: d.id, bounds: d.bounds, scaleFactor: d.scaleFactor })))}`)
  if (displays.length !== 2) {
    log(`Expected exactly 2 displays. Found ${displays.length}. Aborting.`)
    app.exit(1)
    return
  }

  const external = displays.find((d) => d.scaleFactor === 1)
  const retina = displays.find((d) => d.scaleFactor === 2)
  if (!external || !retina) {
    log('Expected one 1x and one 2x display. Aborting.')
    app.exit(1)
    return
  }
  log(`External (1x): id=${external.id} bounds=${JSON.stringify(external.bounds)}`)
  log(`Retina (2x): id=${retina.id} bounds=${JSON.stringify(retina.bounds)}`)

  const realCursor = screen.getCursorScreenPoint()
  log(`Real OS cursor at: ${JSON.stringify(realCursor)}`)

  const cursorOnDisplay = displays.find(
    (d) =>
      realCursor.x >= d.bounds.x &&
      realCursor.x < d.bounds.x + d.bounds.width &&
      realCursor.y >= d.bounds.y &&
      realCursor.y < d.bounds.y + d.bounds.height
  )
  if (!cursorOnDisplay) {
    log('Real cursor is not within any display bounds (unexpected). Aborting.')
    app.exit(1)
    return
  }
  log(`Real cursor is on display id=${cursorOnDisplay.id}`)

  // Anchor on whichever display the cursor is NOT currently on, so the drag
  // necessarily spans the boundary.
  const anchorDisplay = cursorOnDisplay.id === external.id ? retina : external
  const anchorGlobal = {
    x: anchorDisplay.bounds.x + Math.min(50, anchorDisplay.bounds.width - 10),
    y: anchorDisplay.id === external.id ? anchorDisplay.bounds.y + anchorDisplay.bounds.height - 100 : anchorDisplay.bounds.y + 100
  }
  log(`Anchor display: id=${anchorDisplay.id}. Anchor (global points): ${JSON.stringify(anchorGlobal)}`)

  const expectedRectPoints = {
    x: Math.min(anchorGlobal.x, realCursor.x),
    y: Math.min(anchorGlobal.y, realCursor.y),
    width: Math.abs(realCursor.x - anchorGlobal.x),
    height: Math.abs(realCursor.y - anchorGlobal.y)
  }
  log(`Expected final rect (global points): ${JSON.stringify(expectedRectPoints)}`)
  if (expectedRectPoints.width < 20 || expectedRectPoints.height < 20) {
    log('Rect too small for a meaningful test — real cursor too close to anchor. Aborting.')
    app.exit(1)
    return
  }

  initOverlayWindows()
  await new Promise((r) => setTimeout(r, 1200))
  showOverlays()
  await new Promise((r) => setTimeout(r, 600))

  const windows = BrowserWindow.getAllWindows()
  log(`${windows.length} overlay window(s) created.`)
  for (const win of windows) {
    log(`Window getBounds(): ${JSON.stringify(win.getBounds())} (content bounds: ${JSON.stringify(win.getContentBounds())})`)
  }
  // Match on x + width, not y: verify-bounds-offset.mjs found that a
  // frameless overlay window's getBounds() can misreport y/height by ~28pt
  // near the retina display's top edge (content actually renders at the
  // correct display.bounds origin; only the self-reported value is off).
  const anchorWin = windows.find((w) => {
    const b = w.getBounds()
    return b.x === anchorDisplay.bounds.x && b.width === anchorDisplay.bounds.width
  })
  if (!anchorWin) {
    log('Could not find the anchor-display overlay window.')
    app.exit(1)
    return
  }

  const anchorLocal = { x: anchorGlobal.x - anchorDisplay.bounds.x, y: anchorGlobal.y - anchorDisplay.bounds.y }
  log(`Dispatching synthetic mousedown in display ${anchorDisplay.id}'s window at local ${JSON.stringify(anchorLocal)}`)

  clipboard.clear()

  await anchorWin.webContents.executeJavaScript(`
    (function() {
      const canvas = document.getElementById('overlay-canvas');
      canvas.dispatchEvent(new MouseEvent('mousedown', { clientX: ${anchorLocal.x}, clientY: ${anchorLocal.y}, bubbles: true }));
    })();
  `)

  await new Promise((r) => setTimeout(r, 350)) // let the poll loop tick several times

  // Screenshot BOTH windows mid-drag to confirm live rendering on each.
  for (const win of windows) {
    const b = win.getBounds()
    const shot = await win.capturePage()
    const label = b.x === external.bounds.x && b.y === external.bounds.y ? 'external' : 'retina'
    writeFileSync(`/tmp/verify-xdisplay-middrag-${label}.png`, shot.toPNG())
    log(`Saved mid-drag screenshot for ${label} display.`)
  }

  // Mouseup fires on the SAME window that received mousedown (matches how
  // dragging renderer state actually works — window-level listener).
  await anchorWin.webContents.executeJavaScript(`window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));`)
  log('Fired synthetic mouseup.')
  await new Promise((r) => setTimeout(r, 400))

  // Screenshot both again post-finalize to see which one shows the toolbar.
  for (const win of windows) {
    const b = win.getBounds()
    const shot = await win.capturePage()
    const label = b.x === external.bounds.x && b.y === external.bounds.y ? 'external' : 'retina'
    writeFileSync(`/tmp/verify-xdisplay-final-${label}.png`, shot.toPNG())
  }

  // Click Copy wherever the toolbar actually is — try both windows, only one has a visible button.
  for (const win of windows) {
    await win.webContents
      .executeJavaScript(`
      (function() {
        const btn = document.getElementById('toolbar-copy');
        const toolbar = document.getElementById('toolbar');
        if (toolbar && toolbar.classList.contains('visible') && btn) { btn.click(); return true; }
        return false;
      })();
    `)
      .then((clicked) => {
        if (clicked) log(`Clicked Copy in the window at ${JSON.stringify(win.getBounds())}`)
      })
  }

  await new Promise((r) => setTimeout(r, 700))

  const image = clipboard.readImage()
  const clipboardSizePoints = image.isEmpty() ? null : image.getSize()
  let osascriptCheck = null
  try {
    const raw = execFileSync('osascript', ['-e', 'the clipboard as «class PNGf»']).toString()
    osascriptCheck = { hasData: raw.trim().length > 0 }
  } catch (err) {
    osascriptCheck = { error: String(err) }
  }

  const compositeScaleFactor = Math.max(external.scaleFactor, retina.scaleFactor)
  const expectedPixelDimensions = {
    width: Math.round(expectedRectPoints.width * compositeScaleFactor),
    height: Math.round(expectedRectPoints.height * compositeScaleFactor)
  }
  // clipboard.ts loads the PNG via nativeImage.createFromBuffer() with no
  // explicit scaleFactor, so getSize() reports the PNG's raw pixel
  // dimensions directly (confirmed empirically in the single-display
  // regression check earlier this session) — compare straight against
  // expectedPixelDimensions, which is the actual point of this test: spike
  // 4's bug would silently produce 1x (146x708-ish) here instead.
  const result = {
    expectedRectPoints,
    expectedPixelDimensions,
    clipboardSizePoints,
    osascriptCheck
  }
  writeFileSync('/tmp/verify-xdisplay-result.json', JSON.stringify(result, null, 2))
  log(`Result: ${JSON.stringify(result, null, 2)}`)

  app.exit(0)
}

main().catch((err) => {
  console.error(err)
  app.exit(1)
})
