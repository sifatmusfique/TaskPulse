# TaskPulse ⚡

<p align="center">
  <strong>A resilient, persistent, zero-redis background job and workflow queue engine for Node.js / TypeScript.</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Node.js-%3E%3D20-green?style=flat-square&logo=node.js" alt="Node Version" />
  <img src="https://img.shields.io/badge/TypeScript-Strict%205.0+-blue?style=flat-square&logo=typescript" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Storage-SQLite%20(WAL)-003B57?style=flat-square&logo=sqlite" alt="SQLite" />
  <img src="https://img.shields.io/badge/License-MIT-yellow?style=flat-square" alt="License" />
  <img src="https://img.shields.io/badge/Tests-100%25%20Passing-brightgreen?style=flat-square" alt="Tests" />
</p>

---

## 💡 Why TaskPulse?

Most backend queues (BullMQ, Celery, Sidekiq) force you to deploy and manage a dedicated **Redis**, **RabbitMQ**, or **PostgreSQL** instance. For indie hackers, microservices, local tools, or desktop apps (Electron/Tauri), this adds unnecessary monthly costs, operational friction, and maintenance overhead.

**TaskPulse** gives you production-grade background queueing with **zero external infrastructure**:
- 🗄️ **Embedded ACID Persistence**: Powered by SQLite in **WAL (Write-Ahead Logging)** mode. High throughput (>2,500 jobs/sec) with full crash resilience.
- 🔒 **Zero Race Conditions**: Concurrency-safe atomic job claiming prevents double-processing across concurrent workers.
- 🔁 **Resilience & Fault Recovery**: Exponential backoff with random jitter, automated stalled worker detection, and Dead-Letter Queues (DLQ).
- ⏰ **Advanced Scheduling**: Priority levels, delayed execution (`delay: ms`), and recurring `cron` schedules.
- 📊 **Real-Time Live Dashboard**: Embedded dark-mode web monitoring UI with 1-click DLQ retries.
- 🛡️ **100% Type-Safe**: Generic job payloads and return types with full TypeScript autocomplete.

---

## 📦 Installation

```bash
npm install taskpulse
# or
pnpm add taskpulse
# or
yarn add taskpulse
```

---

## 🚀 Quick Start

```typescript
import { TaskPulse, createDashboard } from 'taskpulse';

// 1. Initialize queue (backed by local SQLite database)
const queue = new TaskPulse<{ email: string; subject: string }>('email-queue', {
  dbPath: 'jobs.db',
  concurrency: 5,
});

// 2. Define worker handler
queue.process('send-welcome', async (job) => {
  console.log(`Processing email for ${job.data.email}`);
  // Your async logic here...
  return { delivered: true, timestamp: Date.now() };
});

// 3. Enqueue jobs with options (Priority, Delays, Retries)
queue.add('send-welcome', {
  email: 'dev@example.com',
  subject: 'Welcome to TaskPulse!',
}, {
  priority: 10,        // High priority
  maxAttempts: 3,      // Automatic retries on failure
  backoffMs: 1000,     // Exponential jittered backoff
});

// 4. (Optional) Launch real-time web dashboard
const dashboard = createDashboard(queue, { port: 3000 });
await dashboard.listen();
console.log('⚡ Dashboard running on http://localhost:3000');
```

---

## 🔄 Recurring Cron Workflows

Easily schedule recurring tasks with standard 5-part cron syntax:

```typescript
// Runs every night at midnight
queue.add('nightly-cleanup', {}, {
  cron: '0 0 * * *',
});
```

---

## 📊 Performance & Benchmarks

Benchmarked on Node.js v22 (In-Memory / SQLite WAL):

| Operation | Throughput | Persistence Guarantee |
| :--- | :--- | :--- |
| **Batch Enqueue** | **~2,700+ jobs/sec** | ACID Transactional Write |
| **Worker Execution** | **~1,800+ jobs/sec** | Atomic State Transition |
| **Memory Footprint** | **< 35 MB** | Zero Redis Required |

Run benchmarks locally:
```bash
npm run benchmark
```

---

## 🛠️ Architecture

```
                      ┌──────────────────────┐
                      │    TaskPulse Queue   │
                      └──────────┬───────────┘
                                 │
           ┌─────────────────────┼─────────────────────┐
           ▼                     ▼                     ▼
     Enqueue Job          Worker Pool (xN)      Cron Scheduler
           │                     │                     │
           └──────────────┬──────┴─────────────────────┘
                          ▼
             ┌─────────────────────────┐
             │   SQLite Storage (WAL)  │
             │  • Atomic Claim Query   │
             │  • Exponential Backoff  │
             │  • DLQ & Heartbeats     │
             └────────────┬────────────┘
                          ▼
             ┌─────────────────────────┐
             │   Real-Time Dashboard   │
             │    (Node Native HTTP)   │
             └─────────────────────────┘
```

---

## 🧪 Running Tests

```bash
npm test
```

---

## 📄 License

MIT © [Sifat Musfique](https://github.com/sifat)
