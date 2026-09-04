// @ts-check
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import security from 'eslint-plugin-security';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  security.configs.recommended,
  {
    rules: {
      'prefer-const': 'warn',
      'no-console': 'off',
      // Keep the rule as an error; only the deliberate `_`-prefix convention
      // (payment-provider injected params: _db/_order/_amount/_reason) is exempt.
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  },
  {
    ignores: [
      'node_modules/',
      'dist/',
      '.astro/',
      'coverage/',
      'reespec/',
      'test-results/',
      'tests/',
    ],
  }
);
