# Multi-stage build: install + build on Node, run the standalone server on Node.
# The Astro Node adapter outputs dist/server/entry.mjs which is a self-contained
# HTTP server — no Astro CLI needed at runtime.

FROM node:22-alpine AS builder
WORKDIR /app

# Copy lockfile + manifest first for layer caching
COPY package.json package-lock.json ./
RUN npm ci

# Build the Astro site
COPY . .
RUN npm run build

# ─── Runtime stage ──────────────────────────────────────────────────────────
FROM node:22-alpine
WORKDIR /app

# Production deps only at runtime; @astrojs/node bundles what it needs
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder /app/dist ./dist

ENV HOST=0.0.0.0
ENV PORT=4321
ENV NODE_ENV=production
EXPOSE 4321

CMD ["node", "dist/server/entry.mjs"]
