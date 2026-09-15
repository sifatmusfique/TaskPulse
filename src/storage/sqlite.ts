import Database, { Database as DatabaseType } from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { Job, JobOptions, JobRecord, JobState, QueueStats } from '../types.js';
import { CREATE_JOBS_TABLE } from './schema.js';

export class SQLiteStorage {
  public db: DatabaseType;

  constructor(dbPath: string = 'taskpulse.db') {
    this.db = new Database(dbPath);
    this.initPragmas();
    this.initSchema();
  }

  private initPragmas(): void {
    // Enable Write-Ahead Logging for high concurrency and write speed
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');
    this.db.pragma('busy_timeout = 5000');
    this.db.pragma('cache_size = -64000'); // 64MB cache
    this.db.pragma('temp_store = MEMORY');
  }

  private initSchema(): void {
    this.db.exec(CREATE_JOBS_TABLE);
  }

  public recordToJob<T = unknown, R = unknown>(row: JobRecord): Job<T, R> {
    let data: T;
    let result: R | undefined;

    try {
      data = JSON.parse(row.payload) as T;
    } catch {
      data = row.payload as unknown as T;
    }

    if (row.result !== null) {
      try {
        result = JSON.parse(row.result) as R;
      } catch {
        result = row.result as unknown as R;
      }
    }

    return {
      id: row.id,
      queueName: row.queue_name,
      name: row.name,
      data,
      result,
      state: row.state,
      priority: row.priority,
      runAt: new Date(row.run_at),
      attempts: row.attempts,
      maxAttempts: row.max_attempts,
      backoffMs: row.backoff_ms,
      backoffStrategy: row.backoff_strategy,
      timeoutMs: row.timeout_ms,
      error: row.error ?? undefined,
      stackTrace: row.stack_trace ?? undefined,
      cron: row.cron ?? undefined,
      uniqueKey: row.unique_key ?? undefined,
      lockedBy: row.locked_by ?? undefined,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      finishedAt: row.finished_at ? new Date(row.finished_at) : undefined,
    };
  }

  public insertJob<T = unknown>(
    queueName: string,
    name: string,
    payload: T,
    options: JobOptions = {}
  ): Job<T> {
    const id = randomUUID();
    const now = Date.now();
    const runAt = options.runAt ? options.runAt.getTime() : now + (options.delay || 0);

    const stmt = this.db.prepare(`
      INSERT INTO taskpulse_jobs (
        id, queue_name, name, payload, state, priority, run_at,
        max_attempts, backoff_ms, backoff_strategy, timeout_ms,
        cron, unique_key, created_at, updated_at
      ) VALUES (
        @id, @queue_name, @name, @payload, 'pending', @priority, @run_at,
        @max_attempts, @backoff_ms, @backoff_strategy, @timeout_ms,
        @cron, @unique_key, @created_at, @updated_at
      )
    `);

    const record: Partial<JobRecord> = {
      id,
      queue_name: queueName,
      name,
      payload: JSON.stringify(payload),
      priority: options.priority ?? 0,
      run_at: runAt,
      max_attempts: options.maxAttempts ?? 3,
      backoff_ms: options.backoffMs ?? 1000,
      backoff_strategy: options.backoffStrategy ?? 'exponential',
      timeout_ms: options.timeoutMs ?? 30000,
      cron: options.cron ?? null,
      unique_key: options.uniqueKey ?? null,
      created_at: now,
      updated_at: now,
    };

    try {
      stmt.run(record);
    } catch (err: unknown) {
      if (err instanceof Error && err.message.includes('UNIQUE constraint failed')) {
        // Find existing job if unique_key collision
        const existing = this.db.prepare(`
          SELECT * FROM taskpulse_jobs 
          WHERE queue_name = ? AND unique_key = ? AND state IN ('pending', 'active')
        `).get(queueName, options.uniqueKey) as JobRecord;

        if (existing) {
          return this.recordToJob<T>(existing);
        }
      }
      throw err;
    }

    const created = this.db.prepare('SELECT * FROM taskpulse_jobs WHERE id = ?').get(id) as JobRecord;
    return this.recordToJob<T>(created);
  }

  public insertBatch<T = unknown>(
    queueName: string,
    jobs: Array<{ name: string; data: T; options?: JobOptions }>
  ): Job<T>[] {
    const insertTx = this.db.transaction((items: Array<{ name: string; data: T; options?: JobOptions }>) => {
      return items.map(item => this.insertJob(queueName, item.name, item.data, item.options));
    });
    return insertTx(jobs);
  }

  /**
   * Concurrency-safe atomic job claiming query.
   * Locks and claims the next available candidate jobs for a specific worker.
   */
  public claimJobs<T = unknown, R = unknown>(
    queueName: string,
    workerId: string,
    limit: number
  ): Job<T, R>[] {
    const now = Date.now();

    const claimTx = this.db.transaction(() => {
      // Find candidate job IDs matching eligibility criteria
      const candidates = this.db.prepare(`
        SELECT id FROM taskpulse_jobs
        WHERE queue_name = ? AND state = 'pending' AND run_at <= ?
        ORDER BY priority DESC, created_at ASC
        LIMIT ?
      `).all(queueName, now, limit) as { id: string }[];

      if (candidates.length === 0) {
        return [];
      }

      const ids = candidates.map(c => c.id);
      const placeholders = ids.map(() => '?').join(',');

      // Atomically update state to active and bind to workerId
      this.db.prepare(`
        UPDATE taskpulse_jobs
        SET state = 'active',
            locked_by = ?,
            heartbeat_at = ?,
            updated_at = ?
        WHERE id IN (${placeholders}) AND state = 'pending'
      `).run(workerId, now, now, ...ids);

      // Fetch the claimed records
      const claimedRows = this.db.prepare(`
        SELECT * FROM taskpulse_jobs
        WHERE id IN (${placeholders}) AND locked_by = ?
        ORDER BY priority DESC, created_at ASC
      `).all(...ids, workerId) as JobRecord[];

      return claimedRows.map(row => this.recordToJob<T, R>(row));
    });

    return claimTx();
  }

  public completeJob<R = unknown>(id: string, result: R): void {
    const now = Date.now();
    const resultJson = result !== undefined ? JSON.stringify(result) : null;

    this.db.prepare(`
      UPDATE taskpulse_jobs
      SET state = 'completed',
          result = ?,
          locked_by = NULL,
          heartbeat_at = NULL,
          updated_at = ?,
          finished_at = ?
      WHERE id = ?
    `).run(resultJson, now, now, id);
  }

  public failJob(
    id: string,
    error: Error
  ): { state: JobState; nextRunAt?: Date; attempts: number } {
    const now = Date.now();
    const jobRow = this.db.prepare('SELECT * FROM taskpulse_jobs WHERE id = ?').get(id) as JobRecord | undefined;
    if (!jobRow) {
      throw new Error(`Job ${id} not found`);
    }

    const attempts = jobRow.attempts + 1;
    const maxAttempts = jobRow.max_attempts;

    if (attempts >= maxAttempts) {
      // Move to Dead Letter Queue (DLQ)
      this.db.prepare(`
        UPDATE taskpulse_jobs
        SET state = 'dead',
            attempts = ?,
            error = ?,
            stack_trace = ?,
            locked_by = NULL,
            heartbeat_at = NULL,
            updated_at = ?,
            finished_at = ?
        WHERE id = ?
      `).run(attempts, error.message, error.stack || null, now, now, id);

      return { state: 'dead', attempts };
    } else {
      // Calculate backoff with jitter
      let backoff = jobRow.backoff_ms;
      if (jobRow.backoff_strategy === 'exponential') {
        backoff = jobRow.backoff_ms * Math.pow(2, attempts - 1);
      }
      // Add +/- 20% random jitter to avoid thundering herd
      const jitter = (Math.random() * 0.4 - 0.2) * backoff;
      const nextRunAtMs = now + Math.max(100, Math.round(backoff + jitter));

      this.db.prepare(`
        UPDATE taskpulse_jobs
        SET state = 'pending',
            attempts = ?,
            run_at = ?,
            error = ?,
            stack_trace = ?,
            locked_by = NULL,
            heartbeat_at = NULL,
            updated_at = ?
        WHERE id = ?
      `).run(attempts, nextRunAtMs, error.message, error.stack || null, now, id);

      return { state: 'pending', nextRunAt: new Date(nextRunAtMs), attempts };
    }
  }

  public updateHeartbeats(workerId: string, jobIds: string[]): void {
    if (jobIds.length === 0) return;
    const now = Date.now();
    const placeholders = jobIds.map(() => '?').join(',');
    this.db.prepare(`
      UPDATE taskpulse_jobs
      SET heartbeat_at = ?, updated_at = ?
      WHERE id IN (${placeholders}) AND locked_by = ? AND state = 'active'
    `).run(now, now, ...jobIds, workerId);
  }

  /**
   * Detects stalled jobs from dead workers whose heartbeat has timed out and resets them.
   */
  public recoverStalledJobs(queueName: string, heartbeatTimeoutMs: number): string[] {
    const cutoff = Date.now() - heartbeatTimeoutMs;
    const stalledRows = this.db.prepare(`
      SELECT id FROM taskpulse_jobs
      WHERE queue_name = ? AND state = 'active' AND (heartbeat_at IS NULL OR heartbeat_at < ?)
    `).all(queueName, cutoff) as { id: string }[];

    if (stalledRows.length === 0) return [];

    const ids = stalledRows.map(r => r.id);
    const placeholders = ids.map(() => '?').join(',');
    const now = Date.now();

    this.db.prepare(`
      UPDATE taskpulse_jobs
      SET state = 'pending',
          locked_by = NULL,
          heartbeat_at = NULL,
          updated_at = ?
      WHERE id IN (${placeholders})
    `).run(now, ...ids);

    return ids;
  }

  public getStats(queueName: string): QueueStats {
    const rows = this.db.prepare(`
      SELECT state, COUNT(*) as count 
      FROM taskpulse_jobs 
      WHERE queue_name = ? 
      GROUP BY state
    `).all(queueName) as { state: JobState; count: number }[];

    const stateMap: Record<JobState, number> = {
      pending: 0,
      active: 0,
      completed: 0,
      failed: 0,
      dead: 0,
    };

    let total = 0;
    for (const r of rows) {
      if (r.state in stateMap) {
        stateMap[r.state] = r.count;
        total += r.count;
      }
    }

    const durationRow = this.db.prepare(`
      SELECT AVG(finished_at - created_at) as avg_duration
      FROM taskpulse_jobs
      WHERE queue_name = ? AND finished_at IS NOT NULL
    `).get(queueName) as { avg_duration: number | null };

    return {
      queueName,
      pending: stateMap.pending,
      active: stateMap.active,
      completed: stateMap.completed,
      failed: stateMap.failed,
      dead: stateMap.dead,
      total,
      avgDurationMs: Math.round(durationRow?.avg_duration || 0),
    };
  }

  public getJobs(
    queueName: string,
    filter: { state?: JobState; limit?: number; offset?: number } = {}
  ): Job[] {
    const limit = filter.limit ?? 50;
    const offset = filter.offset ?? 0;

    let query = 'SELECT * FROM taskpulse_jobs WHERE queue_name = ?';
    const params: (string | number)[] = [queueName];

    if (filter.state) {
      query += ' AND state = ?';
      params.push(filter.state);
    }

    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const rows = this.db.prepare(query).all(...params) as JobRecord[];
    return rows.map(r => this.recordToJob(r));
  }

  public retryDeadJob(id: string): boolean {
    const now = Date.now();
    const res = this.db.prepare(`
      UPDATE taskpulse_jobs
      SET state = 'pending',
          attempts = 0,
          error = NULL,
          stack_trace = NULL,
          run_at = ?,
          updated_at = ?
      WHERE id = ? AND state = 'dead'
    `).run(now, now, id);

    return res.changes > 0;
  }

  public close(): void {
    if (this.db.open) {
      this.db.close();
    }
  }
}
