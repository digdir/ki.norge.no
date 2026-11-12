interface Env {
	FRONTEND: Fetcher;
	/**
	 * Link statistics, see src/link-counts.ts. Optional: without the binding the label is
	 * still removed from the address, but nothing is counted.
	 */
	LINK_COUNTS?: D1Database;
}
