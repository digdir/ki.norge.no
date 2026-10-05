import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.ts";

const env = { ORIGIN: "https://origin.test" };
let seen: Request[] = [];

beforeEach(() => {
  seen = [];
  globalThis.fetch = async (input: RequestInfo | URL) => {
    seen.push(input as Request);
    return new Response("fra origin", { status: 200 });
  };
});

const call = (url: string) => worker.fetch(new Request(url), env as never, {} as never);

test("http sendes til https med samme sti og query, uten å nå origin", async () => {
  const res = await call("http://cms.ki.norge.no/umbraco/login?returnUrl=%2Fumbraco");
  assert.equal(res.status, 301);
  assert.equal(res.headers.get("Location"), "https://cms.ki.norge.no/umbraco/login?returnUrl=%2Fumbraco");
  assert.equal(seen.length, 0);
});

test("https-svar får HSTS", async () => {
  const res = await call("https://cms.ki.norge.no/umbraco");
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("Strict-Transport-Security"), "max-age=31536000");
  assert.equal(seen.length, 1);
});

test("localhost slipper redirecten, så wrangler dev virker", async () => {
  const res = await call("http://localhost:8787/umbraco");
  assert.equal(res.status, 200);
});

test("media uten Cache-Control får fortsatt en uke i nettleseren", async () => {
  const res = await call("https://cms.ki.norge.no/media/abc/bilde.png");
  assert.equal(res.headers.get("Cache-Control"), "public, max-age=604800");
});
