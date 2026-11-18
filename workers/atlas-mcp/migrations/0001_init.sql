-- Atlas Studio MCP pilot (CIV-1840): invited testers, each with a private link, and a log of what they asked.
CREATE TABLE testers (
  name TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,   -- SHA-256 of the link's token; the token itself is shown once and never stored
  created_at TEXT NOT NULL,
  revoked_at TEXT
);

-- Every tool call with its arguments and the answer returned (Ryan, 2026-11-18), kept only to improve the tools and data.
CREATE TABLE calls (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL,
  tester TEXT NOT NULL,
  tool TEXT NOT NULL,
  args TEXT NOT NULL,                -- JSON, without the question
  question TEXT,                     -- the person's question as the assistant understood it; optional, not guaranteed
  ok INTEGER NOT NULL,
  result TEXT NOT NULL,              -- the answer text, or the error message
  ms INTEGER NOT NULL,
  release_id TEXT
);
CREATE INDEX calls_tester_at ON calls (tester, at);
