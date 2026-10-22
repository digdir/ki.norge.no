-- One row per day, origin and destination page. The table holds counts only, never
-- single clicks. See docs/adr/2026-10-22-link-statistics.md.
CREATE TABLE IF NOT EXISTS link_counts (
  day TEXT NOT NULL,
  origin TEXT NOT NULL,
  path TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, origin, path)
);
