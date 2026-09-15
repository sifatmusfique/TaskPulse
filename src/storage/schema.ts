export const CREATE_JOBS_TABLE = `
CREATE TABLE IF NOT EXISTS taskpulse_jobs (
  id TEXT PRIMARY KEY,
  queue_name TEXT NOT NULL,
  name TEXT NOT NULL,
  payload TEXT NOT NULL,
  result TEXT DEFAULT NULL,
  state TEXT NOT NULL CHECK (state IN ('pending', 'active', 'completed', 'failed', 'dead')),
  priority INTEGER NOT NULL DEFAULT 0,
  run_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  backoff_ms INTEGER NOT NULL DEFAULT 1000,
  backoff_strategy TEXT NOT NULL DEFAULT 'exponential',
  timeout_ms INTEGER NOT NULL DEFAULT 30000,
  error TEXT DEFAULT NULL,
  stack_trace TEXT DEFAULT NULL,
  cron TEXT DEFAULT NULL,
  unique_key TEXT DEFAULT NULL,
  locked_by TEXT DEFAULT NULL,
  heartbeat_at INTEGER DEFAULT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  finished_at INTEGER DEFAULT NULL
);

CREATE INDEX IF NOT EXISTS idx_taskpulse_poll 
ON taskpulse_jobs (queue_name, state, run_at, priority DESC, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_taskpulse_heartbeat 
ON taskpulse_jobs (state, heartbeat_at);

CREATE UNIQUE INDEX IF NOT EXISTS idx_taskpulse_unique_pending 
ON taskpulse_jobs (queue_name, unique_key) 
WHERE unique_key IS NOT NULL AND state IN ('pending', 'active');
`;
