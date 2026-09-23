import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { describe, it, expect, vi } from "vitest";
import worker from "../src/index";

function mockEnv(handler: (req: Request) => Response | Promise<Response>) {
	const fetcher = { fetch: vi.fn(async (req: Request) => handler(req)) };
	return { env: { FRONTEND: fetcher } as unknown as Env, fetcher };
}

describe("frontend-cache", () => {
	it("caches GET: first call fetches origin, second identical call is served from cache", async () => {
		const { env, fetcher } = mockEnv(
			() => new Response("origin-body", { status: 200, headers: { "Cache-Control": "public, s-maxage=3600" } }),
		);

		const ctx1 = createExecutionContext();
		const res1 = await worker.fetch(new Request("https://test.local/hit-1"), env, ctx1);
		await waitOnExecutionContext(ctx1);
		expect(await res1.text()).toBe("origin-body");

		const ctx2 = createExecutionContext();
		const res2 = await worker.fetch(new Request("https://test.local/hit-1"), env, ctx2);
		await waitOnExecutionContext(ctx2);
		expect(await res2.text()).toBe("origin-body");

		expect(fetcher.fetch).toHaveBeenCalledTimes(1);
	});

	it("non-GET bypasses cache: POST is always forwarded to origin", async () => {
		const { env, fetcher } = mockEnv(() => new Response("posted", { status: 200 }));

		const ctx1 = createExecutionContext();
		await worker.fetch(new Request("https://test.local/post-1", { method: "POST", body: "x" }), env, ctx1);
		await waitOnExecutionContext(ctx1);

		const ctx2 = createExecutionContext();
		await worker.fetch(new Request("https://test.local/post-1", { method: "POST", body: "x" }), env, ctx2);
		await waitOnExecutionContext(ctx2);

		expect(fetcher.fetch).toHaveBeenCalledTimes(2);
	});

	it("no-store/private responses are not cached: preview and degraded renders always reach origin", async () => {
		const { env, fetcher } = mockEnv(() => new Response("draft-or-degraded", { status: 200, headers: { "Cache-Control": "private, no-store" } }));

		const ctx1 = createExecutionContext();
		await worker.fetch(new Request("https://test.local/no-store-1"), env, ctx1);
		await waitOnExecutionContext(ctx1);

		const ctx2 = createExecutionContext();
		await worker.fetch(new Request("https://test.local/no-store-1"), env, ctx2);
		await waitOnExecutionContext(ctx2);

		expect(fetcher.fetch).toHaveBeenCalledTimes(2);
	});

	it("non-2xx responses are not cached: 500 hits origin every time", async () => {
		const { env, fetcher } = mockEnv(() => new Response("err", { status: 500, headers: { "Cache-Control": "public, s-maxage=3600" } }));

		const ctx1 = createExecutionContext();
		await worker.fetch(new Request("https://test.local/err-1"), env, ctx1);
		await waitOnExecutionContext(ctx1);

		const ctx2 = createExecutionContext();
		await worker.fetch(new Request("https://test.local/err-1"), env, ctx2);
		await waitOnExecutionContext(ctx2);

		expect(fetcher.fetch).toHaveBeenCalledTimes(2);
	});

	it("preview cookie goes straight to origin, and the draft is never stored for anyone else", async () => {
		const { env, fetcher } = mockEnv((req) =>
			(req.headers.get("Cookie") ?? "").includes("preview=")
				? new Response("kladd", { status: 200, headers: { "Cache-Control": "private, no-store" } })
				: new Response("publisert", { status: 200, headers: { "Cache-Control": "public, s-maxage=3600" } }),
		);
		const get = async (cookie?: string) => {
			const ctx = createExecutionContext();
			const headers = cookie ? { Cookie: cookie } : undefined;
			const res = await worker.fetch(new Request("https://test.local/preview-1", { headers }), env, ctx);
			await waitOnExecutionContext(ctx);
			return res.text();
		};

		expect(await get()).toBe("publisert");
		expect(await get("ki_admin=x; preview=hemmelig")).toBe("kladd");
		expect(await get()).toBe("publisert");

		expect(fetcher.fetch).toHaveBeenCalledTimes(2);
	});

	it("other cookies that merely contain the word are still served from cache", async () => {
		const { env, fetcher } = mockEnv(
			() => new Response("publisert", { status: 200, headers: { "Cache-Control": "public, s-maxage=3600" } }),
		);
		for (const cookie of [undefined, "xpreview=1", "preview_seen=1"]) {
			const ctx = createExecutionContext();
			const headers = cookie ? { Cookie: cookie } : undefined;
			await worker.fetch(new Request("https://test.local/preview-2", { headers }), env, ctx);
			await waitOnExecutionContext(ctx);
		}

		expect(fetcher.fetch).toHaveBeenCalledTimes(1);
	});
});
