#!/usr/bin/env bash
# Upload the current checkout as a new version of the tt02 frontend worker,
# without deploying it, and print a stable link for design review.
#
# Usage: bash scripts/review-link.sh [pr-number | alias]
#   Without an argument the open PR for the current branch is used.
#
# tt02 keeps serving its current version. The link shows tt02 content, is not
# indexed (tt02 robots.txt), and the KI-tiltak form cannot be sent from it
# (Turnstile is bound to the real hostnames).
#
# Locally this uses your wrangler login. In CI it uses CLOUDFLARE_API_TOKEN.

set -euo pipefail

fail() { echo "ERROR: $*" >&2; exit 1; }

ROOT="$(git rev-parse --show-toplevel)"
ARG="${1:-}"

if [ -z "$ARG" ]; then
  command -v gh >/dev/null || fail "gh is missing. Pass a PR number or an alias."
  ARG="$(gh pr view --json number --jq .number 2>/dev/null)" || fail "No open PR for this branch. Pass a PR number or an alias."
fi

if [[ "$ARG" =~ ^[0-9]+$ ]]; then
  ALIAS="pr-$ARG"
  MESSAGE="Review link for PR #$ARG at $(git rev-parse --short HEAD), not deployed"
else
  ALIAS="$(echo "$ARG" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9-]+/-/g; s/^-+|-+$//g' | cut -c1-30)"
  MESSAGE="Review link $ALIAS at $(git rev-parse --short HEAD), not deployed"
fi
[ -n "$ALIAS" ] || fail "Could not make an alias from '$ARG'."

if [ -z "${CI:-}" ] && [ -n "$(git status --porcelain)" ]; then
  echo "Note: the working tree has uncommitted changes, and they are included." >&2
fi

cd "$ROOT/apps/frontend"
echo "Building $(git rev-parse --short HEAD) for tt02..."
CLOUDFLARE_ENV=tt02 pnpm exec astro build >/dev/null

echo "Uploading as alias $ALIAS (tt02 keeps its current version)..."
OUT="$(pnpm exec wrangler versions upload --env tt02 --preview-alias "$ALIAS" --message "$MESSAGE" 2>&1)" || { echo "$OUT" >&2; fail "Upload failed."; }

URL="$(echo "$OUT" | grep -oE 'Version Preview Alias URL: https://[^ ]+' | awk '{print $NF}')"
[ -n "$URL" ] || { echo "$OUT" >&2; fail "Upload finished, but no alias URL was printed."; }

echo "$URL"
if [ -n "${GITHUB_OUTPUT:-}" ]; then
  echo "url=$URL" >> "$GITHUB_OUTPUT"
fi
