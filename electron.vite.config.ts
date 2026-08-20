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
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'out/preload',
      rollupOptions: {
        input: {
          overlay: r('src/preload/overlay.preload.ts'),
          editor: r('src/preload/editor.preload.ts'),
          settings: r('src/preload/settings.preload.ts')
        },
        output: {
          // Electron's sandboxed preload context loads scripts via Node's
          // CJS loader, which cannot execute `import`/`export` syntax — the
          // package.json "type": "module" default (ESM, .mjs) makes every
          // preload fail with "Cannot use import statement outside a
          // module", silently breaking contextBridge. Force CJS + an
          // explicit .cjs extension so it's correct regardless of that.
          format: 'cjs',
          entryFileNames: '[name].cjs'
        }
      }
    },
    resolve: {
      alias: { '@shared': r('src/shared') }
    }
  },
  renderer: {
    root: r('src/renderer'),
    plugins: [react()],
    build: {
      outDir: 'out/renderer',
      rollupOptions: {
        input: {
          overlay: r('src/renderer/overlay/index.html'),
          editor: r('src/renderer/editor/index.html'),
          settings: r('src/renderer/settings/index.html')
        }
      }
    },
    resolve: {
      alias: { '@shared': r('src/shared') }
    }
  }
})
