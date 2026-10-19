import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.ts";

const env = { ORIGIN: "https://origin.test" };
let seen: Request[] = [];

beforeEach(() => {
  seen = [];
  globalThis.fetch = async (input: RequestInfo | URL) => {
    seen.push(input as Request);
    return new Response("from origin", { status: 200 });
  };
});

const call = (url: string) => worker.fetch(new Request(url), env as never, {} as never);

test("http is sent to https with the same path and query, without reaching origin", async () => {
  const res = await call("http://cms.ki.norge.no/umbraco/login?returnUrl=%2Fumbraco");
  assert.equal(res.status, 301);
  assert.equal(res.headers.get("Location"), "https://cms.ki.norge.no/umbraco/login?returnUrl=%2Fumbraco");
  assert.equal(seen.length, 0);
});

test("https responses get HSTS", async () => {
  const res = await call("https://cms.ki.norge.no/umbraco");
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("Strict-Transport-Security"), "max-age=31536000");
  assert.equal(seen.length, 1);
});

test("localhost skips the redirect, so wrangler dev works", async () => {
  const res = await call("http://localhost:8787/umbraco");
  assert.equal(res.status, 200);
});

test("media without Cache-Control still gets one week in the browser", async () => {
  const res = await call("https://cms.ki.norge.no/media/abc/bilde.png");
  assert.equal(res.headers.get("Cache-Control"), "public, max-age=604800");
});

test("SVG from media gets a CSP that stops scripts, and nosniff", async () => {
  globalThis.fetch = async () =>
    new Response("<svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script></svg>", {
      status: 200,
      headers: { "Content-Type": "image/svg+xml" },
    });
  const res = await call("https://cms.ki.norge.no/media/abc/illustrasjon.svg");
  const csp = res.headers.get("Content-Security-Policy") ?? "";
  assert.match(csp, /\bsandbox\b/);
  assert.match(csp, /default-src 'none'/);
  assert.equal(res.headers.get("X-Content-Type-Options"), "nosniff");
});

// sandbox makes Chrome refuse to show PDFs, so the CSP only applies to SVG.
test("PDF and images from media get nosniff, but no CSP", async () => {
  globalThis.fetch = async () =>
    new Response("%PDF-1.7", { status: 200, headers: { "Content-Type": "application/pdf" } });
  const res = await call("https://cms.ki.norge.no/media/abc/rapport.pdf");
  assert.equal(res.headers.get("Content-Security-Policy"), null);
  assert.equal(res.headers.get("X-Content-Type-Options"), "nosniff");
});

test("backoffice gets no media CSP", async () => {
  globalThis.fetch = async () =>
    new Response("<html></html>", { status: 200, headers: { "Content-Type": "text/html" } });
  const res = await call("https://cms.ki.norge.no/umbraco");
  assert.equal(res.headers.get("Content-Security-Policy"), null);
});
