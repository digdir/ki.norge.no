#!/usr/bin/env node
/**
 * Generates the CMS mirror of content-routes from the single source in /shared.
 * Run from repo root: node scripts/sync-content-routes.js
 *
 * Why: the frontend reads /shared/content-routes.json directly, but the CMS
 * Docker build context is apps/cms-umbraco/ alone and cannot reach /shared at
 * build. So the file is mirrored into the CMS project. The mirror is generated (not in
 * git) and created by this script before every CMS build/run (locally via the pnpm
 * cms:* scripts, in CI before docker build / dotnet). Edit /shared, never the mirror.
 */
const fs = require('fs');
const path = require('path');

const sharedPath = path.join(__dirname, '../shared/content-routes.json');
const mirrorPath = path.join(__dirname, '../apps/cms-umbraco/content-routes.json');

const GENERATED_COMMENT =
  'GENERATED FILE - do not edit. Mirror of /shared/content-routes.json, created by ' +
  'scripts/sync-content-routes.js. Edit /shared/content-routes.json instead. ' +
  'The mirror exists because the CMS Docker build context is apps/cms-umbraco/ alone ' +
  'and cannot reach /shared at build.';

const src = JSON.parse(fs.readFileSync(sharedPath, 'utf8'));
// Keep the key order ($comment, patternSyntax, routes) but replace
// $comment with a generated-file warning. The CMS only reads "routes".
const out = { ...src, $comment: GENERATED_COMMENT };

fs.writeFileSync(mirrorPath, JSON.stringify(out, null, 2) + '\n');
console.log(`[sync-content-routes] ${path.relative(process.cwd(), mirrorPath)} updated from /shared`);
