import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import { Job, JobHandler, JobOptions, QueueEvents, QueueOptions, QueueStats } from '../types.js';
import { SQLiteStorage } from '../storage/sqlite.js';
import { CronScheduler } from '../scheduler/cron.js';

export class TaskPulse<T = unknown, R = unknown> extends EventEmitter {
  public readonly name: string;
  public readonly workerId: string;
  public readonly storage: SQLiteStorage;
  public readonly options: Required<QueueOptions>;

  private handlers: Map<string, JobHandler<T, R>> = new Map();
  private defaultHandler?: JobHandler<T, R>;
  private activeJobs: Map<string, { job: Job<T, R>; abortController: AbortController }> = new Map();

  private isRunning: boolean = false;
  private isPaused: boolean = false;
  private isShuttingDown: boolean = false;

  private pollTimer: NodeJS.Timeout | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private stalledCheckTimer: NodeJS.Timeout | null = null;

  constructor(name: string, options: QueueOptions = {}, existingStorage?: SQLiteStorage) {
    super();
    this.name = name;
    this.workerId = `worker_${randomUUID().slice(0, 8)}`;
    this.storage = existingStorage ?? new SQLiteStorage(options.dbPath ?? 'taskpulse.db');

    this.options = {
      dbPath: options.dbPath ?? 'taskpulse.db',
      concurrency: options.concurrency ?? 3,
      pollIntervalMs: options.pollIntervalMs ?? 200,
      heartbeatIntervalMs: options.heartbeatIntervalMs ?? 3000,
      heartbeatTimeoutMs: options.heartbeatTimeoutMs ?? 15000,
      enableCron: options.enableCron ?? true,
      removeOnComplete: options.removeOnComplete ?? false,
      removeOnFail: options.removeOnFail ?? false,
    };
  }

  /**
   * Enqueues a single background task into the persistent store.
   */
  public add(jobName: string, data: T, options: JobOptions = {}): Job<T> {
    const opts = { ...options };

    if (opts.cron) {
      if (!opts.runAt) {
        opts.runAt = CronScheduler.getNextRun(opts.cron);
      }
    }

    const job = this.storage.insertJob<T>(this.name, jobName, data, opts);
    this.emit('job:enqueued', job as Job<T, R>);
    this.wakePoll();
    return job;
  }

  /**
   * Enqueues a batch of jobs in a single atomic ACID transaction.
   */
  public addBulk(jobs: Array<{ name: string; data: T; options?: JobOptions }>): Job<T>[] {
    const inserted = this.storage.insertBatch(this.name, jobs);
    for (const job of inserted) {
      this.emit('job:enqueued', job as Job<T, R>);
    }
    this.wakePoll();
    return inserted;
  }

  /**
   * Registers a worker handler to process jobs.
   * Can be registered for a specific job name, or as a catch-all handler.
   */
  public process(handler: JobHandler<T, R>): this;
  public process(jobName: string, handler: JobHandler<T, R>): this;
  public process(
    jobNameOrHandler: string | JobHandler<T, R>,
    maybeHandler?: JobHandler<T, R>
  ): this {
    if (typeof jobNameOrHandler === 'function') {
      this.defaultHandler = jobNameOrHandler;
    } else if (typeof jobNameOrHandler === 'string' && maybeHandler) {
      this.handlers.set(jobNameOrHandler, maybeHandler);
    }

    if (!this.isRunning) {
      this.start();
    }

    return this;
  }

  public start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.isPaused = false;

    this.schedulePoll(0);
    this.startHeartbeatLoop();
    this.startStalledCheckLoop();
  }

  public pause(): void {
    this.isPaused = true;
  }

  public resume(): void {
    if (this.isPaused) {
      this.isPaused = false;
      this.wakePoll();
    }
  }

  private wakePoll(): void {
    if (this.isRunning && !this.isPaused && !this.isShuttingDown) {
      this.schedulePoll(0);
    }
  }

  private schedulePoll(delayMs: number): void {
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
    }
    this.pollTimer = setTimeout(() => {
      this.poll().catch(err => this.emit('error', err));
    }, delayMs);
  }

  private async poll(): Promise<void> {
    if (!this.isRunning || this.isPaused || this.isShuttingDown) return;

    const availableSlots = this.options.concurrency - this.activeJobs.size;
    if (availableSlots <= 0) {
      return;
    }

    const claimed = this.storage.claimJobs<T, R>(this.name, this.workerId, availableSlots);

    if (claimed.length > 0) {
      for (const job of claimed) {
        this.executeJob(job);
      }
    }

    // Schedule next poll interval
    const nextDelay = claimed.length > 0 ? 0 : this.options.pollIntervalMs;
    this.schedulePoll(nextDelay);
  }

  private async executeJob(job: Job<T, R>): Promise<void> {
    const handler = this.handlers.get(job.name) || this.defaultHandler;
    if (!handler) {
      const err = new Error(`No handler registered for job type "${job.name}"`);
      this.handleJobFailure(job, err);
      return;
    }

    const abortController = new AbortController();
    this.activeJobs.set(job.id, { job, abortController });
    this.emit('job:started', job);

    let timeoutHandle: NodeJS.Timeout | null = null;
    if (job.timeoutMs && job.timeoutMs > 0) {
      timeoutHandle = setTimeout(() => {
        abortController.abort();
      }, job.timeoutMs);
    }

    try {
      const resultPromise = Promise.resolve(handler(job));
      const result = await resultPromise;

      if (timeoutHandle) clearTimeout(timeoutHandle);
      this.handleJobSuccess(job, result);
    } catch (err: unknown) {
      if (timeoutHandle) clearTimeout(timeoutHandle);
      const error = err instanceof Error ? err : new Error(String(err));
      this.handleJobFailure(job, error);
    } finally {
      this.activeJobs.delete(job.id);
      this.wakePoll();
    }
  }

  private handleJobSuccess(job: Job<T, R>, result: R): void {
    this.storage.completeJob(job.id, result);
    this.emit('job:completed', job, result);

    // If job has recurring cron schedule, automatically schedule next iteration
    if (this.options.enableCron && job.cron) {
      this.scheduleNextCronOccurrence(job);
    }
  }

  private handleJobFailure(job: Job<T, R>, error: Error): void {
    const failResult = this.storage.failJob(job.id, error);
    this.emit('job:failed', job, error);

    if (failResult.state === 'dead') {
      this.emit('job:dead', job, error);

      if (this.options.enableCron && job.cron) {
        this.scheduleNextCronOccurrence(job);
      }
    } else if (failResult.state === 'pending' && failResult.nextRunAt) {
      this.emit('job:retry', job, failResult.attempts, failResult.nextRunAt);
    }
  }

  private scheduleNextCronOccurrence(job: Job<T, R>): void {
    if (!job.cron) return;
    try {
      const nextRunAt = CronScheduler.getNextRun(job.cron);
      this.storage.insertJob(this.name, job.name, job.data, {
        priority: job.priority,
        runAt: nextRunAt,
        maxAttempts: job.maxAttempts,
        backoffMs: job.backoffMs,
        backoffStrategy: job.backoffStrategy,
        timeoutMs: job.timeoutMs,
        cron: job.cron,
      });
    } catch (err) {
      this.emit('error', err instanceof Error ? err : new Error(String(err)));
    }
  }

  private startHeartbeatLoop(): void {
    this.heartbeatTimer = setInterval(() => {
      if (this.activeJobs.size > 0) {
        const jobIds = Array.from(this.activeJobs.keys());
        this.storage.updateHeartbeats(this.workerId, jobIds);
      }
    }, this.options.heartbeatIntervalMs);
  }

  private startStalledCheckLoop(): void {
    this.stalledCheckTimer = setInterval(() => {
      const recoveredIds = this.storage.recoverStalledJobs(
        this.name,
        this.options.heartbeatTimeoutMs
      );
      for (const id of recoveredIds) {
        this.emit('job:stalled', id);
      }
      if (recoveredIds.length > 0) {
        this.wakePoll();
      }
    }, this.options.heartbeatTimeoutMs);
  }

  /**
   * Retrieves live metrics & stats for the queue.
   */
  public getStats(): QueueStats {
    return this.storage.getStats(this.name);
  }

  /**
   * Fetches paginated jobs with optional state filtering.
   */
  public getJobs(filter?: { state?: Job['state']; limit?: number; offset?: number }): Job[] {
    return this.storage.getJobs(this.name, filter);
  }

  /**
   * Manually re-queues a failed/dead job for immediate execution.
   */
  public retryJob(jobId: string): boolean {
    const success = this.storage.retryDeadJob(jobId);
    if (success) {
      this.wakePoll();
    }
    return success;
  }

  /**
   * Graceful shutdown: stops accepting new jobs and waits for active jobs to complete.
   */
  public async close(timeoutMs: number = 10000): Promise<void> {
    this.isShuttingDown = true;
    this.isRunning = false;

    if (this.pollTimer) clearTimeout(this.pollTimer);
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    if (this.stalledCheckTimer) clearInterval(this.stalledCheckTimer);

    if (this.activeJobs.size > 0) {
      const startTime = Date.now();
      while (this.activeJobs.size > 0 && Date.now() - startTime < timeoutMs) {
        await new Promise(resolve => setTimeout(resolve, 50));
      }

      // Abort any remaining jobs that timed out during shutdown
      for (const [, { abortController }] of this.activeJobs) {
        abortController.abort();
      }
    }

    this.storage.close();
  }
}
