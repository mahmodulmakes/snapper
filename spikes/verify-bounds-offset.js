// Throwaway diagnostic, not app code. The retina overlay window's
// getBounds() reports {x:0,y:-28,width:1470,height:984} instead of the
// requested {x:0,y:0,width:1470,height:956} matching display.bounds. This
// determines which is TRUE: does the window's content actually render at
// the real display's y=0 top edge (getBounds() is a misreport), or has
// macOS genuinely shifted the window up by 28pt (getBounds() is accurate,
// and the window now overlaps the display above it)?
//
// Method: draw a solid magenta marker at the overlay canvas's LOCAL (0,0)
// corner, then use the REAL screencapture binary (ground truth, not
// Electron's own state) to capture two small regions: one at GLOBAL (0,0)
// using display.bounds (the requested origin), and one at GLOBAL (0,-28)
// using getBounds()'s reported origin. Whichever region is magenta tells us
// where the marker actually landed on screen.

import { app, BrowserWindow, screen } from 'electron'
import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { initOverlayWindows, showOverlays } from '../src/main/overlay/overlayManager.ts'

function log(msg) {
  console.log(`[verify-bounds] ${msg}`)
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

  initOverlayWindows()
  await new Promise((r) => setTimeout(r, 1200))
  showOverlays()
  await new Promise((r) => setTimeout(r, 600))

  const win = BrowserWindow.getAllWindows().find((w) => {
    const b = w.getBounds()
    return Math.abs(b.x - retina.bounds.x) < 5 && Math.abs(b.width - retina.bounds.width) < 5
  })
  if (!win) {
    log('Could not find the retina overlay window.')
    app.exit(1)
    return
  }
  const actualBounds = win.getBounds()
  log(`Window getBounds(): ${JSON.stringify(actualBounds)}`)

  // Paint a 40x40 solid magenta square at the canvas's local top-left corner
  // in CSS-point space (not device pixels — the ctx is dpr-scaled by
  // resizeCanvas's setTransform, so draw through that, not around it).
  // Repainted on an interval to survive any other render() call overwriting it.
  await win.webContents.executeJavaScript(`
    (function() {
      const canvas = document.getElementById('overlay-canvas');
      const ctx = canvas.getContext('2d');
      window.__markerInterval = setInterval(() => {
        ctx.fillStyle = '#ff00ff';
        ctx.fillRect(0, 0, 40, 40);
      }, 50);
    })();
  `)
  await new Promise((r) => setTimeout(r, 400))

  const readback = await win.webContents.executeJavaScript(`
    (function() {
      const canvas = document.getElementById('overlay-canvas');
      const ctx = canvas.getContext('2d');
      const d = ctx.getImageData(5, 5, 1, 1).data;
      return { pixel: Array.from(d), cssSize: [canvas.style.width, canvas.style.height], backingSize: [canvas.width, canvas.height], dpr: window.devicePixelRatio };
    })();
  `)
  log(`Electron-side canvas readback at local (5,5): ${JSON.stringify(readback)}`)

  // Ground truth via the REAL screencapture binary, not Electron's own state.
  const captureAndCheck = async (label, x, y) => {
    const outPath = `/tmp/verify-bounds-${label}.png`
    execFileSync('/usr/sbin/screencapture', ['-x', '-R', `${x},${y},40,40`, '-t', 'png', outPath])
    return outPath
  }

  const atDisplayBoundsOrigin = await captureAndCheck('at-display-bounds-origin', retina.bounds.x, retina.bounds.y)
  const atGetBoundsOrigin = await captureAndCheck('at-getbounds-origin', actualBounds.x, actualBounds.y)

  log(`Captured region at display.bounds origin (${retina.bounds.x},${retina.bounds.y}) -> ${atDisplayBoundsOrigin}`)
  log(`Captured region at getBounds() origin (${actualBounds.x},${actualBounds.y}) -> ${atGetBoundsOrigin}`)

  writeFileSync('/tmp/verify-bounds-result.json', JSON.stringify({ retinaBounds: retina.bounds, windowGetBounds: actualBounds }, null, 2))

  app.exit(0)
}

main().catch((err) => {
  console.error(err)
  app.exit(1)
})
