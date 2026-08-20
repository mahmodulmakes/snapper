import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

const r = (...segments: string[]): string => resolve(__dirname, ...segments)

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'out/main',
      rollupOptions: {
        input: { index: r('src/main/index.ts') }
      }
    },
    resolve: {
      alias: { '@shared': r('src/shared') }
    }
  },
  // No `preload` block here on purpose — see scripts/buildPreloads.mjs for
  // why preload scripts are built separately via esbuild, not electron-vite's
  // Rollup pipeline (multi-entry chunk-splitting breaks Electron's sandboxed
  // preload loader whenever 2+ preloads share an imported module).
  renderer: {
    root: r('src/renderer'),
    plugins: [react()],
    build: {
      outDir: 'out/renderer',
      rollupOptions: {
        input: {
          overlay: r('src/renderer/overlay/index.html'),
          editor: r('src/renderer/editor/index.html'),
          settings: r('src/renderer/settings/index.html'),
          onboarding: r('src/renderer/onboarding/index.html')
        }
      }
    },
    resolve: {
      alias: { '@shared': r('src/shared') }
    }
  }
})
