// Bundles each src/preload/*.preload.ts into a fully self-contained
// out/preload/<name>.cjs — one separate esbuild call per entry, deliberately
// NOT a single multi-entry Rollup/Vite build.
//
// Why: Electron's sandboxed preload context loads scripts via Node's CJS
// require(), which cannot resolve a require() of a sibling chunk file the
// way a normal Node process can. electron-vite's Rollup-based preload build
// extracts any module shared by 2+ preload entries (e.g. main/ipc/channels.ts,
// imported by more than one preload) into a separate out/preload/chunks/*.cjs
// file and has each entry require() it — that silently fails at runtime with
// "Unable to load preload script ... module not found: ./chunks/...".
// Rollup's multi-entry chunk-splitting has no simple flag to force full
// per-entry duplication instead of sharing; the reliable fix is running
// completely separate builds per entry, which is what this script does.

import { build } from 'esbuild'
import { readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const preloadDir = join(__dirname, '../src/preload')
const outDir = join(__dirname, '../out/preload')

const entries = readdirSync(preloadDir).filter((file) => file.endsWith('.preload.ts'))

await Promise.all(
  entries.map((file) =>
    build({
      entryPoints: [join(preloadDir, file)],
      outfile: join(outDir, file.replace(/\.preload\.ts$/, '.cjs')),
      bundle: true,
      platform: 'node',
      format: 'cjs',
      target: 'node20',
      external: ['electron'],
      logLevel: 'info'
    })
  )
)
