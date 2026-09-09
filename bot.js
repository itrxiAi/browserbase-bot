require("dotenv").config();
const { ApifyClient } = require("apify-client");

// ===== 配置 =====
const BB_API_KEY = process.env.BB_API_KEY || "";
const USE_BROWSERBASE = BB_API_KEY.length > 0;
const APIFY_API_TOKEN = process.env.APIFY_API_TOKEN || "";
const USE_APIFY = APIFY_API_TOKEN.length > 0;

// ===== 工具函数 =====
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ===== Apify Web Scraper =====
const PAGE_FUNCTION = `async function pageFunction(context) {
  const title = document.title;
  const hasCaptcha = /captcha/i.test(title);
  const imageCount = document.images.length;
  return {
    url: context.request.url,
    title: title,
    hasCaptcha: hasCaptcha,
    htmlLength: document.documentElement.outerHTML.length,
    imageCount: imageCount
  };
}`;

// ===== 单次访问 =====
async function runOnce(options) {
  const { targetUrl, onLog } = options;
  const log = (msg) => { if (onLog) onLog(msg); };
  const startTime = Date.now();

  log(`开始 Apify 访问: ${targetUrl}`);

  const client = new ApifyClient({ token: APIFY_API_TOKEN });

  const input = {
    breakpointLocation: "NONE",
    browserLog: false,
    closeCookieModals: false,
    debugLog: false,
    downloadCss: true,
    downloadMedia: true,
    excludes: [{ glob: "/**/*.{png,jpg,jpeg,pdf}" }],
    globs: [{ glob: "https://crawlee.dev/js/*/*" }],
    headless: true,
    ignoreCorsAndCsp: false,
    ignoreSslErrors: false,
    injectJQuery: true,
    keepUrlFragments: false,
    linkSelector: "",
    pageFunction: PAGE_FUNCTION,
    postNavigationHooks: `// We need to return array of (possibly async) functions here.
// The functions accept a single argument: the "crawlingContext" object.
[
    async (crawlingContext) => {
        // ...
    },
]`,
    preNavigationHooks: `// We need to return array of (possibly async) functions here.
// The functions accept two arguments: the "crawlingContext" object
// and "gotoOptions".
[
    async (crawlingContext, gotoOptions) => {
        // ...
    },
]`,
    proxyConfiguration: {
      useApifyProxy: true,
      apifyProxyGroups: ["RESIDENTIAL"],
    },
    respectRobotsTxtFile: true,
    runMode: "PRODUCTION",
    startUrls: [{ url: targetUrl }],
    useChrome: false,
    waitUntil: ["networkidle2"],
    pseudoUrls: [],
    proxyRotation: "RECOMMENDED",
    maxRequestRetries: 3,
    maxPagesPerCrawl: 0,
    maxResultsPerCrawl: 0,
    maxCrawlingDepth: 0,
    maxConcurrency: 50,
    pageLoadTimeoutSecs: 60,
    pageFunctionTimeoutSecs: 60,
    maxScrollHeightPixels: 5000,
    customData: {},
  };

  try {
    log(`启动 Web Scraper run...`);
    const run = await client.actor("apify/web-scraper").start(input);
    log(`run ID: ${run.id}, 状态: ${run.status}`);

    // 轮询等待完成
    const maxWait = 180000;
    while (Date.now() - startTime < maxWait) {
      const runInfo = await client.run(run.id).get();
      if (!runInfo) break;

      log(`run 状态: ${runInfo.status}`);

      if (runInfo.status === "SUCCEEDED") {
        log(`run 完成，获取结果...`);
        const { items } = await client.dataset(runInfo.defaultDatasetId).listItems();

        if (!items || items.length === 0) {
          log(`无结果数据`);
          return {
            success: false,
            title: null,
            duration: Math.round((Date.now() - startTime) / 1000),
            error: "无结果数据",
          };
        }

        const result = items[0];
        log(`标题: ${result.title}, CAPTCHA: ${result.hasCaptcha}`);

        if (result.hasCaptcha) {
          log(`命中 CAPTCHA`);
          return {
            success: false,
            title: result.title,
            duration: Math.round((Date.now() - startTime) / 1000),
            error: "CAPTCHA detected",
          };
        }

        log(`完成: ${result.title}`);
        return {
          success: true,
          title: result.title,
          duration: Math.round((Date.now() - startTime) / 1000),
          error: null,
        };
      }

      if (["FAILED", "TIMED-OUT", "ABORTED"].includes(runInfo.status)) {
        throw new Error(`run ${runInfo.status}`);
      }

      await sleep(5000);
    }

    throw new Error("run 超时");
  } catch (err) {
    log(`出错: ${err.message}`);
    return {
      success: false,
      title: null,
      duration: Math.round((Date.now() - startTime) / 1000),
      error: err.message,
    };
  }
}

module.exports = { runOnce, USE_BROWSERBASE, USE_APIFY };
