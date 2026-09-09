const http = require("http");
require("dotenv").config();
const { runOnce, USE_APIFY, USE_BROWSERBASE } = require("./bot");

const PORT = process.env.PORT || 3100;
const MAX_CONCURRENT = 2;

// ===== 全局状态 =====
const state = {
  groups: [],       // [{ id, durationMin, total, success, fail, status, results: [] }]
  totalExecuted: 0,
  totalSuccess: 0,
  totalFail: 0,
  targetUrl: "https://cnhzbingxing.en.alibaba.com/company_profile.html",
};

let groupIdCounter = 0;

// ===== 全局并发调度器（最多 2 并发）=====
const scheduler = {
  running: 0,
  queue: [],  // [{ group, index, scheduledTime, targetUrl, execute }]
};

function trySchedule() {
  const now = Date.now();
  // 启动所有已到时间且并发未满的任务
  while (scheduler.running < MAX_CONCURRENT && scheduler.queue.length > 0) {
    // 找到最早可执行的任务
    const next = scheduler.queue[0];
    if (next.scheduledTime > now) break;  // 还没到时间

    scheduler.queue.shift();
    scheduler.running++;

    const { group, index, targetUrl } = next;
    console.log(`[组${group.id} #${index + 1}] 开始访问`);

    runOnce({
      targetUrl,
      onLog: (msg) => console.log(`[组${group.id} #${index + 1}] ${msg}`),
    }).then((result) => {
      group.results[index] = result;
      group.total++;
      state.totalExecuted++;
      if (result.success) {
        group.success++;
        state.totalSuccess++;
      } else {
        group.fail++;
        state.totalFail++;
      }
      scheduler.running--;

      // 检查该组是否完成
      if (group.total >= group.count) {
        group.status = "done";
        console.log(`[组${group.id}] 完成: 成功 ${group.success}, 失败 ${group.fail}`);
      }

      trySchedule();
    });
  }

  // 如果队列还有任务，设置定时器等下一个
  if (scheduler.queue.length > 0 && scheduler.running < MAX_CONCURRENT) {
    const next = scheduler.queue[0];
    const waitMs = next.scheduledTime - Date.now();
    if (waitMs > 0) {
      setTimeout(trySchedule, waitMs);
    }
  }
}

// ===== 调度一组访问 =====
function runGroup(groupId, targetUrl, startMs, endMs, count) {
  const group = state.groups.find(g => g.id === groupId);
  if (!group) return;

  const log = (msg) => console.log(`[组${groupId}] ${msg}`);
  const durationMs = endMs - startMs;

  // 在 startMs ~ endMs 内按泊松分布生成 count 个时间点
  // 泊松过程：间隔服从指数分布，λ = count / durationSec
  const lambda = count / durationMs; // 每毫秒平均事件数
  const times = [];
  let t = 0;
  while (times.length < count && t < durationMs) {
    // 指数分布的间隔：-ln(U) / lambda
    const u = Math.random();
    const interval = -Math.log(u) / lambda;
    t += interval;
    if (t < durationMs) times.push(t);
  }
  // 如果不够 count 个（泊松分布随机性导致），补齐到 count
  while (times.length < count) {
    times.push(Math.random() * durationMs);
  }
  times.sort((a, b) => a - b);

  log(`开始: ${count} 次访问, 时间范围 ${new Date(startMs).toLocaleTimeString()} ~ ${new Date(endMs).toLocaleTimeString()}, 全局最多 ${MAX_CONCURRENT} 并发`);

  // 加入全局队列
  for (let i = 0; i < count; i++) {
    scheduler.queue.push({
      group,
      index: i,
      scheduledTime: startMs + times[i],
      targetUrl,
    });
  }

  // 按时间排序
  scheduler.queue.sort((a, b) => a.scheduledTime - b.scheduledTime);

  trySchedule();
}

// ===== 单次访问（立即执行，不走调度器）=====
function runSingle(targetUrl) {
  const id = ++groupIdCounter;
  const group = {
    id,
    startTime: Date.now(),
    endTime: Date.now(),
    count: 1,
    total: 0,
    success: 0,
    fail: 0,
    status: "running",
    results: [null],
  };
  state.groups.unshift(group);

  console.log(`[组${id} #1] 单次触发开始`);
  runOnce({
    targetUrl,
    onLog: (msg) => console.log(`[组${id} #1] ${msg}`),
  }).then((result) => {
    group.results[0] = result;
    group.total = 1;
    state.totalExecuted++;
    if (result.success) {
      group.success = 1;
      state.totalSuccess++;
    } else {
      group.fail = 1;
      state.totalFail++;
    }
    group.status = "done";
    console.log(`[组${id}] 完成: ${result.success ? '成功' : '失败'}`);
  });
}

// ===== HTML 页面 =====
const HTML = `<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Apify 流量生成器</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0f1117; color: #e1e4e8; padding: 24px; }
  h1 { font-size: 22px; margin-bottom: 20px; }
  .card { background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 20px; margin-bottom: 20px; }
  label { display: block; font-size: 13px; color: #8b949e; margin-bottom: 6px; }
  input[type=text], input[type=number] { padding: 10px 12px; background: #0d1117; border: 1px solid #30363d; border-radius: 6px; color: #e1e4e8; font-size: 14px; }
  input[type=text] { width: 100%; margin-bottom: 16px; }
  .form-row { display: flex; gap: 16px; margin-bottom: 16px; }
  .form-row .form-item { flex: 1; }
  .form-row input { width: 100%; }
  input:focus { outline: none; border-color: #58a6ff; }
  button { padding: 10px 20px; border: none; border-radius: 6px; color: #fff; font-size: 14px; cursor: pointer; }
  .btn-run { background: #238636; }
  .btn-run:hover { background: #2ea043; }
  .btn-clear { background: #6e7681; }
  .btn-clear:hover { background: #8b949e; }
  button:disabled { background: #21262d; color: #6e7681; cursor: not-allowed; }
  .stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
  .stat { background: #0d1117; border: 1px solid #30363d; border-radius: 6px; padding: 14px; text-align: center; }
  .stat-num { font-size: 28px; font-weight: 700; }
  .stat-label { font-size: 12px; color: #8b949e; margin-top: 4px; }
  .stat-running .stat-num { color: #58a6ff; }
  .stat-success .stat-num { color: #3fb950; }
  .stat-fail .stat-num { color: #f85149; }
  .stat-total .stat-num { color: #e1e4e8; }
  .mode-badge { display: inline-block; padding: 2px 10px; border-radius: 12px; font-size: 12px; margin-left: 8px; background: #1f6feb; color: #fff; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th { text-align: left; padding: 10px 12px; background: #1c2128; color: #8b949e; font-weight: 600; border-bottom: 1px solid #30363d; }
  td { padding: 10px 12px; border-bottom: 1px solid #21262d; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 12px; }
  .badge-ok { background: #238636; color: #fff; }
  .badge-fail { background: #da3633; color: #fff; }
  .badge-running { background: #1f6feb; color: #fff; }
  .badge-done { background: #30363d; color: #8b949e; }
  .empty { text-align: center; color: #6e7681; padding: 40px; }
  .group-row { cursor: pointer; }
  .group-row:hover { background: #161b22; }
  .group-detail { background: #0d1117; }
  .group-detail td { padding-left: 32px; color: #8b949e; }
  .expand-icon { display: inline-block; width: 16px; transition: transform 0.2s; }
  .expanded .expand-icon { transform: rotate(90deg); }
  .progress-bar { display: inline-block; width: 80px; height: 6px; background: #21262d; border-radius: 3px; vertical-align: middle; margin-left: 8px; }
  .progress-fill { height: 100%; background: #3fb950; border-radius: 3px; transition: width 0.3s; }
</style>
</head>
<body>
  <h1>Apify 流量生成器 <span class="mode-badge">__MODE_LABEL__</span></h1>

  <div class="card">
    <label>目标 URL</label>
    <input type="text" id="url" value="__DEFAULT_URL__" placeholder="https://...">
    <div class="form-row">
      <div class="form-item">
        <label>开始时间</label>
        <input type="datetime-local" id="startTime" step="60">
      </div>
      <div class="form-item">
        <label>结束时间</label>
        <input type="datetime-local" id="endTime" step="60">
      </div>
      <div class="form-item">
        <label>访问次数</label>
        <input type="number" id="count" value="3" min="1" max="100">
      </div>
    </div>
    <div style="margin-top:8px">
      <button class="btn-run" id="btn-run" onclick="startGroup()">开始一组</button>
      <button class="btn-run" id="btn-once" onclick="runOnce()" style="background:#1f6feb">单次触发</button>
      <button class="btn-clear" onclick="clearResults()">清空记录</button>
    </div>
  </div>

  <div class="card">
    <div class="stats">
      <div class="stat stat-running"><div class="stat-num" id="s-running">0</div><div class="stat-label">进行中组数</div></div>
      <div class="stat stat-total"><div class="stat-num" id="s-total">0</div><div class="stat-label">总执行</div></div>
      <div class="stat stat-success"><div class="stat-num" id="s-success">0</div><div class="stat-label">成功</div></div>
      <div class="stat stat-fail"><div class="stat-num" id="s-fail">0</div><div class="stat-label">失败</div></div>
    </div>
  </div>

  <div class="card">
    <table>
      <thead>
        <tr><th></th><th>组</th><th>状态</th><th>时间范围</th><th>总数</th><th>成功</th><th>失败</th><th>进度</th></tr>
      </thead>
      <tbody id="groups">
        <tr><td colspan="8" class="empty">尚无记录</td></tr>
      </tbody>
    </table>
  </div>

<script>
let pollTimer = null;
let expandedGroups = new Set();

// 设置默认时间（现在到2分钟后）
function setDefaultTimes() {
  const now = new Date();
  const later = new Date(now.getTime() + 2 * 60 * 1000);
  const fmt = (d) => {
    const pad = (n) => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + pad(d.getMonth()+1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  };
  document.getElementById('startTime').value = fmt(now);
  document.getElementById('endTime').value = fmt(later);
}
setDefaultTimes();

function startGroup() {
  const url = document.getElementById('url').value.trim();
  const startTime = document.getElementById('startTime').value;
  const endTime = document.getElementById('endTime').value;
  const count = parseInt(document.getElementById('count').value);
  if (!url || !startTime || !endTime || !count) { alert('请填写所有字段'); return; }

  const start = new Date(startTime).getTime();
  const end = new Date(endTime).getTime();
  if (end <= start) { alert('结束时间必须大于开始时间'); return; }

  const durationSec = (end - start) / 1000;
  const avgInterval = durationSec / count;
  if (avgInterval < 30) { alert('平均频率不能超过 30s/次，当前 ' + avgInterval.toFixed(1) + 's/次。请增大时间范围或减少次数。'); return; }

  fetch('/api/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, startTime: start, endTime: end, count })
  }).then(r => r.json()).then(d => {
    if (d.error) alert(d.error);
    startPolling();
  });
}

function runOnce() {
  const url = document.getElementById('url').value.trim();
  if (!url) { alert('请填写 URL'); return; }
  fetch('/api/single', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url })
  }).then(r => r.json()).then(d => {
    if (d.error) alert(d.error);
    startPolling();
  });
}

function clearResults() {
  fetch('/api/clear', { method: 'POST' }).then(() => {
    expandedGroups.clear();
    renderStatus({ groups: [], totalExecuted: 0, totalSuccess: 0, totalFail: 0 });
  });
}

function toggleGroup(id) {
  if (expandedGroups.has(id)) expandedGroups.delete(id);
  else expandedGroups.add(id);
  fetch('/api/status').then(r => r.json()).then(renderStatus);
}

function startPolling() {
  if (pollTimer) return;
  pollTimer = setInterval(() => {
    fetch('/api/status').then(r => r.json()).then(d => {
      renderStatus(d);
    });
  }, 2000);
}

function renderStatus(d) {
  document.getElementById('s-total').textContent = d.totalExecuted;
  document.getElementById('s-success').textContent = d.totalSuccess;
  document.getElementById('s-fail').textContent = d.totalFail;
  const running = d.groups.filter(g => g.status === 'running').length;
  document.getElementById('s-running').textContent = running;

  const tbody = document.getElementById('groups');
  if (!d.groups || d.groups.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" class="empty">尚无记录</td></tr>';
    return;
  }

  let html = '';
  d.groups.forEach((g, i) => {
    const expanded = expandedGroups.has(g.id);
    const statusBadge = g.status === 'running'
      ? '<span class="badge badge-running">进行中</span>'
      : '<span class="badge badge-done">完成</span>';
    const progress = g.total > 0 ? Math.round(g.total / g.count * 100) : 0;
    const expandIcon = expanded ? '<span class="expand-icon">▶</span>' : '<span class="expand-icon">▶</span>';
    const fmtTime = (ts) => {
      if (!ts) return '-';
      const d = new Date(ts);
      return d.getHours().toString().padStart(2,'0') + ':' + d.getMinutes().toString().padStart(2,'0');
    };
    const timeRange = fmtTime(g.startTime) + ' ~ ' + fmtTime(g.endTime);

    html += '<tr class="group-row' + (expanded ? ' expanded' : '') + '" onclick="toggleGroup(' + g.id + ')">' +
      '<td>' + expandIcon + '</td>' +
      '<td>#' + (i + 1) + '</td>' +
      '<td>' + statusBadge + '</td>' +
      '<td>' + timeRange + '</td>' +
      '<td>' + g.total + '/' + g.count + '</td>' +
      '<td style="color:#3fb950">' + g.success + '</td>' +
      '<td style="color:#f85149">' + g.fail + '</td>' +
      '<td>' + progress + '%<span class="progress-bar"><span class="progress-fill" style="width:' + progress + '%"></span></span></td>' +
    '</tr>';

    if (expanded) {
      if (g.results.length === 0) {
        html += '<tr class="group-detail"><td colspan="8">暂无结果</td></tr>';
      } else {
        g.results.forEach((r, j) => {
          if (!r) {
            html += '<tr class="group-detail"><td colspan="8">#' + (j+1) + ' 等待中...</td></tr>';
          } else {
            const badge = r.success ? '<span class="badge badge-ok">成功</span>' : '<span class="badge badge-fail">失败</span>';
            html += '<tr class="group-detail">' +
              '<td></td>' +
              '<td>#' + (j+1) + '</td>' +
              '<td>' + badge + '</td>' +
              '<td colspan="2">' + (r.title || '-') + '</td>' +
              '<td>' + (r.duration || 0) + 's</td>' +
              '<td colspan="2">' + (r.error || '') + '</td>' +
            '</tr>';
          }
        });
      }
    }
  });
  tbody.innerHTML = html;
}

startPolling();
</script>
</body>
</html>`;

// ===== HTTP Server =====
const server = http.createServer((req, res) => {
  if (req.method === "GET" && req.url === "/") {
    const modeLabel = USE_APIFY ? "Apify" : (USE_BROWSERBASE ? "Browserbase" : "本地浏览器");
    const html = HTML
      .replace("__MODE_LABEL__", modeLabel)
      .replace("__DEFAULT_URL__", state.targetUrl);
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(html);
    return;
  }

  // 开始一组
  if (req.method === "POST" && req.url === "/api/start") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try {
        const { url, startTime, endTime, count } = JSON.parse(body);
        if (url) state.targetUrl = url;

        const id = ++groupIdCounter;
        const group = {
          id,
          startTime,
          endTime,
          count,
          total: 0,
          success: 0,
          fail: 0,
          status: "running",
          results: new Array(count).fill(null),
        };
        state.groups.unshift(group);

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, groupId: id }));

        runGroup(id, state.targetUrl, startTime, endTime, count);
      } catch (e) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // 单次触发
  if (req.method === "POST" && req.url === "/api/single") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try {
        const { url } = JSON.parse(body);
        if (url) state.targetUrl = url;
        runSingle(state.targetUrl);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
      } catch (e) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // 清空记录
  if (req.method === "POST" && req.url === "/api/clear") {
    state.groups = [];
    state.totalExecuted = 0;
    state.totalSuccess = 0;
    state.totalFail = 0;
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  // 状态
  if (req.method === "GET" && req.url === "/api/status") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      groups: state.groups.map(g => ({
        id: g.id,
        startTime: g.startTime,
        endTime: g.endTime,
        count: g.count,
        total: g.total,
        success: g.success,
        fail: g.fail,
        status: g.status,
        results: g.results,
      })),
      totalExecuted: state.totalExecuted,
      totalSuccess: state.totalSuccess,
      totalFail: state.totalFail,
    }));
    return;
  }

  res.writeHead(404);
  res.end("Not Found");
});

server.listen(PORT, () => {
  console.log(`\n  流量生成器已启动: http://localhost:${PORT}`);
  const mode = USE_APIFY ? "Apify" : (USE_BROWSERBASE ? "Browserbase" : "本地浏览器");
  console.log(`  模式: ${mode}`);
  console.log(`  最大并发: ${MAX_CONCURRENT}\n`);
});
