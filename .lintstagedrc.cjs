/**
 * lint-staged config for pnpm monorepo.
 * Uses function form so each package's own ESLint config is used.
 * Prettier runs at the root since it's installed there.
 */

module.exports = {
  // Server TypeScript — use server package's eslint config
  'apps/server/src/**/*.{ts,tsx}': (files) => [
    `pnpm --filter @repo/server exec eslint --fix --max-warnings=0 --no-warn-ignored ${files.join(' ')}`,
    `prettier --write ${files.join(' ')}`,
  ],

  // Client TypeScript — use client package's eslint config
  'apps/client/src/**/*.{ts,tsx}': (files) => [
    `pnpm --filter @repo/client exec eslint --fix --max-warnings=0 ${files.join(' ')}`,
    `prettier --write ${files.join(' ')}`,
  ],

  // Client CSS — Prettier only (ESLint does not process CSS)
  'apps/client/src/**/*.css': (files) => `prettier --write ${files.join(' ')}`,

  // Admin — Biome handles both lint and format
  'apps/admin/**/*.{ts,tsx,css}': (files) =>
    `pnpm --filter @repo/admin exec biome check --write ${files.join(' ')}`,

  // Config / docs — Prettier only
  '*.{json,md,yml,yaml}': (files) => `prettier --write ${files.join(' ')}`,
};
