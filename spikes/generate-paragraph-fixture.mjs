// Phase 8 spike A fixture generator — denser paragraph case. THROWAWAY.
// Run: node spikes/generate-paragraph-fixture.mjs

import sharp from 'sharp'

const scale = 2
const widthPt = 700
const heightPt = 400
const width = widthPt * scale
const height = heightPt * scale

const lines = [
  'The quick brown fox jumps over the lazy dog.',
  'Pack my box with five dozen liquor jugs.',
  'How vexingly quick daft zebras jump!',
  'The five boxing wizards jump quickly.',
  'Sphinx of black quartz, judge my vow.',
  'Waltz, bad nymph, for quick jigs vex.',
  'Grumpy wizards make toxic brew for the jovial queen.',
  'A wizard\'s job is to vex chumps quickly in fog.',
  'Watch "Jeopardy!", Alex Trebek\'s fun TV quiz game.',
  'Amazingly few discotheques provide jukeboxes.',
]

const fontSize = 20 * scale
const lineHeight = 30 * scale
const marginLeft = 30 * scale
const marginTop = 40 * scale

const textEls = lines
  .map((line, i) => `<text x="${marginLeft}" y="${marginTop + i * lineHeight}" font-family="Helvetica, Arial, sans-serif" font-size="${fontSize}" fill="black">${line}</text>`)
  .join('\n  ')

const svg = `
<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <rect width="100%" height="100%" fill="white"/>
  ${textEls}
</svg>
`

const outPath = new URL('./text-spike-paragraph-fixture.png', import.meta.url).pathname
await sharp(Buffer.from(svg)).png().toFile(outPath)
console.log(`wrote ${outPath} (${width}x${height}px, ${scale}x scale, ${lines.length} lines)`)
