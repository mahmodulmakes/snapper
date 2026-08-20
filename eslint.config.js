import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import globals from 'globals'

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: ['out/**', 'dist/**', 'node_modules/**']
  },
  {
    rules: {
      'no-console': 'error'
    }
  },
  {
    files: ['src/main/logger.ts'],
    rules: {
      'no-console': 'off'
    }
  },
  {
    files: ['build/**/*.cjs'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: globals.node
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
      'no-console': 'off'
    }
  },
  {
    // Throwaway Phase 0 spike scripts (CLAUDE.md "Working style" / BUILD-SPEC.md
    // §5) — not app code, console output is the whole point.
    files: ['spikes/**/*.js'],
    languageOptions: {
      globals: globals.node
    },
    rules: {
      'no-console': 'off'
    }
  }
)
