// Phase 0 spike (follow-up to spike 2) — THROWAWAY, not app code.
//
// Question: can `screencapture -R x,y,w,h` correctly capture a single rect
// that SPANS two displays of DIFFERENT scaleFactor? A PNG can only have one
// uniform pixel density — does screencapture upscale/downscale one side to
// match the other, use one display's scaleFactor for the whole thing, or
// produce something broken? This determines whether cross-display selection
// can be a single -R call or needs per-display capture + sharp stitching.
//
// Run: ./node_modules/.bin/electron spikes/cross-display-capture-spike.js

import { app, screen } from 'electron'
import { execFileSync } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'

async function main() {
  await app.whenReady()

  const displays = screen.getAllDisplays()
  if (displays.length < 2) {
    console.log('Need 2+ displays for this spike. Found:', displays.length)
    app.quit()
    return
  }

  console.log('=== Cross-display capture spike ===')
  displays.forEach((d) => {
    console.log(`Display ${d.id}: bounds=${JSON.stringify(d.bounds)} scaleFactor=${d.scaleFactor}`)
  })

  // Find two displays that actually touch (share a boundary), pick the pair
  // with different scaleFactors if possible.
  let a = displays[0]
  let b = displays[1]
  for (const d1 of displays) {
    for (const d2 of displays) {
      if (d1 === d2) continue
      if (d1.scaleFactor !== d2.scaleFactor) {
        a = d1
        b = d2
      }
    }
  }
  console.log(`\nUsing display ${a.id} (scaleFactor ${a.scaleFactor}) and display ${b.id} (scaleFactor ${b.scaleFactor})`)

  // Build a rect straddling the boundary between them. Assume `a` sits above
  // `b` (b.bounds.y = a.bounds.y + a.bounds.height) or similar adjacency;
  // just center a rect on whichever edge is shared, falling back to a rect
  // spanning both displays' bounding box if we can't detect adjacency.
  const boundaryY = Math.max(a.bounds.y, b.bounds.y) === a.bounds.y ? a.bounds.y : b.bounds.y

  async function captureAndReport(label, rect) {
    const outDir = mkdtempSync(join(tmpdir(), 'cross-display-spike-'))
    const outfile = join(outDir, `spanning-capture-${label}.png`)
    const spec = `${rect.x},${rect.y},${rect.width},${rect.height}`
    console.log(`\n--- ${label}: rect (points) = ${JSON.stringify(rect)} ---`)
    try {
      execFileSync('/usr/sbin/screencapture', ['-x', '-R', spec, '-t', 'png', outfile], { stdio: 'pipe' })
    } catch (err) {
      console.log('screencapture FAILED:', String(err))
      return
    }
    const meta = await sharp(outfile).metadata()
    console.log(`Output PNG: ${meta.width}x${meta.height}px (density=${meta.density}dpi)`)
    console.log(`If uniform at scaleFactor ${a.scaleFactor} (${a.id}): expected ${rect.width * a.scaleFactor}x${rect.height * a.scaleFactor}`)
    console.log(`If uniform at scaleFactor ${b.scaleFactor} (${b.id}): expected ${rect.width * b.scaleFactor}x${rect.height * b.scaleFactor}`)
    console.log(`Artifact: ${outfile}`)
  }

  // Case 1: rect origin sits on the LOWER-scaleFactor display (b, external 1x),
  // extending into the HIGHER-scaleFactor display (a, Retina 2x).
  await captureAndReport('origin-on-1x', {
    x: Math.max(a.bounds.x, b.bounds.x) + 50,
    y: boundaryY - 50,
    width: 300,
    height: 100
  })

  // Case 2: rect is overwhelmingly on the HIGHER-scaleFactor display (a,
  // Retina 2x) — only 5pt of its 100pt height crosses into b (external 1x).
  // Given the vertical stacking here, the origin is unavoidably in b's
  // territory (b is above a), but this tests whether a bare few-point touch
  // of the lower-scale display is enough to drag the WHOLE output down to
  // 1x, or whether the majority-display's scale wins instead.
  await captureAndReport('mostly-on-2x', {
    x: Math.max(a.bounds.x, b.bounds.x) + 50,
    y: boundaryY - 5,
    width: 300,
    height: 100
  })

  console.log('\nOpen both artifacts and visually check: is content from BOTH displays present and undistorted,')
  console.log('or is one half stretched/squished/missing? Compare pixel dimensions between the two cases.')

  app.quit()
}

main().catch((err) => {
  console.error(err)
  app.exit(1)
})
