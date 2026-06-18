# Multi-stage build: install + build with pnpm, run the standalone server on Node.
# The Astro Node adapter outputs dist/server/entry.mjs which is a self-contained
# HTTP server — no Astro CLI needed at runtime.

FROM node:24-alpine@sha256:5fa278c599dbba0c8f873d8717d50ecbb57c5ae6a53b7ab240c25135e0b65995 AS builder
WORKDIR /app

# Enable corepack so pnpm is available (Node 22+ ships with corepack).
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/frontend/package.json apps/frontend/
RUN pnpm install --frozen-lockfile --filter ki-norge-frontend

COPY apps/frontend apps/frontend
WORKDIR /app/apps/frontend
RUN pnpm run build

# ─── Runtime stage ──────────────────────────────────────────────────────────
FROM node:24-alpine@sha256:5fa278c599dbba0c8f873d8717d50ecbb57c5ae6a53b7ab240c25135e0b65995
WORKDIR /app

RUN corepack enable

# Production deps only at runtime; @astrojs/node bundles what it needs
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/frontend/package.json apps/frontend/
RUN pnpm install --frozen-lockfile --prod --filter ki-norge-frontend && pnpm store prune

WORKDIR /app/apps/frontend
COPY --from=builder /app/apps/frontend/dist ./dist

ENV HOST=0.0.0.0
ENV PORT=4321
ENV NODE_ENV=production
EXPOSE 4321

CMD ["node", "dist/server/entry.mjs"]
