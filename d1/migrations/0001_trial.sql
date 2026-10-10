-- The daily trial's leaderboard (Cloudflare D1). Applied by
-- `wrangler d1 migrations apply STARWARD_DB --remote` (see the README).

-- A callsign belongs to the browser that first posted with it: `secret` is a
-- hash of that browser's random pilot key.
CREATE TABLE IF NOT EXISTS pilots (
  key TEXT PRIMARY KEY,
  callsign TEXT NOT NULL,
  secret TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

-- Each pilot's best time per UTC day, in milliseconds.
CREATE TABLE IF NOT EXISTS runs (
  day TEXT NOT NULL,
  key TEXT NOT NULL,
  time_ms INTEGER NOT NULL,
  posted_at INTEGER NOT NULL,
  PRIMARY KEY (day, key)
);
CREATE INDEX IF NOT EXISTS runs_by_time ON runs (day, time_ms);

-- Recent posts per network, for rate limiting. `ip` is a salted hash that
-- changes daily; rows older than a day are deleted as new posts arrive.
CREATE TABLE IF NOT EXISTS posts (
  ip TEXT NOT NULL,
  at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS posts_by_ip ON posts (ip, at);
