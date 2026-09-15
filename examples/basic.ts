import { TaskPulse, createDashboard } from '../src/index.js';

interface EmailPayload {
  to: string;
  subject: string;
  body: string;
}

async function main() {
  // 1. Initialize queue backed by local persistent SQLite database
  const queue = new TaskPulse<EmailPayload>('emails', {
    dbPath: 'tasks.db',
    concurrency: 3,
  });

  // 2. Launch optional embedded dark-mode dashboard
  const dashboard = createDashboard(queue, { port: 3000 });
  const url = await dashboard.listen();
  console.log(`🚀 TaskPulse Dashboard live at: ${url}`);

  // 3. Register worker handler
  queue.process('send-email', async (job) => {
    console.log(`[Worker] Processing email to: ${job.data.to}`);
    // Simulate async email sending
    await new Promise(resolve => setTimeout(resolve, 300));
    return { status: 'sent', timestamp: new Date().toISOString() };
  });

  // 4. Attach typed lifecycle event listeners
  queue.on('job:completed', (job, result) => {
    console.log(`✅ [Job Completed] ID: ${job.id} -> Result:`, result);
  });

  queue.on('job:failed', (job, error) => {
    console.error(`❌ [Job Failed] ID: ${job.id} -> Error: ${error.message}`);
  });

  // 5. Enqueue tasks with priorities and retry configurations
  queue.add('send-email', {
    to: 'founder@startup.io',
    subject: 'Welcome to TaskPulse!',
    body: 'Your queue is running smoothly with 0 external infrastructure.',
  }, { priority: 10 });

  queue.add('send-email', {
    to: 'dev@company.com',
    subject: 'Weekly Digest',
    body: 'Automated background task.',
  }, { priority: 1 });
}

main().catch(console.error);
