import http from 'node:http';
import { TaskPulse } from '../core/queue.js';
import { getDashboardHtml } from './ui.js';
import { JobState } from '../types.js';

export interface DashboardServerOptions {
  port?: number;
  host?: string;
}

export class TaskPulseDashboard {
  private queue: TaskPulse;
  private server: http.Server | null = null;
  public readonly port: number;
  public readonly host: string;

  constructor(queue: TaskPulse, options: DashboardServerOptions = {}) {
    this.queue = queue;
    this.port = options.port ?? 4000;
    this.host = options.host ?? 'localhost';
  }

  public listen(): Promise<string> {
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => {
        const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
        const pathname = url.pathname;

        // CORS headers
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

        if (req.method === 'OPTIONS') {
          res.writeHead(204);
          res.end();
          return;
        }

        // 1. Dashboard HTML UI
        if (pathname === '/' && req.method === 'GET') {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(getDashboardHtml(this.queue.name));
          return;
        }

        // 2. Stats API
        if (pathname === '/api/stats' && req.method === 'GET') {
          const stats = this.queue.getStats();
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(stats));
          return;
        }

        // 3. Jobs List API
        if (pathname === '/api/jobs' && req.method === 'GET') {
          const state = url.searchParams.get('state') as JobState | undefined;
          const limit = Number(url.searchParams.get('limit')) || 50;
          const offset = Number(url.searchParams.get('offset')) || 0;

          const jobs = this.queue.getJobs({ state, limit, offset });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(jobs));
          return;
        }

        // 4. Retry Job API
        const retryMatch = pathname.match(/^\/api\/jobs\/([a-zA-Z0-9-]+)\/retry$/);
        if (retryMatch && req.method === 'POST') {
          const jobId = retryMatch[1];
          const success = this.queue.retryJob(jobId);
          res.writeHead(success ? 200 : 404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success, jobId }));
          return;
        }

        // 404 Not Found
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not Found' }));
      });

      this.server.on('error', reject);
      this.server.listen(this.port, this.host, () => {
        const addr = `http://${this.host}:${this.port}`;
        resolve(addr);
      });
    });
  }

  public close(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => resolve());
      } else {
        resolve();
      }
    });
  }
}

export function createDashboard(queue: TaskPulse, options?: DashboardServerOptions): TaskPulseDashboard {
  return new TaskPulseDashboard(queue, options);
}
