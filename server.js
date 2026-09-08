const http = require("http");
require("dotenv").config();
const { runOnce, pickRandomGeo, USE_BROWSERBASE } = require("./bot");

const PORT = process.env.PORT || 3100;

// ===== 全局状态：流量生成器 =====
// pending: 待执行数量; running: 当前并发数; maxConcurrent: 最大并发
// avgIntervalSec: 泊松分布的平均间隔（秒）
const state = {
  pending: 0,
  running: 0,
  maxConcurrent: 2,
  avgIntervalSec: 30, // 平均间隔，前端可调
  results: [], // 最近的结果（保留最新 100 条）
  totalExecuted: 0,
  totalSuccess: 0,
  totalFail: 0,
  targetUrl: "https://cnhzbingxing.en.alibaba.com/company_profile.html",
  schedulerActive: false,
};

//https://szkeywords.en.alibaba.com/index.html?spm=a2700.shop_cp.88.15.35c33262tC2wGo

// ===== 泊松分布：指数分布间隔 =====
// 间隔 = -ln(U) * mean，U 为 (0,1) 均匀随机数
function poissonInterval(meanSec) {
  const u = Math.random();
  return -Math.log(u) * meanSec;
}

// ===== 调度循环 =====
async function schedulerLoop() {
  if (state.schedulerActive) return;
  state.schedulerActive = true;

  while (true) {
    // 没有待执行 或 并发已满 → 等待
    if (state.pending <= 0 || state.running >= state.maxConcurrent) {
      await sleep(1000);
      continue;
    }

    // 泊松分布间隔
    const interval = poissonInterval(state.avgIntervalSec);
    const waitMs = Math.min(Math.max(interval * 1000, 2000), 60000); // 2-60 秒
    console.log(`[调度] 等待 ${Math.round(waitMs / 1000)}s 后启动下一个 (pending: ${state.pending})`);
    await sleep(waitMs);

    // 等待期间 pending 可能被取消
    if (state.pending <= 0 || state.running >= state.maxConcurrent) continue;

    // 消费一个 pending
    state.pending--;
    state.running++;

    const geo = pickRandomGeo();
    const geoStr = geo.state ? `${geo.country}/${geo.state}` : geo.country;
    console.log(`[调度] 启动访问 [${geoStr}] (running: ${state.running}, pending: ${state.pending})`);

    runOnce({
      targetUrl: state.targetUrl,
      geo,
      onLog: (msg) => console.log(`[${geoStr}] ${msg}`),
    }).then((result) => {
      state.running--;
      state.totalExecuted++;
      if (result.success) state.totalSuccess++;
      else state.totalFail++;

      // 保留最新 100 条
      state.results.unshift(result);
      if (state.results.length > 100) state.results.pop();
    });
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ===== HTML 页面 =====
const HTML = `<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Browserbase 流量生成器</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0f1117; color: #e1e4e8; padding: 24px; }
  h1 { font-size: 22px; margin-bottom: 20px; }
  .card { background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 20px; margin-bottom: 20px; }
  label { display: block; font-size: 13px; color: #8b949e; margin-bottom: 6px; }
  input[type=text], input[type=number] { width: 100%; padding: 10px 12px; background: #0d1117; border: 1px solid #30363d; border-radius: 6px; color: #e1e4e8; font-size: 14px; margin-bottom: 16px; }
  input:focus { outline: none; border-color: #58a6ff; }
  .row { display: flex; gap: 12px; align-items: flex-end; }
  .row > div { flex: 1; }
  button { padding: 10px 20px; border: none; border-radius: 6px; color: #fff; font-size: 14px; cursor: pointer; }
  .btn-add { background: #238636; }
  .btn-add:hover { background: #2ea043; }
  .btn-cancel { background: #da3633; }
  .btn-cancel:hover { background: #f85149; }
  .btn-clear { background: #6e7681; }
  .btn-clear:hover { background: #8b949e; }
  button:disabled { background: #21262d; color: #6e7681; cursor: not-allowed; }
  .stats { display: grid; grid-template-columns: repeat(5, 1fr); gap: 12px; margin-top: 16px; }
  .stat { background: #0d1117; border: 1px solid #30363d; border-radius: 6px; padding: 14px; text-align: center; }
  .stat-num { font-size: 28px; font-weight: 700; }
  .stat-label { font-size: 12px; color: #8b949e; margin-top: 4px; }
  .stat-pending .stat-num { color: #d29922; }
  .stat-running .stat-num { color: #58a6ff; }
  .stat-success .stat-num { color: #3fb950; }
  .stat-fail .stat-num { color: #f85149; }
  .stat-total .stat-num { color: #e1e4e8; }
  .mode-badge { display: inline-block; padding: 2px 10px; border-radius: 12px; font-size: 12px; margin-left: 8px; }
  .mode-bb { background: #1f6feb; color: #fff; }
  .mode-local { background: #6e7681; color: #fff; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th { text-align: left; padding: 10px 12px; background: #1c2128; color: #8b949e; font-weight: 600; border-bottom: 1px solid #30363d; }
  td { padding: 10px 12px; border-bottom: 1px solid #21262d; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 12px; }
  .badge-ok { background: #238636; color: #fff; }
  .badge-fail { background: #da3633; color: #fff; }
  .empty { text-align: center; color: #6e7681; padding: 40px; }
  .hint { font-size: 12px; color: #6e7681; margin-top: 8px; }
</style>
</head>
<body>
  <h1>Browserbase 流量生成器 <span class="mode-badge __MODE_CLASS__">__MODE_LABEL__</span></h1>

  <div class="card">
    <label>目标 URL</label>
    <input type="text" id="url" value="__DEFAULT_URL__" placeholder="https://...">

    <div class="row">
      <div>
        <label>增加待执行数量</label>
        <input type="number" id="addCount" value="10" min="1" max="100">
      </div>
    </div>

    <div style="display:flex; gap:10px; margin-top:8px">
      <button class="btn-add" onclick="applySettings()">应用设置并增加</button>
      <button class="btn-cancel" onclick="cancelPending()">取消待执行</button>
      <button class="btn-clear" onclick="clearResults()">清空记录</button>
    </div>
    <div class="hint">泊松分布：大部分间隔接近平均值，偶尔会出现较长空档，模拟真实流量</div>
  </div>

  <div class="card">
    <div class="stats">
      <div class="stat stat-pending"><div class="stat-num" id="s-pending">0</div><div class="stat-label">待执行</div></div>
      <div class="stat stat-running"><div class="stat-num" id="s-running">0</div><div class="stat-label">进行中</div></div>
      <div class="stat stat-total"><div class="stat-num" id="s-total">0</div><div class="stat-label">总执行</div></div>
      <div class="stat stat-success"><div class="stat-num" id="s-success">0</div><div class="stat-label">成功</div></div>
      <div class="stat stat-fail"><div class="stat-num" id="s-fail">0</div><div class="stat-label">失败</div></div>
    </div>
  </div>

  <div class="card">
    <table>
      <thead>
        <tr><th>#</th><th>代理地区</th><th>状态</th><th>最终页面</th><th>耗时</th><th>错误</th></tr>
      </thead>
      <tbody id="results">
        <tr><td colspan="6" class="empty">尚无记录</td></tr>
      </tbody>
    </table>
  </div>

<script>
let pollTimer = null;

function applySettings() {
  const url = document.getElementById('url').value.trim();
  const addCount = parseInt(document.getElementById('addCount').value) || 1;

  fetch('/api/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, addCount })
  }).then(r => r.json()).then(d => {
    if (d.error) { alert(d.error); return; }
    startPolling();
  });
}

function cancelPending() {
  fetch('/api/cancel', { method: 'POST' })
    .then(r => r.json()).then(d => {
      document.getElementById('s-pending').textContent = d.pending;
    });
}

function clearResults() {
  fetch('/api/clear', { method: 'POST' }).then(() => renderStatus({ results: [], totalExecuted: 0, totalSuccess: 0, totalFail: 0, pending: 0, running: 0 }));
}

function startPolling() {
  if (pollTimer) return;
  pollTimer = setInterval(() => {
    fetch('/api/status').then(r => r.json()).then(renderStatus);
  }, 2000);
}

function renderStatus(d) {
  document.getElementById('s-pending').textContent = d.pending;
  document.getElementById('s-running').textContent = d.running;
  document.getElementById('s-total').textContent = d.totalExecuted;
  document.getElementById('s-success').textContent = d.totalSuccess;
  document.getElementById('s-fail').textContent = d.totalFail;

  const tbody = document.getElementById('results');
  if (!d.results || d.results.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty">尚无记录</td></tr>';
    return;
  }
  tbody.innerHTML = d.results.map((r, i) => {
    const badge = r.success ? '<span class="badge badge-ok">成功</span>' : '<span class="badge badge-fail">失败</span>';
    return '<tr>' +
      '<td>' + (i+1) + '</td>' +
      '<td>' + (r.geo || '-') + '</td>' +
      '<td>' + badge + '</td>' +
      '<td>' + (r.title || '-') + '</td>' +
      '<td>' + (r.duration || 0) + 's</td>' +
      '<td>' + (r.error || '') + '</td>' +
    '</tr>';
  }).join('');
}

// 页面加载后开始轮询
startPolling();
</script>
</body>
</html>`;

// ===== HTTP Server =====
const server = http.createServer((req, res) => {
  // 首页
  if (req.method === "GET" && req.url === "/") {
    const modeLabel = USE_BROWSERBASE ? "Browserbase" : "本地浏览器";
    const modeClass = USE_BROWSERBASE ? "mode-bb" : "mode-local";
    const html = HTML
      .replace("__MODE_LABEL__", modeLabel)
      .replace("__MODE_CLASS__", modeClass)
      .replace("__DEFAULT_URL__", state.targetUrl);
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(html);
    return;
  }

  // 配置 + 增加待执行
  if (req.method === "POST" && req.url === "/api/config") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try {
        const { url, addCount } = JSON.parse(body);
        if (url) state.targetUrl = url;
        if (addCount) state.pending += Math.min(Math.max(addCount, 1), 100);

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          pending: state.pending,
          targetUrl: state.targetUrl,
        }));
      } catch (e) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // 取消待执行
  if (req.method === "POST" && req.url === "/api/cancel") {
    state.pending = 0;
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ pending: state.pending }));
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
      pending: state.pending,
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
  console.log(`  模式: ${USE_BROWSERBASE ? "Browserbase" : "本地浏览器（未配 BB_API_KEY）"}`);
  console.log(`  默认间隔: ${state.avgIntervalSec}s, 最大并发: ${state.maxConcurrent}\n`);

  // 启动调度循环
  schedulerLoop();
});
