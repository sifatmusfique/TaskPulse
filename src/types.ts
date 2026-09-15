export type JobState = 'pending' | 'active' | 'completed' | 'failed' | 'dead';

export type BackoffStrategy = 'fixed' | 'exponential';

export interface JobOptions {
  /** Priority level - higher numbers are executed first. Default: 0 */
  priority?: number;
  /** Delay in milliseconds before job becomes eligible for processing */
  delay?: number;
  /** Specific timestamp when job should run */
  runAt?: Date;
  /** Maximum number of retry attempts before moving to Dead Letter Queue (DLQ). Default: 3 */
  maxAttempts?: number;
  /** Base backoff delay in milliseconds between retries. Default: 1000 */
  backoffMs?: number;
  /** Strategy for retry delay calculation. Default: 'exponential' */
  backoffStrategy?: BackoffStrategy;
  /** Maximum execution time in milliseconds before task is killed with timeout. Default: 30000 */
  timeoutMs?: number;
  /** Cron expression for recurring tasks (e.g. '0 0 * * *') */
  cron?: string;
  /** Deduplication key to prevent duplicate pending tasks */
  uniqueKey?: string;
}

export interface JobRecord<T = unknown, R = unknown> {
  id: string;
  queue_name: string;
  name: string;
  payload: string; // JSON string
  result: string | null; // JSON string
  state: JobState;
  priority: number;
  run_at: number; // Unix timestamp in ms
  attempts: number;
  max_attempts: number;
  backoff_ms: number;
  backoff_strategy: BackoffStrategy;
  timeout_ms: number;
  error: string | null;
  stack_trace: string | null;
  cron: string | null;
  unique_key: string | null;
  locked_by: string | null; // worker id
  heartbeat_at: number | null; // Unix timestamp in ms
  created_at: number;
  updated_at: number;
  finished_at: number | null;
}

export interface Job<T = unknown, R = unknown> {
  id: string;
  queueName: string;
  name: string;
  data: T;
  result?: R;
  state: JobState;
  priority: number;
  runAt: Date;
  attempts: number;
  maxAttempts: number;
  backoffMs: number;
  backoffStrategy: BackoffStrategy;
  timeoutMs: number;
  error?: string;
  stackTrace?: string;
  cron?: string;
  uniqueKey?: string;
  lockedBy?: string;
  createdAt: Date;
  updatedAt: Date;
  finishedAt?: Date;
}

export type JobHandler<T = unknown, R = unknown> = (job: Job<T, R>) => Promise<R> | R;

export interface QueueOptions {
  /** SQLite database file path, or ':memory:' for tests. Default: 'taskpulse.db' */
  dbPath?: string;
  /** Number of concurrent workers running in parallel. Default: 3 */
  concurrency?: number;
  /** Interval in milliseconds between poll checks when queue is idle. Default: 200 */
  pollIntervalMs?: number;
  /** Interval in milliseconds between worker heartbeats. Default: 3000 */
  heartbeatIntervalMs?: number;
  /** Stalled job timeout in milliseconds after which dead worker tasks are reclaimed. Default: 15000 */
  heartbeatTimeoutMs?: number;
  /** Enable background cron scheduler for recurring tasks. Default: true */
  enableCron?: boolean;
  /** Auto-clean completed jobs older than X milliseconds, or true for immediate removal */
  removeOnComplete?: boolean | number;
  /** Auto-clean failed/dead jobs older than X milliseconds */
  removeOnFail?: boolean | number;
}

export interface QueueStats {
  queueName: string;
  pending: number;
  active: number;
  completed: number;
  failed: number;
  dead: number;
  total: number;
  avgDurationMs: number;
}

export interface QueueEvents<T = unknown, R = unknown> {
  'job:enqueued': (job: Job<T, R>) => void;
  'job:started': (job: Job<T, R>) => void;
  'job:completed': (job: Job<T, R>, result: R) => void;
  'job:failed': (job: Job<T, R>, error: Error) => void;
  'job:retry': (job: Job<T, R>, attempt: number, nextRunAt: Date) => void;
  'job:dead': (job: Job<T, R>, error: Error) => void;
  'job:stalled': (jobId: string) => void;
  'error': (error: Error) => void;
}
