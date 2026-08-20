// Phase 0 spike — BUILD-SPEC.md §5, spikes 1 and 2. THROWAWAY, not app code.
//
// Question: does `screencapture -R x,y,w,h` expect/return logical points or
// native (scaleFactor-multiplied) pixels, and do Electron's global `screen`
// coordinates line up 1:1 with what `-R` expects?
//
// Run: ./node_modules/.bin/electron spikes/coordinate-spike.js
//
// For each connected display, this captures a known-size rect at a known
// offset using the display's Electron `bounds` (points, unscaled) verbatim
// as the `-R` argument, then checks the output PNG's pixel dimensions
// against two hypotheses:
//   - NATIVE_PIXELS:   PNG is (rectWidth * scaleFactor) x (rectHeight * scaleFactor)
//   - LOGICAL_POINTS:  PNG is rectWidth x rectHeight, unscaled
//
// It also captures near each display's top-left and bottom-right corners to
// sanity-check the coordinate origin and edge clipping.
//
// LIMITATION: only exercises whatever displays are physically connected when
// run. Re-run with an external display attached (to the left/above primary,
// and/or a different scale factor) to cover the negative-origin and
// mixed-DPI cases spike 2 actually asks about.

import { app, screen } from 'electron'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'

/** @param {string[]} args */
function screencapture(args) {
  execFileSync('/usr/sbin/screencapture', args, { stdio: 'pipe' })
}

async function main() {
  await app.whenReady()

  const displays = screen.getAllDisplays()
  const primary = screen.getPrimaryDisplay()
  const outDir = mkdtempSync(join(tmpdir(), 'screencapture-spike-'))

  console.log('=== Phase 0 spike: screencapture -R coordinate model ===')
  console.log(`macOS: ${process.getSystemVersion()}  |  Electron sees ${displays.length} display(s)`)
  console.log(`Artifacts dir: ${outDir}\n`)

  for (const d of displays) {
    console.log(`Display id=${d.id}${d.id === primary.id ? ' (primary)' : ''}`)
    console.log(`  bounds (points):   ${JSON.stringify(d.bounds)}`)
    console.log(`  workArea (points): ${JSON.stringify(d.workArea)}`)
    console.log(`  scaleFactor:       ${d.scaleFactor}`)
    console.log(`  rotation:          ${d.rotation}`)
  }
  console.log()

  const results = []

  for (const d of displays) {
    const { x, y } = d.bounds

    const cases = [
      { name: 'inset-100', rect: { x: x + 80, y: y + 80, w: 100, h: 100 } },
      { name: 'top-left-corner', rect: { x, y, w: 60, h: 60 } },
      {
        name: 'bottom-right-corner',
        rect: { x: x + d.bounds.width - 60, y: y + d.bounds.height - 60, w: 60, h: 60 }
      }
    ]

    for (const c of cases) {
      const outfile = join(outDir, `display-${d.id}-${c.name}.png`)
      const spec = `${c.rect.x},${c.rect.y},${c.rect.w},${c.rect.h}`

      try {
        screencapture(['-x', '-R', spec, '-t', 'png', outfile])
      } catch (err) {
        console.log(`Display ${d.id} [${c.name}]: screencapture FAILED for -R ${spec}`)
        console.log(`  ${String(err)}`)
        results.push({ displayId: d.id, case: c.name, requestedRect: c.rect, error: String(err) })
        continue
      }

      const meta = await sharp(outfile).metadata()
      const pxW = meta.width ?? -1
      const pxH = meta.height ?? -1

      const nativePixels = { w: c.rect.w * d.scaleFactor, h: c.rect.h * d.scaleFactor }
      const logicalPoints = { w: c.rect.w, h: c.rect.h }

      let verdict
      if (pxW === nativePixels.w && pxH === nativePixels.h) {
        verdict = 'NATIVE_PIXELS'
      } else if (pxW === logicalPoints.w && pxH === logicalPoints.h) {
        verdict = 'LOGICAL_POINTS'
      } else {
        verdict = 'UNEXPECTED'
      }

      console.log(
        `Display ${d.id} [${c.name}] scaleFactor=${d.scaleFactor}: ` +
          `requested ${c.rect.w}x${c.rect.h}pt @ (${c.rect.x},${c.rect.y}) -> PNG ${pxW}x${pxH}px ` +
          `(density=${meta.density ?? 'n/a'}dpi) => ${verdict}`
      )
      if (verdict === 'UNEXPECTED') {
        console.log(
          `  expected NATIVE_PIXELS=${nativePixels.w}x${nativePixels.h} or LOGICAL_POINTS=${logicalPoints.w}x${logicalPoints.h}`
        )
      }

      results.push({
        displayId: d.id,
        case: c.name,
        scaleFactor: d.scaleFactor,
        requestedRect: c.rect,
        outputPixels: { w: pxW, h: pxH },
        densityDpi: meta.density ?? null,
        verdict,
        outfile
      })
    }
    console.log()
  }

  // Independent cross-check on the primary display only: -D full-display
  // capture's pixel size should equal bounds(points) * scaleFactor if the
  // scaleFactor semantics above are being read correctly.
  const fullOut = join(outDir, `display-primary-full.png`)
  screencapture(['-x', '-D', '1', '-t', 'png', fullOut])
  const fullMeta = await sharp(fullOut).metadata()
  const expectedFull = {
    w: Math.round(primary.bounds.width * primary.scaleFactor),
    h: Math.round(primary.bounds.height * primary.scaleFactor)
  }
  console.log('=== Cross-check: full-display capture (-D 1) vs bounds * scaleFactor ===')
  console.log(
    `-D 1 output: ${fullMeta.width}x${fullMeta.height}px, expected ${expectedFull.w}x${expectedFull.h}px ` +
      `=> ${fullMeta.width === expectedFull.w && fullMeta.height === expectedFull.h ? 'MATCH' : 'MISMATCH'}`
  )

  writeFileSync(join(outDir, 'results.json'), JSON.stringify(results, null, 2))

  console.log('\n=== Spike 2 note ===')
  if (displays.length < 2) {
    console.log(
      'Only one display was connected for this run — mixed-DPI, negative-origin, and\n' +
        'rotated-display cases from BUILD-SPEC.md §3.2 are NOT exercised. Re-run with an\n' +
        'external display attached (placed left-of and/or above the primary, ideally at a\n' +
        'different scale factor) before treating spike 2 as answered.'
    )
  } else {
    console.log('Multiple displays detected — inspect results.json and the per-display corner')
    console.log('captures above to confirm no clipping/offset errors at negative-origin displays.')
  }

  console.log(`\nOpen the PNGs in ${outDir} and compare against what was actually on screen`)
  console.log('at each requested rect to manually confirm the coordinate origin is correct.')

  app.quit()
}

main().catch((err) => {
  console.error(err)
  app.exit(1)
})
