/**
 * lint-staged config for pnpm monorepo.
 * Uses function form so each package's own ESLint config is used.
 * Prettier runs at the root since it's installed there.
 *
 * pnpm is routed through `npx --yes pnpm@<pinned>` so the hook works
 * even when the spawning shell (e.g. VS Code Git GUI) has not picked up
 * pnpm's install location on PATH.
 */

const PNPM = 'npx --yes pnpm@10.29.3';

// Lockfiles are too large for Prettier (and pointless to format).
const LOCKFILE_RE = /(^|[\\/])(package-lock\.json|pnpm-lock\.yaml|npm-shrinkwrap\.json|yarn\.lock)$/;
const stripLockfiles = (files) => files.filter((file) => !LOCKFILE_RE.test(file));

// Quote each path so spaces (e.g. "Next projects") don't get split on Windows.
const q = (files) => files.map((file) => `"${file}"`).join(' ');

module.exports = {
  // Server TypeScript — use server package's eslint config
  'apps/server/src/**/*.{ts,tsx}': (files) => [
    `${PNPM} --filter @repo/server exec eslint --fix --max-warnings=0 --no-warn-ignored ${q(files)}`,
    `prettier --write ${q(files)}`,
  ],

  // Client TypeScript — use client package's eslint config
  'apps/client/src/**/*.{ts,tsx}': (files) => [
    `${PNPM} --filter @repo/client exec eslint --fix --max-warnings=0 ${q(files)}`,
    `prettier --write ${q(files)}`,
  ],

  // Client CSS — Prettier only (ESLint does not process CSS)
  'apps/client/src/**/*.css': (files) => `prettier --write ${q(files)}`,

  // Admin — Biome handles both lint and format
  'apps/admin/**/*.{ts,tsx,css}': (files) =>
    `${PNPM} --filter @repo/admin exec biome check --write ${q(files)}`,

  // Config / docs — Prettier only. Lockfiles are filtered out: prettier
  // OOM-kills on package-lock.json and the lockfile is auto-managed anyway.
  '*.{json,md,yml,yaml}': (files) => {
    const filtered = stripLockfiles(files);
    if (filtered.length === 0) return [];
    return `prettier --write ${q(filtered)}`;
  },
};
