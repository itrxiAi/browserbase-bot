const { runOnce, pickRandomGeo, USE_BROWSERBASE } = require("./bot");

// CLI 入口：node index.js [url] [count]
const targetUrl = process.argv[2] || process.env.TARGET_URL || "https://twinklerhk.en.alibaba.com/company_profile.html?spm=a2700.product_ggs_search.normal_offer.d_companyName.64f713a06OoxeY";
const count = parseInt(process.argv[3] || "1");

async function main() {
  console.log(`模式: ${USE_BROWSERBASE ? "Browserbase" : "本地浏览器"}`);
  console.log(`目标: ${targetUrl}`);
  console.log(`次数: ${count}\n`);

  // 并行
  const promises = [];
  for (let i = 0; i < count; i++) {
    const geo = pickRandomGeo();
    promises.push(
      runOnce({
        targetUrl,
        geo,
        onLog: (msg) => console.log(msg),
      }).then((r) => {
        console.log(`\n[${i + 1}/${count}] ${r.success ? "成功" : "失败"} | ${r.geo} | ${r.duration}s | ${r.title || r.error}\n`);
        return r;
      })
    );
  }

  const results = await Promise.all(promises);
  const ok = results.filter((r) => r.success).length;
  console.log(`\n完成: ${ok}/${count} 成功`);
}

main();
