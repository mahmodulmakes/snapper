// Phase 8 spike A fixture generator. THROWAWAY, not app code.
//
// Renders a small PNG with known text at known positions, at 2x scale to
// simulate a Retina capture, so the Vision helper's recognized text and
// bounding boxes can be checked against ground truth.
//
// Run: node spikes/generate-text-fixture.mjs

import sharp from 'sharp'

const scale = 2
const widthPt = 500
const heightPt = 220
const width = widthPt * scale
const height = heightPt * scale

const svg = `
<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <rect width="100%" height="100%" fill="white"/>
  <text x="${40 * scale}" y="${60 * scale}" font-family="Helvetica, Arial, sans-serif" font-size="${34 * scale}" fill="black">Hello World</text>
  <text x="${40 * scale}" y="${120 * scale}" font-family="Helvetica, Arial, sans-serif" font-size="${22 * scale}" fill="black">The quick brown fox jumps</text>
  <text x="${40 * scale}" y="${160 * scale}" font-family="Helvetica, Arial, sans-serif" font-size="${22 * scale}" fill="black">over the lazy dog 12345</text>
</svg>
`

const outPath = new URL('./text-spike-fixture.png', import.meta.url).pathname
await sharp(Buffer.from(svg)).png().toFile(outPath)
console.log(`wrote ${outPath} (${width}x${height}px, ${scale}x scale)`)
