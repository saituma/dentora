# ---- Build Stage ----
FROM node:22-alpine AS builder

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy workspace config
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json turbo.json ./

# Copy shared package
COPY packages/shared/ packages/shared/

# Copy server package
COPY apps/server/ apps/server/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Build shared package first, then server
RUN pnpm --filter @repo/shared build 2>/dev/null || true
RUN pnpm --filter @repo/server build

# ---- Production Stage ----
FROM node:22-alpine AS runner

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

ENV NODE_ENV=production

# Copy workspace config
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./

# Copy built shared package
COPY --from=builder /app/packages/shared/ packages/shared/

# Copy built server
COPY --from=builder /app/apps/server/package.json apps/server/package.json
COPY --from=builder /app/apps/server/dist/ apps/server/dist/
COPY --from=builder /app/apps/server/drizzle/ apps/server/drizzle/
COPY --from=builder /app/apps/server/drizzle.config.ts apps/server/drizzle.config.ts

# Install production dependencies only
RUN pnpm install --frozen-lockfile --prod

# Non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 appuser
USER appuser

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3001/api/health || exit 1

CMD ["node", "apps/server/dist/index.js"]
