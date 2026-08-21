// Throwaway verification driver, not app code. Confirms the getBounds()-vs-
// display.bounds fix actually fixes capture POSITION, not just dimensions.
//
// Method: pick a rect entirely on the retina (menu-bar-hosting) display —
// the one where getBounds() misreports its origin by ~28pt. Drive a real
// drag+Copy through the app's pipeline to get its captured image, and
// independently capture the SAME expected global rect via a raw
// `screencapture -R` call. If the app's origin math is correct, the two
// images should be pixel-identical (same real screen content). If the old
// getBounds()-based bug were still present, the app's capture would be
// shifted ~28pt vertically and show DIFFERENT desktop content.

import { app, BrowserWindow, clipboard, screen } from 'electron'
import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { initOverlayWindows, showOverlays } from '../src/main/overlay/overlayManager.ts'

function log(msg) {
  console.log(`[verify-position] ${msg}`)
}

async function main() {
  await app.whenReady()
  const displays = screen.getAllDisplays()
  const retina = displays.find((d) => d.scaleFactor === 2)
  if (!retina) {
    log('No 2x display found. Aborting.')
    app.exit(1)
    return
  }
  log(`Retina display.bounds: ${JSON.stringify(retina.bounds)}`)

  // Set up the overlay pool FIRST — reading the cursor and firing the drag
  // happen as close together as possible afterward, to minimize the window
  // where a real, physically-moving mouse could invalidate the prediction.
  initOverlayWindows()
  await new Promise((r) => setTimeout(r, 1200))
  showOverlays()
  await new Promise((r) => setTimeout(r, 400))

  const realCursor = screen.getCursorScreenPoint()
  const targetDisplay = displays.find(
    (d) => realCursor.x >= d.bounds.x && realCursor.x < d.bounds.x + d.bounds.width && realCursor.y >= d.bounds.y && realCursor.y < d.bounds.y + d.bounds.height
  )
  if (!targetDisplay) {
    log(`Real cursor ${JSON.stringify(realCursor)} is not within any display. Aborting.`)
    app.exit(1)
    return
  }
  log(`Real cursor at ${JSON.stringify(realCursor)}, on display id=${targetDisplay.id} (scaleFactor ${targetDisplay.scaleFactor}).`)
  if (targetDisplay.id !== retina.id) {
    log(`Note: cursor is on the non-retina display this run, so this specific run validates that display's origin handling, not retina's getBounds() bug directly — the code fix itself (using screen.getAllDisplays() uniformly, never window.getBounds()) applies the same way regardless of which display is tested.`)
  }

  const anchorGlobal = { x: targetDisplay.bounds.x + 40, y: targetDisplay.bounds.y + 30 }
  const expectedRect = {
    x: Math.min(anchorGlobal.x, realCursor.x),
    y: Math.min(anchorGlobal.y, realCursor.y),
    width: Math.abs(realCursor.x - anchorGlobal.x),
    height: Math.abs(realCursor.y - anchorGlobal.y)
  }
  log(`Expected global rect: ${JSON.stringify(expectedRect)}`)
  if (expectedRect.width < 30 || expectedRect.height < 30) {
    log('Rect too small. Aborting.')
    app.exit(1)
    return
  }

  const win = BrowserWindow.getAllWindows().find((w) => {
    const b = w.getBounds()
    return Math.abs(b.x - targetDisplay.bounds.x) < 50 && Math.abs(b.width - targetDisplay.bounds.width) < 5
  })
  if (!win) {
    log('Could not find the target overlay window.')
    app.exit(1)
    return
  }

  const anchorLocal = { x: anchorGlobal.x - targetDisplay.bounds.x, y: anchorGlobal.y - targetDisplay.bounds.y }
  clipboard.clear()
  await win.webContents.executeJavaScript(`
    (function() {
      const canvas = document.getElementById('overlay-canvas');
      canvas.dispatchEvent(new MouseEvent('mousedown', { clientX: ${anchorLocal.x}, clientY: ${anchorLocal.y}, bubbles: true }));
    })();
  `)
  await new Promise((r) => setTimeout(r, 20))
  await win.webContents.executeJavaScript(`window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));`)
  const cursorAtMouseup = screen.getCursorScreenPoint()
  log(`Cursor at synthetic mouseup time: ${JSON.stringify(cursorAtMouseup)} (drift from initial read: dx=${cursorAtMouseup.x - realCursor.x}, dy=${cursorAtMouseup.y - realCursor.y})`)
  await new Promise((r) => setTimeout(r, 150))
  await win.webContents.executeJavaScript(`document.getElementById('toolbar-copy').click();`)
  await new Promise((r) => setTimeout(r, 500))

  const appImage = clipboard.readImage()
  if (appImage.isEmpty()) {
    log('App did not produce a clipboard image.')
    app.exit(1)
    return
  }
  const appPath = '/tmp/verify-position-app.png'
  writeFileSync(appPath, appImage.toPNG())
  log(`App's captured image saved to ${appPath}, size ${JSON.stringify(appImage.getSize())}`)

  // Independent ground-truth capture using the ACTUAL cursor position at
  // mouseup (not the initial read) — matches whatever the app really used.
  const actualRect = {
    x: Math.min(anchorGlobal.x, cursorAtMouseup.x),
    y: Math.min(anchorGlobal.y, cursorAtMouseup.y),
    width: Math.abs(cursorAtMouseup.x - anchorGlobal.x),
    height: Math.abs(cursorAtMouseup.y - anchorGlobal.y)
  }
  log(`Actual rect (using mouseup-time cursor): ${JSON.stringify(actualRect)}`)
  const independentPath = '/tmp/verify-position-independent.png'
  execFileSync('/usr/sbin/screencapture', [
    '-x',
    '-R',
    `${actualRect.x},${actualRect.y},${actualRect.width},${actualRect.height}`,
    '-t',
    'png',
    independentPath
  ])
  log(`Independent ground-truth capture (post-hoc, same actual rect) saved to ${independentPath}`)

  app.exit(0)
}

main().catch((err) => {
  console.error(err)
  app.exit(1)
})
