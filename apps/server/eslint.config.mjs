import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-namespace': 'off',
      'no-console': ['warn', { allow: ['error', 'warn'] }],
      'no-control-regex': 'off',
      'no-empty': 'warn',
      'prefer-const': 'warn',
    },
  },
  {
    ignores: ['dist/**', 'drizzle/**', 'node_modules/**', 'src/**/*.test.ts'],
  },
);
