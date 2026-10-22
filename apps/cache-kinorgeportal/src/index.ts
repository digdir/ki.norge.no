import { countLinkUse, isCountable, osloDay, takeOrigin } from "./link-counts";

// Preview is carried by a cookie, and the cache looks up on the URL alone. Without
// this the editor got the published page from the cache on the first click inside
// the backoffice frame. The frontend checks the value. A fake cookie only gets published
// content straight from origin, just as a new query parameter does.
// Same name as PREVIEW_COOKIE in apps/frontend/src/lib/preview.ts.
function hasPreviewCookie(request: Request): boolean {
	const cookie = request.headers.get("Cookie") ?? "";
	return cookie.split(";").some((part) => part.trim().startsWith("preview="));
}

// ki.norge.no answered 200 on plain http, and the whole visit could continue there.
// norge.no is not HSTS-preloaded, and the HSTS header the frontend sets only works
// once the page has been loaded over https.
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1"]);

export default {
	async fetch(request, env, ctx): Promise<Response> {
		const requestUrl = new URL(request.url);
		if (requestUrl.protocol === "http:" && !LOCAL_HOSTS.has(requestUrl.hostname)) {
			requestUrl.protocol = "https:";
			return Response.redirect(requestUrl.toString(), 301);
		}

		try {
			if (request.method !== "GET" || hasPreviewCookie(request)) {
				return await env.FRONTEND.fetch(request);
			}
		} catch (error) {
			throw new Error(`Failed to fetch uncached request from origin: ${error}`);
		}

		const url = new URL(request.url);
		// The link label is taken out before the cache and the frontend see the address.
		const origin = takeOrigin(url);
		const upstream = origin === null ? request : new Request(url.toString(), request);

		const cacheKey = new Request(url.toString(), {
			headers: request.headers,
			method: "GET",
		});

		const cache = caches.default;
		let response;

		try {
			response = await cache.match(cacheKey);
		} catch (error) {
			throw new Error(`Failed to check cache match: ${error}`);
		}

		if (!response) {
			try {
				response = await env.FRONTEND.fetch(upstream);
			} catch (error) {
				throw new Error(`Failed to fetch GET-request from origin: ${error}`);
			}

			// Respect no-store/private from origin. Preview and degraded/failed
			// renders (CMS fetch failed) send these directives, and they must never
			// be stored at the edge. Otherwise one unlucky response is served to ALL visitors,
			// not just the one who triggered it. Applies to every user equally.
			const cacheControl = response.headers.get("Cache-Control") || "";
			const mayCache = !/\b(no-store|private)\b/i.test(cacheControl);

			if (response.ok && mayCache) {
				try {
					ctx.waitUntil(cache.put(cacheKey, response.clone()));
				} catch (error) {
					throw new Error(`Failed to put response in cache: ${error}`);
				}
			}
		}

		// Counted after the response, so a label on an address that does not exist is
		// never stored. A failed count must not affect the page.
		const linkCounts = env.LINK_COUNTS;
		if (origin !== null && linkCounts && response.status >= 200 && response.status < 400 && isCountable(request)) {
			ctx.waitUntil(
				countLinkUse(linkCounts, osloDay(new Date()), origin, url.pathname).catch((error) =>
					console.warn("Link count failed", error),
				),
			);
		}

		return response;
	},
} satisfies ExportedHandler<Env>;
