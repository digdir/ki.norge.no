#!/usr/bin/env node
// Viser hvilken .NET-versjon base-imagene i Dockerfile er låst til, og hvilken
// den samme taggen gir i dag. Digesten i Dockerfile sier ingenting om versjonen,
// så uten dette ser et image som er flere sikkerhetsoppdateringer bak, likt ut
// som et ferskt.
//
// Bruk: node scripts/dotnet-image-versjon.mjs

import { readFileSync } from 'node:fs';

const DOCKERFILE = new URL('../apps/cms-umbraco/Dockerfile', import.meta.url);
const REGISTER = 'https://mcr.microsoft.com/v2';
const INDEKS = 'application/vnd.oci.image.index.v1+json, application/vnd.docker.distribution.manifest.list.v2+json';
const MANIFEST = 'application/vnd.oci.image.manifest.v1+json, application/vnd.docker.distribution.manifest.v2+json';

async function hent(url, accept) {
  const svar = await fetch(url, { headers: { Accept: accept } });
  if (!svar.ok) throw new Error(`${url} svarte ${svar.status}`);
  return svar;
}

/** Versjon og byggedato for linux/amd64-varianten av en digest. */
async function versjon(repo, digest) {
  const indeks = await (await hent(`${REGISTER}/${repo}/manifests/${digest}`, INDEKS)).json();
  const amd64 = indeks.manifests.find((m) => m.platform?.os === 'linux' && m.platform?.architecture === 'amd64');
  const manifest = await (await hent(`${REGISTER}/${repo}/manifests/${amd64.digest}`, MANIFEST)).json();
  const config = await (await hent(`${REGISTER}/${repo}/blobs/${manifest.config.digest}`, '*/*')).json();
  const env = Object.fromEntries((config.config?.Env ?? []).map((e) => e.split('=')));
  const v = env.DOTNET_SDK_VERSION ? `SDK ${env.DOTNET_SDK_VERSION}, runtime ${env.DOTNET_VERSION}` : `runtime ${env.DOTNET_VERSION}`;
  return `${v} (bygget ${String(config.created).slice(0, 10)})`;
}

const linjer = readFileSync(DOCKERFILE, 'utf-8').matchAll(/^FROM mcr\.microsoft\.com\/([^:\s]+):(\S+)@(sha256:[0-9a-f]+)/gm);
let bak = false;
for (const [, repo, tagg, låst] of linjer) {
  const nå = (await hent(`${REGISTER}/${repo}/manifests/${tagg}`, INDEKS)).headers.get('docker-content-digest');
  const [vLåst, vNå] = await Promise.all([versjon(repo, låst), versjon(repo, nå)]);
  console.log(`${repo}:${tagg}`);
  console.log(`  låst:  ${vLåst}  ${låst.slice(7, 19)}`);
  console.log(`  i dag: ${vNå}  ${nå.slice(7, 19)}${låst === nå ? '  (lik)' : ''}`);
  if (låst !== nå) bak = true;
}
process.exit(bak ? 1 : 0);
