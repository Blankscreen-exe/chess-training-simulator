import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import globals from 'globals'

export default tseslint.config(
  { ignores: ['out/', 'release/', 'coverage/', 'node_modules/'] },

  js.configs.recommended,

  {
    files: ['**/*.{ts,tsx,mts}'],
    extends: [tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },

  {
    files: ['src/main/**/*.ts', 'src/preload/**/*.ts', '*.config.mts'],
    languageOptions: { globals: globals.node },
  },

  {
    files: ['src/renderer/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    extends: [reactHooks.configs.flat.recommended, reactRefresh.configs.vite],
  },

  {
    files: ['**/*.mjs'],
    languageOptions: { globals: globals.node },
  },
)
