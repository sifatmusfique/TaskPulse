export function getDashboardHtml(queueName: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>TaskPulse Dashboard - ${queueName}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600;700&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #090d16;
      --card-bg: rgba(18, 24, 38, 0.7);
      --card-border: rgba(255, 255, 255, 0.08);
      --text: #f1f5f9;
      --text-muted: #94a3b8;
      --accent: #6366f1;
      --accent-glow: rgba(99, 102, 241, 0.25);
      --success: #10b981;
      --warning: #f59e0b;
      --danger: #ef4444;
      --info: #38bdf8;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      background: var(--bg);
      color: var(--text);
      font-family: 'Plus Jakarta Sans', sans-serif;
      min-height: 100vh;
      padding: 2rem;
      background-image: radial-gradient(circle at 50% 0%, rgba(99, 102, 241, 0.15) 0%, transparent 50%);
    }

    .container {
      max-width: 1200px;
      margin: 0 auto;
    }

    header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 2rem;
      padding-bottom: 1.5rem;
      border-bottom: 1px solid var(--card-border);
    }

    .logo {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }

    .logo-icon {
      background: linear-gradient(135deg, #6366f1, #8b5cf6);
      width: 42px;
      height: 42px;
      border-radius: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      font-size: 1.25rem;
      box-shadow: 0 0 20px var(--accent-glow);
    }

    .logo-text h1 {
      font-size: 1.5rem;
      font-weight: 700;
      letter-spacing: -0.02em;
    }

    .logo-text p {
      color: var(--text-muted);
      font-size: 0.85rem;
      font-family: 'JetBrains Mono', monospace;
    }

    .status-badge {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      background: rgba(16, 185, 129, 0.1);
      border: 1px solid rgba(16, 185, 129, 0.3);
      color: var(--success);
      padding: 0.4rem 0.85rem;
      border-radius: 20px;
      font-size: 0.85rem;
      font-weight: 600;
    }

    .pulse-dot {
      width: 8px;
      height: 8px;
      background: var(--success);
      border-radius: 50%;
      box-shadow: 0 0 10px var(--success);
      animation: pulse 2s infinite;
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.4; transform: scale(0.85); }
    }

    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 1.25rem;
      margin-bottom: 2rem;
    }

    .stat-card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      backdrop-filter: blur(12px);
      border-radius: 14px;
      padding: 1.25rem;
      transition: transform 0.2s, border-color 0.2s;
    }

    .stat-card:hover {
      transform: translateY(-2px);
      border-color: rgba(255, 255, 255, 0.15);
    }

    .stat-label {
      color: var(--text-muted);
      font-size: 0.85rem;
      font-weight: 500;
      margin-bottom: 0.5rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .stat-value {
      font-size: 2rem;
      font-weight: 700;
      font-family: 'JetBrains Mono', monospace;
    }

    .stat-pending .stat-value { color: var(--warning); }
    .stat-active .stat-value { color: var(--info); }
    .stat-completed .stat-value { color: var(--success); }
    .stat-dead .stat-value { color: var(--danger); }

    .jobs-section {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      backdrop-filter: blur(12px);
      border-radius: 14px;
      overflow: hidden;
    }

    .section-header {
      padding: 1.25rem 1.5rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid var(--card-border);
    }

    .filter-tabs {
      display: flex;
      gap: 0.5rem;
    }

    .tab-btn {
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid transparent;
      color: var(--text-muted);
      padding: 0.4rem 0.85rem;
      border-radius: 8px;
      cursor: pointer;
      font-size: 0.85rem;
      font-weight: 500;
      transition: all 0.2s;
    }

    .tab-btn.active, .tab-btn:hover {
      background: rgba(99, 102, 241, 0.15);
      border-color: var(--accent);
      color: var(--text);
    }

    table {
      width: 100%;
      border-collapse: collapse;
      text-align: left;
    }

    th {
      background: rgba(0, 0, 0, 0.2);
      color: var(--text-muted);
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      padding: 0.85rem 1.5rem;
      font-weight: 600;
    }

    td {
      padding: 1rem 1.5rem;
      border-bottom: 1px solid var(--card-border);
      font-size: 0.875rem;
    }

    tr:last-child td { border-bottom: none; }
    tr:hover td { background: rgba(255, 255, 255, 0.02); }

    .badge {
      display: inline-block;
      padding: 0.25rem 0.6rem;
      border-radius: 6px;
      font-size: 0.75rem;
      font-weight: 600;
      font-family: 'JetBrains Mono', monospace;
      text-transform: uppercase;
    }

    .badge-pending { background: rgba(245, 158, 11, 0.15); color: var(--warning); border: 1px solid rgba(245, 158, 11, 0.3); }
    .badge-active { background: rgba(56, 189, 248, 0.15); color: var(--info); border: 1px solid rgba(56, 189, 248, 0.3); }
    .badge-completed { background: rgba(16, 185, 129, 0.15); color: var(--success); border: 1px solid rgba(16, 185, 129, 0.3); }
    .badge-dead { background: rgba(239, 68, 68, 0.15); color: var(--danger); border: 1px solid rgba(239, 68, 68, 0.3); }

    .btn-retry {
      background: rgba(99, 102, 241, 0.2);
      border: 1px solid var(--accent);
      color: #fff;
      padding: 0.3rem 0.7rem;
      border-radius: 6px;
      cursor: pointer;
      font-size: 0.75rem;
      font-weight: 600;
      transition: all 0.2s;
    }

    .btn-retry:hover {
      background: var(--accent);
      box-shadow: 0 0 12px var(--accent-glow);
    }

    .code-snippet {
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.8rem;
      background: rgba(0, 0, 0, 0.3);
      padding: 0.2rem 0.4rem;
      border-radius: 4px;
      color: #e2e8f0;
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div class="logo">
        <div class="logo-icon">⚡</div>
        <div class="logo-text">
          <h1>TaskPulse Dashboard</h1>
          <p>Queue: <strong>${queueName}</strong> | Storage: SQLite (WAL)</p>
        </div>
      </div>
      <div class="status-badge">
        <div class="pulse-dot"></div>
        <span>Live Engine Active</span>
      </div>
    </header>

    <div class="stats-grid">
      <div class="stat-card stat-pending">
        <div class="stat-label">Pending Tasks</div>
        <div class="stat-value" id="val-pending">0</div>
      </div>
      <div class="stat-card stat-active">
        <div class="stat-label">Active / In-Flight</div>
        <div class="stat-value" id="val-active">0</div>
      </div>
      <div class="stat-card stat-completed">
        <div class="stat-label">Completed</div>
        <div class="stat-value" id="val-completed">0</div>
      </div>
      <div class="stat-card stat-dead">
        <div class="stat-label">Dead Letter (DLQ)</div>
        <div class="stat-value" id="val-dead">0</div>
      </div>
    </div>

    <div class="jobs-section">
      <div class="section-header">
        <h2>Task Inspector</h2>
        <div class="filter-tabs">
          <button class="tab-btn active" onclick="setFilter('')">All</button>
          <button class="tab-btn" onclick="setFilter('pending')">Pending</button>
          <button class="tab-btn" onclick="setFilter('active')">Active</button>
          <button class="tab-btn" onclick="setFilter('completed')">Completed</button>
          <button class="tab-btn" onclick="setFilter('dead')">Dead (DLQ)</button>
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th>Job Name</th>
            <th>ID</th>
            <th>State</th>
            <th>Attempts</th>
            <th>Payload</th>
            <th>Error / Result</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody id="jobs-tbody">
          <tr><td colspan="7" style="text-align:center; color: var(--text-muted);">Loading tasks...</td></tr>
        </tbody>
      </table>
    </div>
  </div>

  <script>
    let currentFilter = '';

    function setFilter(state) {
      currentFilter = state;
      document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.textContent.toLowerCase().includes(state) || (state === '' && btn.textContent === 'All'));
      });
      fetchData();
    }

    async function retryJob(id) {
      try {
        const res = await fetch('/api/jobs/' + id + '/retry', { method: 'POST' });
        if (res.ok) {
          fetchData();
        }
      } catch (err) {
        console.error('Failed to retry job', err);
      }
    }

    async function fetchData() {
      try {
        const statsRes = await fetch('/api/stats');
        const stats = await statsRes.json();
        document.getElementById('val-pending').textContent = stats.pending;
        document.getElementById('val-active').textContent = stats.active;
        document.getElementById('val-completed').textContent = stats.completed;
        document.getElementById('val-dead').textContent = stats.dead;

        const url = currentFilter ? '/api/jobs?state=' + currentFilter : '/api/jobs';
        const jobsRes = await fetch(url);
        const jobs = await jobsRes.json();

        const tbody = document.getElementById('jobs-tbody');
        if (!jobs || jobs.length === 0) {
          tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; color: var(--text-muted); padding: 2rem;">No jobs found</td></tr>';
          return;
        }

        tbody.innerHTML = jobs.map(j => {
          const payloadStr = JSON.stringify(j.data).slice(0, 35) + (JSON.stringify(j.data).length > 35 ? '...' : '');
          const errorOrResult = j.error ? '<span style="color:var(--danger)">' + j.error.slice(0, 30) + '</span>' : (j.result ? JSON.stringify(j.result).slice(0, 30) : '-');
          const retryBtn = j.state === 'dead' ? '<button class="btn-retry" onclick="retryJob(\'' + j.id + '\')">Retry</button>' : '-';

          return '<tr>' +
            '<td><strong>' + j.name + '</strong></td>' +
            '<td><span class="code-snippet">' + j.id.slice(0, 8) + '</span></td>' +
            '<td><span class="badge badge-' + j.state + '">' + j.state + '</span></td>' +
            '<td>' + j.attempts + ' / ' + j.maxAttempts + '</td>' +
            '<td><span class="code-snippet">' + payloadStr + '</span></td>' +
            '<td>' + errorOrResult + '</td>' +
            '<td>' + retryBtn + '</td>' +
          '</tr>';
        }).join('');
      } catch (err) {
        console.error('Error fetching dashboard data', err);
      }
    }

    fetchData();
    setInterval(fetchData, 2000);
  </script>
</body>
</html>`;
}
