// Forhåndsvisning bæres av en cookie, og cachen slår opp på URL-en alene. Uten
// dette fikk redaktøren den publiserte siden fra cachen ved første klikk inne i
// backoffice-ramma. Frontend sjekker verdien. En falsk cookie gir bare publisert
// innhold rett fra origin, slik en ny query-parameter også gjør.
// Samme navn som PREVIEW_COOKIE i apps/frontend/src/lib/preview.ts.
function hasPreviewCookie(request: Request): boolean {
	const cookie = request.headers.get("Cookie") ?? "";
	return cookie.split(";").some((part) => part.trim().startsWith("preview="));
}

export default {
	async fetch(request, env, ctx): Promise<Response> {
		try {
			if (request.method !== "GET" || hasPreviewCookie(request)) {
				return await env.FRONTEND.fetch(request);
			}
		} catch (error) {
			throw new Error(`Failed to fetch uncached request from origin: ${error}`);
		}

		const url = new URL(request.url);

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
				response = await env.FRONTEND.fetch(request);
			} catch (error) {
				throw new Error(`Failed to fetch GET-request from origin: ${error}`);
			}

			// Respekter no-store/private fra origin. Preview og degraderte/feilede
			// renders (CMS-henting feilet) sender disse direktivene, og de skal aldri
			// lagres på edgen — ellers serveres ett uheldig svar til ALLE besøkende,
			// ikke bare den som utløste det. Gjelder hver bruker likt.
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

		return response;
	},
} satisfies ExportedHandler<Env>;
