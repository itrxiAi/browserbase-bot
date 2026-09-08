# Browserbase Bot

用 Browserbase 云浏览器 + Playwright 模拟人类访问网页。

## 安装

```bash
cd browserbase-bot
npm install
```

## 配置

在 `index.js` 顶部修改，或通过环境变量：

```bash
export BB_API_KEY="你的browserbase_api_key"
export TARGET_URL="https://目标网址"
```

## 运行

```bash
node index.js
```

## 行为说明

脚本会模拟以下人类行为：

- 随机滚动页面（向下为主，偶尔向上）
- 随机鼠标移动（带轨迹，不是瞬移）
- 随机点击可见元素（偏移点击，不是正中心）
- 随机阅读停留（2～6 秒）
- 行为之间随机间隔

## 批量运行

```bash
# 连续运行多次，每次都是新 Session（新 IP + 新指纹）
for i in $(seq 1 10); do
  node index.js
  sleep $((RANDOM % 10 + 5))
done
```
