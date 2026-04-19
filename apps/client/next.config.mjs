import path from "node:path";
import { fileURLToPath } from "node:url";
import { withSentryConfig } from "@sentry/nextjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
/** Monorepo root (…/dental-work). Avoids Next inferring a wrong root when other lockfiles exist on the machine. */
const monorepoRoot = path.join(__dirname, "..", "..");
/** pnpm installs deps under apps/client; Turbopack resolves bare CSS imports from `apps/` and would miss this package without an explicit alias. */
const twAnimateCssRoot = path.join(__dirname, "node_modules", "tw-animate-css");

/** @type {import("next").NextConfig} */
const nextConfig = {
  output: "standalone",
  outputFileTracingRoot: monorepoRoot,
  experimental: {
    webpackBuildWorker: false,
  },
  turbopack: {
    resolveAlias: {
      "tw-animate-css": twAnimateCssRoot,
    },
  },
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      "tw-animate-css": twAnimateCssRoot,
    };
    return config;
  },
};

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
  widenClientFileUpload: true,
  telemetry: false,
});
