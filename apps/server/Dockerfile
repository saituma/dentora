# ---- Build Stage ----
FROM node:22-alpine AS builder

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy workspace config
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./

# Copy shared package
COPY packages/shared/ packages/shared/

# Copy server package
COPY apps/server/ apps/server/

# Install all dependencies (including devDependencies for the build step)
RUN pnpm install --frozen-lockfile

# Build server (shared is consumed as raw TS via "main": "src/index.ts",
# so it does not need a separate build step — tsc resolves the .ts sources)
RUN pnpm --filter @repo/server build

# ---- Production Stage ----
FROM node:22-alpine AS runner

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

ENV NODE_ENV=production

# Copy workspace config
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./

# Copy shared package (raw TS sources — resolved at build time, not runtime)
COPY --from=builder /app/packages/shared/ packages/shared/

# Copy built server
COPY --from=builder /app/apps/server/package.json apps/server/package.json
COPY --from=builder /app/apps/server/dist/ apps/server/dist/
COPY --from=builder /app/apps/server/drizzle/ apps/server/drizzle/

# Install production dependencies only
RUN pnpm install --frozen-lockfile --prod

# Non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 appuser
USER appuser

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:4000/api/health || exit 1

CMD ["node", "apps/server/dist/index.js"]
