import { readdirSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DOCS_DIR = join(__dirname, "..", "docs");

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

try {
  const files = readdirSync(DOCS_DIR)
    .filter((f) => f.startsWith("panic-") && f.endsWith(".html"))
    .sort()
    .reverse();

  let links = "";
  for (const f of files.slice(0, 60)) {
    const date = f.replace("panic-", "").replace(".html", "");
    let dateDisplay = date;
    let weekday = "";
    try {
      const d = new Date(date);
      dateDisplay = `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
      weekday = WEEKDAYS[d.getDay()];
    } catch {}
    links += `<li><a href="${f}">📅 ${dateDisplay}（週${weekday}）</a></li>\n`;
  }

  const total = files.length;

  const html = `<!DOCTYPE html>
<html lang="zh-TW">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>Panic Disorder Research &middot; 恐慌症研究文獻日報</title>
<style>
  :root { --bg: #f6f1e8; --surface: #fffaf2; --line: #d8c5ab; --text: #2b2118; --muted: #766453; --accent: #8c4f2b; --accent-soft: #ead2bf; }
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: radial-gradient(circle at top, #fff6ea 0, var(--bg) 55%, #ead8c6 100%); color: var(--text); font-family: "Noto Sans TC", "PingFang TC", "Helvetica Neue", Arial, sans-serif; min-height: 100vh; }
  .container { position: relative; z-index: 1; max-width: 640px; margin: 0 auto; padding: 80px 24px; }
  .logo { font-size: 48px; text-align: center; margin-bottom: 16px; }
  h1 { text-align: center; font-size: 24px; color: var(--text); margin-bottom: 8px; }
  .subtitle { text-align: center; color: var(--accent); font-size: 14px; margin-bottom: 48px; }
  .count { text-align: center; color: var(--muted); font-size: 13px; margin-bottom: 32px; }
  ul { list-style: none; }
  li { margin-bottom: 8px; }
  a { color: var(--text); text-decoration: none; display: block; padding: 14px 20px; background: var(--surface); border: 1px solid var(--line); border-radius: 12px; transition: all 0.2s; font-size: 15px; }
  a:hover { background: var(--accent-soft); border-color: var(--accent); transform: translateX(4px); }
  .links-banner { margin-top: 48px; display: flex; flex-direction: column; gap: 10px; }
  .banner-link { display: flex; align-items: center; gap: 14px; padding: 14px 20px; background: var(--surface); border: 1px solid var(--line); border-radius: 16px; text-decoration: none; color: var(--text); transition: all 0.2s; }
  .banner-link:hover { border-color: var(--accent); transform: translateX(4px); }
  .banner-icon { font-size: 24px; }
  .banner-text { font-size: 14px; font-weight: 600; flex: 1; }
  .banner-arrow { font-size: 16px; color: var(--accent); }
  footer { margin-top: 56px; text-align: center; font-size: 12px; color: var(--muted); }
  footer a { display: inline; padding: 0; background: none; border: none; color: var(--muted); }
  footer a:hover { color: var(--accent); }
</style>
</head>
<body>
<div class="container">
  <div class="logo">😰</div>
  <h1>Panic Disorder Research</h1>
  <p class="subtitle">恐慌症研究文獻日報 &middot; 每日自動更新</p>
  <p class="count">共 ${total} 期日報</p>
  <ul>${links}</ul>
  <div class="links-banner">
    <a href="https://www.leepsyclinic.com/" class="banner-link" target="_blank" rel="noopener">
      <span class="banner-icon">🏥</span>
      <span class="banner-text">李政洋身心診所首頁</span>
      <span class="banner-arrow">→</span>
    </a>
    <a href="https://blog.leepsyclinic.com/" class="banner-link" target="_blank" rel="noopener">
      <span class="banner-icon">📬</span>
      <span class="banner-text">訂閱電子報</span>
      <span class="banner-arrow">→</span>
    </a>
    <a href="https://buymeacoffee.com/CYlee" class="banner-link" target="_blank" rel="noopener">
      <span class="banner-icon">☕</span>
      <span class="banner-text">Buy Me a Coffee</span>
      <span class="banner-arrow">→</span>
    </a>
  </div>
  <footer>
    <p>Powered by PubMed + Zhipu AI &middot; <a href="https://github.com/u8901006/panic-disorder">GitHub</a></p>
  </footer>
</div>
</body>
</html>`;

  writeFileSync(join(DOCS_DIR, "index.html"), html, "utf-8");
  console.error("[INFO] Index page generated");
} catch (e) {
  console.error(`[ERROR] ${e.message}`);
  process.exit(1);
}
