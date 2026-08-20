import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/unit/**/*.test.ts']
  },
  resolve: {
    alias: { '@shared': resolve(__dirname, 'src/shared') }
  }
})
