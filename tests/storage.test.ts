import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SQLiteStorage } from '../src/storage/sqlite.js';

describe('SQLiteStorage', () => {
  let storage: SQLiteStorage;

  beforeEach(() => {
    // Use in-memory SQLite for high-speed isolated tests
    storage = new SQLiteStorage(':memory:');
  });

  afterEach(() => {
    storage.close();
  });

  it('should insert and retrieve a job record correctly', () => {
    const job = storage.insertJob('email-queue', 'send-welcome', { email: 'user@example.com' }, {
      priority: 10,
    });

    expect(job.id).toBeDefined();
    expect(job.name).toBe('send-welcome');
    expect(job.data).toEqual({ email: 'user@example.com' });
    expect(job.state).toBe('pending');
    expect(job.priority).toBe(10);
    expect(job.attempts).toBe(0);
  });

  it('should enforce uniqueKey deduplication on pending jobs', () => {
    const job1 = storage.insertJob('sync-queue', 'sync-user', { userId: 42 }, {
      uniqueKey: 'user-42',
    });

    const job2 = storage.insertJob('sync-queue', 'sync-user', { userId: 42 }, {
      uniqueKey: 'user-42',
    });

    expect(job1.id).toBe(job2.id);
  });

  it('should atomically claim jobs respecting priority and limit', () => {
    storage.insertJob('process-queue', 'low-task', { n: 1 }, { priority: 1 });
    storage.insertJob('process-queue', 'high-task', { n: 2 }, { priority: 100 });
    storage.insertJob('process-queue', 'mid-task', { n: 3 }, { priority: 50 });

    const claimed = storage.claimJobs('process-queue', 'worker-1', 2);
    expect(claimed.length).toBe(2);
    expect(claimed[0].name).toBe('high-task');
    expect(claimed[1].name).toBe('mid-task');
    expect(claimed[0].state).toBe('active');
    expect(claimed[0].lockedBy).toBe('worker-1');

    // A second worker should only get the remaining job
    const claimed2 = storage.claimJobs('process-queue', 'worker-2', 2);
    expect(claimed2.length).toBe(1);
    expect(claimed2[0].name).toBe('low-task');
  });

  it('should handle batch inserts inside a single transaction', () => {
    const batch = [
      { name: 'task-1', data: { val: 1 } },
      { name: 'task-2', data: { val: 2 } },
      { name: 'task-3', data: { val: 3 } },
    ];

    const jobs = storage.insertBatch('batch-queue', batch);
    expect(jobs.length).toBe(3);

    const stats = storage.getStats('batch-queue');
    expect(stats.pending).toBe(3);
  });

  it('should transition to DLQ (dead) when max attempts are exceeded', () => {
    const job = storage.insertJob('fail-queue', 'do-work', {}, { maxAttempts: 2, backoffMs: 50 });
    const claimed = storage.claimJobs('fail-queue', 'w1', 1);

    // First failure -> pending retry
    const res1 = storage.failJob(claimed[0].id, new Error('First crash'));
    expect(res1.state).toBe('pending');
    expect(res1.attempts).toBe(1);

    // Second claim and failure -> dead (DLQ)
    const claimedAgain = storage.claimJobs('fail-queue', 'w1', 1);
    // Since backoff delay was set, let's claim with updated timestamp or verify fail
    const res2 = storage.failJob(job.id, new Error('Second crash fatal'));
    expect(res2.state).toBe('dead');
    expect(res2.attempts).toBe(2);

    const stats = storage.getStats('fail-queue');
    expect(stats.dead).toBe(1);
  });
});
