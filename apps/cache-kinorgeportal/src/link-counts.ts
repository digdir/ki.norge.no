// Counts how often a labelled link is used, as one number per day, origin and
// destination page. A single click is never stored: the request adds 1 to a counter,
// and nothing about the visitor is read or kept, not the IP address, the user agent
// or the time of day. Why this needs no consent: docs/adr/2026-10-22-link-statistics.md.

/** Same name as ORIGIN_PARAM in apps/frontend/src/lib/link-origin.ts. */
export const ORIGIN_PARAM = "fra";

/**
 * Same values as LINK_ORIGINS in apps/frontend/src/lib/link-origin.ts, checked by a
 * test. Anything else is removed from the address but not counted, so a made-up
 * label cannot fill the table.
 */
export const KNOWN_ORIGINS: ReadonlySet<string> = new Set(["meny", "meny-mobil", "logo", "bunntekst"]);

const MAX_PATH_LENGTH = 200;

// Crawlers follow every menu link, so without this they would outnumber people.
// The user agent is only matched here and never stored.
const BOT_USER_AGENT = /bot|crawl|spider|slurp|preview|scan|monitor|headless|lighthouse|curl|wget|python|httpclient|java\/|go-http|okhttp/i;

/**
 * Removes the origin from the address and returns it. The cache and the frontend then
 * see the same address with or without a label, so publishing purges one entry, not one
 * per label.
 */
export function takeOrigin(url: URL): string | null {
	const origin = url.searchParams.get(ORIGIN_PARAM);
	if (origin === null) return null;
	url.searchParams.delete(ORIGIN_PARAM);
	return origin;
}

/**
 * Only page loads a person started. Prefetches would count a hover as a click, and
 * fetch() calls are not link use.
 */
export function isCountable(request: Request): boolean {
	const mode = request.headers.get("Sec-Fetch-Mode");
	if (mode !== null && mode !== "navigate") return false;

	const purpose = `${request.headers.get("Sec-Purpose") ?? ""} ${request.headers.get("Purpose") ?? ""}`;
	if (/prefetch|prerender/i.test(purpose)) return false;

	const userAgent = request.headers.get("User-Agent") ?? "";
	return userAgent !== "" && !BOT_USER_AGENT.test(userAgent);
}

/** The date in Norway, so a click just after midnight lands on the right day. */
export function osloDay(date: Date): string {
	return new Intl.DateTimeFormat("sv-SE", {
		timeZone: "Europe/Oslo",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).format(date);
}

export async function countLinkUse(db: D1Database, day: string, origin: string, path: string): Promise<void> {
	if (!KNOWN_ORIGINS.has(origin) || path.length > MAX_PATH_LENGTH) return;
	await db
		.prepare(
			"INSERT INTO link_counts (day, origin, path, count) VALUES (?1, ?2, ?3, 1) " +
				"ON CONFLICT (day, origin, path) DO UPDATE SET count = count + 1",
		)
		.bind(day, origin, path)
		.run();
}
