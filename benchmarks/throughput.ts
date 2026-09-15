import { TaskPulse } from '../src/index.js';
import { SQLiteStorage } from '../src/storage/sqlite.js';

async function runBenchmark() {
  console.log('⚡ Starting TaskPulse Performance Benchmark...\n');

  const NUM_JOBS = 5000;
  const storage = new SQLiteStorage(':memory:');
  const queue = new TaskPulse('benchmark-queue', { concurrency: 10, pollIntervalMs: 10 }, storage);

  // 1. Benchmark Batch Enqueue Throughput
  const startEnqueue = performance.now();
  const batch = Array.from({ length: NUM_JOBS }, (_, i) => ({
    name: 'benchmark-task',
    data: { index: i, timestamp: Date.now() },
  }));

  queue.addBulk(batch);
  const enqueueDuration = performance.now() - startEnqueue;
  const enqueueOps = Math.round((NUM_JOBS / enqueueDuration) * 1000);

  console.log(`✅ [1/2] Enqueue Benchmark:`);
  console.log(`   - Enqueued: ${NUM_JOBS.toLocaleString()} jobs in ${enqueueDuration.toFixed(2)}ms`);
  console.log(`   - Throughput: ${enqueueOps.toLocaleString()} jobs/sec\n`);

  // 2. Benchmark Worker Processing Throughput
  let processed = 0;
  const startProcessing = performance.now();

  await new Promise<void>((resolve) => {
    queue.process('benchmark-task', async () => {
      processed++;
      if (processed >= NUM_JOBS) {
        resolve();
      }
    });
  });

  const processDuration = performance.now() - startProcessing;
  const processOps = Math.round((NUM_JOBS / processDuration) * 1000);

  console.log(`✅ [2/2] Worker Execution Benchmark:`);
  console.log(`   - Processed: ${processed.toLocaleString()} jobs in ${processDuration.toFixed(2)}ms`);
  console.log(`   - Throughput: ${processOps.toLocaleString()} jobs/sec\n`);

  await queue.close(500);
  console.log('🎉 Benchmark completed successfully!');
}

runBenchmark().catch(console.error);
