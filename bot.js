const { chromium } = require("playwright");
const { path: cursorPath } = require("ghost-cursor");
const { GhostCursor } = require("ghost-cursor");
require("dotenv").config();

// ===== 配置 =====
const BB_API_KEY = process.env.BB_API_KEY || "";
const BB_API = "https://api.browserbase.com/v1/sessions";
const USE_BROWSERBASE = BB_API_KEY.length > 0;

// ===== 国家+州+时区+locale 配置池 =====
const COUNTRY_POOL = [
  { country: "US", states: ["CA", "NY", "TX", "FL", "WA", "IL", "MA", "OR", "GA", "NC", "VA", "MI", "PA", "OH", "NJ", "AZ", "CO", "MN", "WI", "MD"], timezone: "America/New_York", locale: "en-US" },
  { country: "GB", states: [], timezone: "Europe/London", locale: "en-GB" },
  { country: "DE", states: [], timezone: "Europe/Berlin", locale: "de-DE" },
  { country: "FR", states: [], timezone: "Europe/Paris", locale: "fr-FR" },
  { country: "JP", states: [], timezone: "Asia/Tokyo", locale: "ja-JP" },
  { country: "CA", states: [], timezone: "America/Toronto", locale: "en-CA" },
  { country: "AU", states: [], timezone: "Australia/Sydney", locale: "en-AU" },
];

function pickRandomGeo() {
  const entry = COUNTRY_POOL[Math.floor(Math.random() * COUNTRY_POOL.length)];
  const geo = { country: entry.country, timezone: entry.timezone, locale: entry.locale };
  if (entry.states.length > 0 && Math.random() < 0.7) {
    geo.state = entry.states[Math.floor(Math.random() * entry.states.length)];
  }
  return geo;
}

// ===== 工具函数 =====
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function rand(min, max) {
  return Math.random() * (max - min) + min;
}

function randInt(min, max) {
  return Math.floor(rand(min, max + 1));
}

// ===== 贝塞尔曲线鼠标移动（基于 ghost-cursor 的 path 生成轨迹） =====
// 记录当前鼠标位置，模拟真实人类的曲线+加减速移动
let currentMousePos = { x: 100, y: 100 };

async function bezierMove(page, endX, endY, log) {
  const start = { x: currentMousePos.x, y: currentMousePos.y };
  const end = { x: endX, y: endY };
  // 使用 useTimestamps 生成带时间戳的轨迹，模拟人类加减速
  const points = cursorPath(start, end, { useTimestamps: true });
  if (log) log(`  鼠标移动: (${Math.round(start.x)}, ${Math.round(start.y)}) → (${Math.round(endX)}, ${Math.round(endY)}) 共${points.length}步`);
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    await page.mouse.move(p.x, p.y);
    // 根据时间戳计算延迟，实现加减速
    if (i < points.length - 1) {
      const dt = points[i + 1].timestamp - p.timestamp;
      await sleep(Math.max(1, dt));
    }
  }
  currentMousePos = { x: endX, y: endY };
}

// ===== 创建 Browserbase Session =====
async function createSession(geo) {
  const proxyConfig = geo
    ? [{ type: "browserbase", geolocation: { country: geo.country, state: geo.state, city: geo.city } }]
    : true;

  const resp = await fetch(BB_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-bb-api-key": BB_API_KEY,
    },
    body: JSON.stringify({
      proxies: proxyConfig,
      browserSettings: {
        solveCaptchas: true,
        blockAds: true,
      },
    }),
  });

  if (!resp.ok) {
    throw new Error(`创建 Session 失败: ${resp.status} ${await resp.text()}`);
  }

  return await resp.json();
}

// ===== 关闭 Session =====
async function closeSession(sessionId) {
  try {
    await fetch(`${BB_API}/${sessionId}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-bb-api-key": BB_API_KEY,
      },
      body: JSON.stringify({ status: "REQUEST_RELEASE" }),
    });
  } catch (e) {
    // 忽略
  }
}

// ===== 模拟人类滚动 =====
async function humanScroll(page, log) {
  const scrollTimes = randInt(2, 5);
  log(`  滚动 ${scrollTimes} 次`);

  for (let i = 0; i < scrollTimes; i++) {
    const direction = Math.random() > 0.2 ? 1 : -1;
    const distance = randInt(100, 500) * direction;
    const steps = randInt(3, 8);

    await page.mouse.wheel(0, distance / steps);
    for (let s = 0; s < steps; s++) {
      await page.mouse.wheel(0, distance / steps);
      await sleep(rand(50, 200));
    }
    await sleep(rand(500, 2000));
  }
}

// ===== 模拟人类鼠标移动（贝塞尔曲线） =====
async function humanMouseMove(page, log) {
  const moveTimes = randInt(2, 5);
  for (let i = 0; i < moveTimes; i++) {
    const x = randInt(100, 1200);
    const y = randInt(100, 800);
    await bezierMove(page, x, y);
    await sleep(rand(200, 800));
  }
}

// ===== 模拟人类点击（导航菜单） =====
async function humanClick(page, log) {
  const navLinks = await page.$$(".nav-link");
  const visibleLinks = [];
  for (const link of navLinks) {
    if (await link.isVisible().catch(() => false)) {
      const title = await link.$(".nav-title")
        .then((el) => (el ? el.innerText() : ""))
        .catch(() => "");
      if (title) visibleLinks.push(link);
    }
  }
  if (visibleLinks.length === 0) {
    log("  没有找到导航菜单");
    return false;
  }
  return clickNavLink(page, visibleLinks, log);
}

async function clickNavLink(page, navLinks, log) {
  const link = navLinks[randInt(0, navLinks.length - 1)];
  const title = await link
    .$(".nav-title")
    .then((el) => (el ? el.innerText() : "?"))
    .catch(() => "?");
  log(`  点击主导航: ${title}`);
  const ok = await doHumanClickEl(page, link, log);
  await sleep(rand(2000, 4000));
  return ok;
}

async function doHumanClickEl(page, el, log) {
  const box = await el.boundingBox();
  if (!box || box.width < 5 || box.height < 5) {
    log(`  元素太小或无位置`);
    return false;
  }

  const offsetX = rand(box.width * 0.2, box.width * 0.8);
  const offsetY = rand(box.height * 0.2, box.height * 0.8);
  const clickX = box.x + offsetX;
  const clickY = box.y + offsetY;

  // 先移到目标附近（overshoot），再微调到目标
  const nearX = clickX + rand(-50, 50);
  const nearY = clickY + rand(-50, 50);
  await bezierMove(page, nearX, nearY);
  await sleep(rand(100, 400));
  await bezierMove(page, clickX, clickY);
  await sleep(rand(50, 200));

  // 点击
  await page.mouse.click(clickX, clickY);
  log(`  点击坐标: (${Math.round(clickX)}, ${Math.round(clickY)})`);
  return true;
}

// ===== 模拟人类阅读 =====
async function humanRead(page, log) {
  const readTime = rand(2000, 6000);
  log(`  阅读停留 ${Math.round(readTime / 1000)} 秒`);
  await sleep(readTime);
}

// ===== 单次访问 =====
// options: { targetUrl, geo, onLog }
// 返回: { success, finalUrl, title, duration, error, geo }
async function runOnce(options) {
  const { targetUrl, geo, onLog } = options;
  const log = (msg) => {
    if (onLog) onLog(msg);
  };

  let session = null;
  let browser = null;
  let context = null;
  const startTime = Date.now();
  const geoStr = geo.state ? `${geo.country}/${geo.state}` : geo.country;

  log(`[${geoStr}] 开始访问: ${targetUrl}`);

  try {
    if (USE_BROWSERBASE) {
      log(`[${geoStr}] 创建 Browserbase Session...`);
      session = await createSession(geo);
      log(`[${geoStr}] 连接 CDP...`);
      browser = await chromium.connectOverCDP(session.connectUrl);
      context = browser.contexts()[0];
      // 注入反自动化检测脚本
      await context.addInitScript(
        "Object.defineProperty(navigator, 'webdriver', {get: () => undefined})"
      );
      // 设置时区和 locale 匹配 geolocation
      if (geo.timezone) {
        await context.addInitScript((tz) => {
          const origDateTimeFormat = Intl.DateTimeFormat;
          Intl.DateTimeFormat = function(...args) {
            if (args[1]) args[1].timeZone = tz;
            else args[1] = { timeZone: tz };
            return new origDateTimeFormat(...args);
          };
          Intl.DateTimeFormat.prototype = origDateTimeFormat.prototype;
        }, geo.timezone);
      }
      if (geo.locale) {
        await context.addInitScript((lc) => {
          Object.defineProperty(navigator, 'language', { get: () => lc });
          Object.defineProperty(navigator, 'languages', { get: () => [lc] });
        }, geo.locale);
      }
    } else {
      log(`[${geoStr}] 本地浏览器模式（无 BB_API_KEY）`);
      browser = await chromium.launch({
        headless: false,
        args: ["--disable-blink-features=AutomationControlled"],
      });
      context = await browser.newContext({
        viewport: { width: 1920, height: 1080 },
        locale: "en-US",
      });
      await context.addInitScript(
        "Object.defineProperty(navigator, 'webdriver', {get: () => undefined})"
      );
    }

    const page = await context.newPage();

    log(`[${geoStr}] 访问页面...`);
    await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
    log(`[${geoStr}] domcontentloaded 完成`);
    await sleep(rand(2000, 4000));
    log(`[${geoStr}] sleep 完成，获取标题...`);
    const t1 = Date.now();
    const urlBefore = page.url();
    log(`[${geoStr}] 当前 URL: ${urlBefore}`);
    const pageTitle = await page.title();
    log(`[${geoStr}] page.title() 耗时: ${Date.now() - t1}ms, URL: ${page.url()}`);
    log(`[${geoStr}] 页面标题: ${pageTitle}`);

    // 检测到 CAPTCHA 验证页，直接退出
    if (/captcha/i.test(pageTitle)) {
      log(`[${geoStr}] 命中 CAPTCHA 验证页，放弃本次访问`);
      return {
        success: false,
        finalUrl: page.url(),
        title: pageTitle,
        duration: Math.round((Date.now() - startTime) / 1000),
        geo: geoStr,
        error: "CAPTCHA detected",
      };
    }

    const actionCount = randInt(5, 10);
    log(`[${geoStr}] 模拟 ${actionCount} 个行为`);

    // 先点击导航
    await humanClick(page, log);
    await sleep(rand(1000, 3000));

    // 之后滚动
    for (let i = 1; i < actionCount; i++) {
      await humanScroll(page, log);
      await sleep(rand(1000, 3000));
    }

    log(`[${geoStr}] 滚动到底部`);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await sleep(rand(2000, 4000));

    const finalTitle = await page.title();
    const finalUrl = page.url();
    log(`[${geoStr}] 完成: ${finalTitle}`);

    return {
      success: true,
      finalUrl,
      title: finalTitle,
      duration: Math.round((Date.now() - startTime) / 1000),
      geo: geoStr,
      error: null,
    };
  } catch (err) {
    log(`[${geoStr}] 出错: ${err.message}`);
    return {
      success: false,
      finalUrl: null,
      title: null,
      duration: Math.round((Date.now() - startTime) / 1000),
      geo: geoStr,
      error: err.message,
    };
  } finally {
    if (browser) await browser.close().catch(() => {});
    if (session) await closeSession(session.id);
  }
}

module.exports = { runOnce, pickRandomGeo, USE_BROWSERBASE };
