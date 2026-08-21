// Compiles native/scrollhelper/main.swift into resources/scrollhelper —
// bundled into the packaged app via electron-builder.yml's extraResources,
// and used directly from that same path in dev (see
// src/main/capture/scrollSynthesis.ts's path resolution).

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const source = join(__dirname, '../native/scrollhelper/main.swift')
const outDir = join(__dirname, '../resources')
const outFile = join(outDir, 'scrollhelper')

if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true })

execFileSync('swiftc', [source, '-o', outFile], { stdio: 'inherit' })
