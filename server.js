const http = require("http");
require("dotenv").config();
const { runOnce, USE_APIFY, USE_BROWSERBASE } = require("./bot");

const PORT = process.env.PORT || 3100;

// ===== 全局状态 =====
const state = {
  running: false,
  results: [],
  totalExecuted: 0,
  totalSuccess: 0,
  totalFail: 0,
  targetUrl: "https://cnhzbingxing.en.alibaba.com/company_profile.html",
};

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
  input[type=text] { width: 100%; padding: 10px 12px; background: #0d1117; border: 1px solid #30363d; border-radius: 6px; color: #e1e4e8; font-size: 14px; margin-bottom: 16px; }
  input:focus { outline: none; border-color: #58a6ff; }
  button { padding: 10px 20px; border: none; border-radius: 6px; color: #fff; font-size: 14px; cursor: pointer; }
  .btn-run { background: #238636; }
  .btn-run:hover { background: #2ea043; }
  .btn-clear { background: #6e7681; }
  .btn-clear:hover { background: #8b949e; }
  button:disabled { background: #21262d; color: #6e7681; cursor: not-allowed; }
  .stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-top: 16px; }
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
  .empty { text-align: center; color: #6e7681; padding: 40px; }
</style>
</head>
<body>
  <h1>Apify 流量生成器 <span class="mode-badge">__MODE_LABEL__</span></h1>

  <div class="card">
    <label>目标 URL</label>
    <input type="text" id="url" value="__DEFAULT_URL__" placeholder="https://...">
    <div style="margin-top:8px">
      <button class="btn-run" id="btn-run" onclick="runOnce()">执行一次</button>
      <button class="btn-clear" onclick="clearResults()">清空记录</button>
    </div>
  </div>

  <div class="card">
    <div class="stats">
      <div class="stat stat-running"><div class="stat-num" id="s-running">0</div><div class="stat-label">进行中</div></div>
      <div class="stat stat-total"><div class="stat-num" id="s-total">0</div><div class="stat-label">总执行</div></div>
      <div class="stat stat-success"><div class="stat-num" id="s-success">0</div><div class="stat-label">成功</div></div>
      <div class="stat stat-fail"><div class="stat-num" id="s-fail">0</div><div class="stat-label">失败</div></div>
    </div>
  </div>

  <div class="card">
    <table>
      <thead>
        <tr><th>#</th><th>状态</th><th>标题</th><th>耗时</th><th>错误</th></tr>
      </thead>
      <tbody id="results">
        <tr><td colspan="5" class="empty">尚无记录</td></tr>
      </tbody>
    </table>
  </div>

<script>
let pollTimer = null;

function runOnce() {
  const url = document.getElementById('url').value.trim();
  document.getElementById('btn-run').disabled = true;
  fetch('/api/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url })
  }).then(r => r.json()).then(d => {
    if (d.error) alert(d.error);
    startPolling();
  });
}

function clearResults() {
  fetch('/api/clear', { method: 'POST' }).then(() => renderStatus({ results: [], totalExecuted: 0, totalSuccess: 0, totalFail: 0, running: false }));
}

function startPolling() {
  if (pollTimer) return;
  pollTimer = setInterval(() => {
    fetch('/api/status').then(r => r.json()).then(d => {
      renderStatus(d);
      document.getElementById('btn-run').disabled = d.running;
    });
  }, 2000);
}

function renderStatus(d) {
  document.getElementById('s-running').textContent = d.running ? 1 : 0;
  document.getElementById('s-total').textContent = d.totalExecuted;
  document.getElementById('s-success').textContent = d.totalSuccess;
  document.getElementById('s-fail').textContent = d.totalFail;

  const tbody = document.getElementById('results');
  if (!d.results || d.results.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="empty">尚无记录</td></tr>';
    return;
  }
  tbody.innerHTML = d.results.map((r, i) => {
    const badge = r.success ? '<span class="badge badge-ok">成功</span>' : '<span class="badge badge-fail">失败</span>';
    return '<tr>' +
      '<td>' + (i+1) + '</td>' +
      '<td>' + badge + '</td>' +
      '<td>' + (r.title || '-') + '</td>' +
      '<td>' + (r.duration || 0) + 's</td>' +
      '<td>' + (r.error || '') + '</td>' +
    '</tr>';
  }).join('');
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

  // 执行一次
  if (req.method === "POST" && req.url === "/api/run") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try {
        if (state.running) {
          res.writeHead(409, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "正在执行中，请等待完成" }));
          return;
        }
        const { url } = JSON.parse(body);
        if (url) state.targetUrl = url;
        state.running = true;
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true }));

        runOnce({
          targetUrl: state.targetUrl,
          onLog: (msg) => console.log(msg),
        }).then((result) => {
          state.running = false;
          state.totalExecuted++;
          if (result.success) state.totalSuccess++;
          else state.totalFail++;
          state.results.unshift(result);
          if (state.results.length > 100) state.results.pop();
        });
      } catch (e) {
        state.running = false;
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // 清空记录
  if (req.method === "POST" && req.url === "/api/clear") {
    state.results = [];
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
      running: state.running,
      totalExecuted: state.totalExecuted,
      totalSuccess: state.totalSuccess,
      totalFail: state.totalFail,
      results: state.results,
    }));
    return;
  }

  res.writeHead(404);
  res.end("Not Found");
});

server.listen(PORT, () => {
  console.log(`\n  流量生成器已启动: http://localhost:${PORT}`);
  const mode = USE_APIFY ? "Apify" : (USE_BROWSERBASE ? "Browserbase" : "本地浏览器");
  console.log(`  模式: ${mode}\n`);
});
