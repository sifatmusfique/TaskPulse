import { describe, it, expect } from 'vitest';
import { CronScheduler } from '../src/scheduler/cron.js';

describe('CronScheduler', () => {
  it('should accurately calculate next run date for cron expression', () => {
    const base = new Date('2026-01-01T00:00:00Z');
    // Every 5 minutes
    const nextRun = CronScheduler.getNextRun('*/5 * * * *', base);
    expect(nextRun.getTime()).toBeGreaterThan(base.getTime());
    expect(nextRun.getMinutes() % 5).toBe(0);
  });

  it('should validate valid and invalid cron expressions', () => {
    expect(CronScheduler.isValid('0 0 * * *')).toBe(true);
    expect(CronScheduler.isValid('invalid expression')).toBe(false);
  });
});
