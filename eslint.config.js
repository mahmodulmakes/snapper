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
  }
)
