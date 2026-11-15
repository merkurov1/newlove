import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ['**/*.{js,jsx,ts,tsx}'],
    rules: {
      // Text-heavy editorial pages legitimately contain quotes and apostrophes
      // in JSX text. Escaping them would change rendered copy.
      'react/no-unescaped-entities': 'off',

      // The project intentionally uses <img> in places where next/image cannot
      // be applied (email previews, user-provided remote hosts, OG rendering).
      '@next/next/no-img-element': 'warn',

      // Legacy admin and analytics code has untyped boundaries. Keep these
      // visible without blocking the build.
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          ignoreRestSiblings: true,
        },
      ],

      // Hooks correctness is an error; dependency completeness is advisory
      // because several effects intentionally depend on stable refs/values.
      'react-hooks/exhaustive-deps': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/purity': 'warn',

      // Rules introduced by eslint-plugin-react-hooks v6 (shipped with
      // eslint-config-next 16). They flag long-standing patterns in legacy
      // components that need behavioural verification before refactoring.
      // Keep them visible as warnings; do not let them block the build.
      'react-hooks/error-boundaries': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/immutability': 'warn',
      'react-hooks/static-components': 'warn',
      'react-hooks/preserve-manual-memoization': 'warn',

      // Full-page anchors are intentional in a few standalone/legacy pages
      // (print views, error pages, redirects handled client-side).
      '@next/next/no-html-link-for-pages': 'warn',

      // Legacy suppressions predate this migration; convert them gradually.
      '@typescript-eslint/ban-ts-comment': 'warn',
      '@typescript-eslint/no-empty-object-type': 'warn',
      '@typescript-eslint/no-unsafe-function-type': 'warn',
    },
  },
  {
    files: ['**/*.test.{ts,tsx,js,jsx}', '**/__tests__/**/*.{ts,tsx,js,jsx}'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  {
    // Config and standalone tooling files are CommonJS by design.
    files: ['*.config.js', '*.config.cjs', 'tests/**/*.{js,cjs}', 'scripts/**/*.{js,cjs}'],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  globalIgnores([
    // eslint-config-next defaults
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
    // Build artifacts and generated files
    'node_modules/**',
    'dist/**',
    'coverage/**',
    '.swc/**',
    '*.tsbuildinfo',
    // Standalone operational scripts (CommonJS CLIs, hardhat, one-off audits).
    // They are not part of the Next.js application surface.
    'scripts/**',
    'hardhat.config.js',
    'db_diagnostics.js',
    'test_jsdom.js',
    'test_*.js',
    // Generated / vendored binaries
    'lib/generated/**',
    'public/**',
  ]),
]);

export default eslintConfig;
