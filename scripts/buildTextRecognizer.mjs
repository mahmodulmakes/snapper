// Compiles native/textRecognizer/main.swift into resources/bin/text-recognizer.
// Mirrors buildPreloads.mjs's role: a build step outside electron-vite's own
// pipeline, since electron-vite has no notion of compiling Swift. The
// compiled binary is a build artifact (architecture-specific) — not
// committed, see .gitignore — rebuilt by `npm run dev` / `npm run build`.

import { execFile } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

const __dirname = dirname(fileURLToPath(import.meta.url))
const sourcePath = join(__dirname, '../native/textRecognizer/main.swift')
const outDir = join(__dirname, '../resources/bin')
const outPath = join(outDir, 'text-recognizer')

mkdirSync(outDir, { recursive: true })

try {
  await execFileAsync('swiftc', ['-O', sourcePath, '-o', outPath])
  console.log(`[build:native] compiled ${outPath}`)
} catch (err) {
  console.error('[build:native] swiftc failed — is Xcode Command Line Tools installed? (xcode-select -p)')
  console.error(err.stderr ?? err.message)
  process.exit(1)
}
