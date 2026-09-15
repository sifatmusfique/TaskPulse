import { describe, it, expect, afterEach } from 'vitest';
import { TaskPulse } from '../src/core/queue.js';
import { SQLiteStorage } from '../src/storage/sqlite.js';

describe('TaskPulse Queue Core', () => {
  let queue: TaskPulse<{ text: string; shouldFail?: boolean }, { length: number }>;

  afterEach(async () => {
    if (queue) {
      await queue.close(500);
    }
  });

  it('should process jobs concurrently and emit lifecycle events', async () => {
    const storage = new SQLiteStorage(':memory:');
    queue = new TaskPulse('test-queue', { concurrency: 2, pollIntervalMs: 50 }, storage);

    const completed: string[] = [];
    queue.on('job:completed', (job) => {
      completed.push(job.id);
    });

    queue.process(async (job) => {
      await new Promise(resolve => setTimeout(resolve, 50));
      return { length: job.data.text.length };
    });

    queue.add('task', { text: 'hello' });
    queue.add('task', { text: 'world' });

    await new Promise(resolve => setTimeout(resolve, 350));

    expect(completed.length).toBe(2);
    const stats = queue.getStats();
    expect(stats.completed).toBe(2);
    expect(stats.pending).toBe(0);
  });

  it('should retry failed tasks with exponential backoff and eventually hit DLQ', async () => {
    const storage = new SQLiteStorage(':memory:');
    queue = new TaskPulse('retry-queue', { concurrency: 1, pollIntervalMs: 20 }, storage);

    let retryCount = 0;
    let deadEmitted = false;

    queue.on('job:retry', () => {
      retryCount++;
    });

    queue.on('job:dead', () => {
      deadEmitted = true;
    });

    queue.process(async (job) => {
      if (job.data.shouldFail) {
        throw new Error('Planned task explosion');
      }
      return { length: 0 };
    });

    queue.add('fail-job', { text: 'boom', shouldFail: true }, {
      maxAttempts: 2,
      backoffMs: 50,
    });

    await new Promise(resolve => setTimeout(resolve, 400));

    expect(retryCount).toBe(1);
    expect(deadEmitted).toBe(true);

    const stats = queue.getStats();
    expect(stats.dead).toBe(1);
  });

  it('should manually re-queue a dead task via retryJob()', async () => {
    const storage = new SQLiteStorage(':memory:');
    queue = new TaskPulse('dlq-queue', { concurrency: 1, pollIntervalMs: 20 }, storage);

    let attemptsMade = 0;
    queue.process(async (job) => {
      attemptsMade++;
      if (attemptsMade <= 1) {
        throw new Error('Initial fail');
      }
      return { length: 1 };
    });

    const job = queue.add('job', { text: 'data' }, { maxAttempts: 1, backoffMs: 10 });
    await new Promise(resolve => setTimeout(resolve, 150));

    let stats = queue.getStats();
    expect(stats.dead).toBe(1);

    // Manual retry
    const retried = queue.retryJob(job.id);
    expect(retried).toBe(true);

    await new Promise(resolve => setTimeout(resolve, 150));
    stats = queue.getStats();
    expect(stats.completed).toBe(1);
    expect(stats.dead).toBe(0);
  });
});
