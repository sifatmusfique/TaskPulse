import { describe, it, expect, afterEach } from 'vitest';
import { TaskPulse } from '../src/core/queue.js';
import { SQLiteStorage } from '../src/storage/sqlite.js';
import { createDashboard, TaskPulseDashboard } from '../src/dashboard/server.js';

describe('TaskPulse Dashboard HTTP Server', () => {
  let queue: TaskPulse;
  let dashboard: TaskPulseDashboard;

  afterEach(async () => {
    if (dashboard) await dashboard.close();
    if (queue) await queue.close(100);
  });

  it('should serve HTML UI and JSON REST endpoints', async () => {
    const storage = new SQLiteStorage(':memory:');
    queue = new TaskPulse('dashboard-test-q', {}, storage);
    queue.add('email-task', { to: 'alice@example.com' });

    dashboard = createDashboard(queue, { port: 4891 });
    const url = await dashboard.listen();

    // Test HTML root
    const htmlRes = await fetch(url);
    expect(htmlRes.status).toBe(200);
    const htmlText = await htmlRes.text();
    expect(htmlText).toContain('TaskPulse Dashboard');

    // Test Stats API
    const statsRes = await fetch(`${url}/api/stats`);
    expect(statsRes.status).toBe(200);
    const stats = await statsRes.json();
    expect(stats.pending).toBe(1);

    // Test Jobs API
    const jobsRes = await fetch(`${url}/api/jobs`);
    expect(jobsRes.status).toBe(200);
    const jobs = await jobsRes.json();
    expect(jobs.length).toBe(1);
    expect(jobs[0].name).toBe('email-task');
  });
});
