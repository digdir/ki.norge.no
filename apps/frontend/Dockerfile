# Multi-stage build: install + build with pnpm, run the standalone server on Node.
# The Astro Node adapter outputs dist/server/entry.mjs which is a self-contained
# HTTP server — no Astro CLI needed at runtime.

FROM node:22-alpine AS builder
WORKDIR /app

# Enable corepack so pnpm is available (Node 22+ ships with corepack).
RUN corepack enable

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm run build

# ─── Runtime stage ──────────────────────────────────────────────────────────
FROM node:22-alpine
WORKDIR /app

RUN corepack enable

# Production deps only at runtime; @astrojs/node bundles what it needs
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod && pnpm store prune

COPY --from=builder /app/dist ./dist

ENV HOST=0.0.0.0
ENV PORT=4321
ENV NODE_ENV=production
EXPOSE 4321

CMD ["node", "dist/server/entry.mjs"]
