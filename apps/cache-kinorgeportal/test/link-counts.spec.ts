import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { describe, it, expect, vi } from "vitest";
import worker from "../src/index";
import { KNOWN_ORIGINS, osloDay } from "../src/link-counts";
import { LINK_ORIGINS } from "../../frontend/src/lib/link-origin";

const BROWSER = {
	"Sec-Fetch-Mode": "navigate",
	"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36",
};

/** Records the statements the worker runs, as [sql, ...bound values]. */
function fakeDb(fail = false) {
	const calls: unknown[][] = [];
	const db = {
		prepare: (sql: string) => ({
			bind: (...values: unknown[]) => ({
				run: async () => {
					if (fail) throw new Error("database down");
					calls.push([sql, ...values]);
					return { success: true };
				},
			}),
		}),
	};
	return { db: db as unknown as D1Database, calls };
}

function setup(options: { status?: number; db?: D1Database | null } = {}) {
	const fetcher = {
		fetch: vi.fn(async (_req: Request) =>
			new Response("page", { status: options.status ?? 200, headers: { "Cache-Control": "public, s-maxage=3600" } }),
		),
	};
	const env = { FRONTEND: fetcher, ...(options.db ? { LINK_COUNTS: options.db } : {}) } as unknown as Env;
	return { env, fetcher };
}

async function get(env: Env, url: string, headers: Record<string, string> = BROWSER) {
	const ctx = createExecutionContext();
	const res = await worker.fetch(new Request(url, { headers }), env, ctx);
	await waitOnExecutionContext(ctx);
	return res;
}

describe("link counts", () => {
	it("the worker counts the same labels the frontend sets", () => {
		expect([...KNOWN_ORIGINS].sort()).toEqual([...LINK_ORIGINS].sort());
	});

	it("removes the label before the cache and the frontend, so both addresses share one entry", async () => {
		const { env, fetcher } = setup();

		await get(env, "https://test.local/lc-share?fra=meny");
		await get(env, "https://test.local/lc-share");

		expect(fetcher.fetch).toHaveBeenCalledTimes(1);
		expect(fetcher.fetch.mock.calls[0][0].url).toBe("https://test.local/lc-share");
	});

	it("keeps the page's own parameters", async () => {
		const { env, fetcher } = setup();

		await get(env, "https://test.local/lc-keep?tiltak=abc&fra=bunntekst");

		expect(fetcher.fetch.mock.calls[0][0].url).toBe("https://test.local/lc-keep?tiltak=abc");
	});

	it("adds one to the counter for the day, origin and page, also when the page comes from the cache", async () => {
		const { db, calls } = fakeDb();
		const { env } = setup({ db });

		await get(env, "https://test.local/lc-count?fra=meny");
		await get(env, "https://test.local/lc-count?fra=meny");

		expect(calls).toHaveLength(2);
		const [sql, day, origin, path] = calls[0];
		expect(sql).toContain("ON CONFLICT (day, origin, path) DO UPDATE SET count = count + 1");
		expect(day).toBe(osloDay(new Date()));
		expect([origin, path]).toEqual(["meny", "/lc-count"]);
	});

	it("stores nothing but the day, the origin and the page", async () => {
		const { db, calls } = fakeDb();
		const { env } = setup({ db });

		await get(env, "https://test.local/lc-only?fra=logo", { ...BROWSER, "CF-Connecting-IP": "203.0.113.7" });

		expect(calls[0].slice(1)).toEqual([osloDay(new Date()), "logo", "/lc-only"]);
		expect(JSON.stringify(calls)).not.toContain("203.0.113.7");
		expect(JSON.stringify(calls)).not.toContain("Mozilla");
	});

	it.each([
		["a crawler", { ...BROWSER, "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)" }],
		["a headless browser", { ...BROWSER, "User-Agent": "Mozilla/5.0 HeadlessChrome/141.0" }],
		["no user agent", { "Sec-Fetch-Mode": "navigate" }],
		["a prefetch", { ...BROWSER, "Sec-Purpose": "prefetch" }],
		["a fetch() call", { ...BROWSER, "Sec-Fetch-Mode": "cors" }],
	])("does not count %s", async (_name, headers) => {
		const { db, calls } = fakeDb();
		const { env } = setup({ db });

		await get(env, `https://test.local/lc-skip-${Math.random()}?fra=meny`, headers as Record<string, string>);

		expect(calls).toHaveLength(0);
	});

	it("removes but does not count a label the frontend never sets", async () => {
		const { db, calls } = fakeDb();
		const { env, fetcher } = setup({ db });

		await get(env, "https://test.local/lc-unknown?fra=noe-oppdiktet");

		expect(fetcher.fetch.mock.calls[0][0].url).toBe("https://test.local/lc-unknown");
		expect(calls).toHaveLength(0);
	});

	it("does not count a page that does not exist", async () => {
		const { db, calls } = fakeDb();
		const { env } = setup({ db, status: 404 });

		await get(env, "https://test.local/lc-missing?fra=meny");

		expect(calls).toHaveLength(0);
	});

	it("serves the page when the counter fails, and when there is no database", async () => {
		const failing = setup({ db: fakeDb(true).db });
		expect((await get(failing.env, "https://test.local/lc-fail?fra=meny")).status).toBe(200);

		const without = setup({ db: null });
		expect((await get(without.env, "https://test.local/lc-nodb?fra=meny")).status).toBe(200);
	});

	it("the day follows Norwegian time", () => {
		expect(osloDay(new Date("2026-10-21T22:30:00Z"))).toBe("2026-10-22");
		expect(osloDay(new Date("2026-07-01T21:59:00Z"))).toBe("2026-07-01");
	});
});
