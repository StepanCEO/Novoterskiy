/* Выгрузка лент новостей со старого сайта. Ленты на Tilda рисуются скриптом
   из внешнего JSON, поэтому в скачанном curl'ом HTML их нет — страницу
   приходится открывать браузером и ждать, пока лента дорисуется. */
const PW = process.env.PW_PATH || "C:/Users/User/AppData/Local/novo-pw/node_modules/playwright/index.js";
const pw = await import(new URL("file:///" + PW).href);
const { chromium } = pw.default || pw;
const b = await chromium.launch({ executablePath: "C:/Users/User/AppData/Local/ms-playwright/chromium-1155/chrome-win/chrome.exe" });
const out = {};
for (const [key, url] of [["newsGeneral", "https://novoterskaya.ru/news"], ["newsCharity", "https://novoterskaya.ru/charity"]]) {
  const p = await b.newPage({ viewport: { width: 1400, height: 1000 } });
  await p.goto(url, { waitUntil: "networkidle", timeout: 60000 });
  await p.waitForSelector(".t-feed__post", { timeout: 30000 }).catch(() => {});
  // «Показать ещё» может быть несколько раз — жмём, пока кнопка жива.
  for (let i = 0; i < 20; i++) {
    const btn = p.locator(".t-feed__showmore-btn, .js-feed-btn-show-more").first();
    if (!(await btn.count()) || !(await btn.isVisible().catch(() => false))) break;
    await btn.click().catch(() => {});
    await p.waitForTimeout(1200);
  }
  await p.waitForTimeout(800);
  out[key] = await p.evaluate(() => [].map.call(document.querySelectorAll(".t-feed__post"), (el) => {
    const t = (s) => { const n = el.querySelector(s); return n ? n.textContent.trim().replace(/\s+/g, " ") : ""; };
    const img = el.querySelector(".t-feed__post-bgimg, .t-feed__post-img");
    const bg = img ? (img.getAttribute("data-original") || (img.style.backgroundImage || "").replace(/^url\(["']?|["']?\)$/g, "")) : "";
    const a = el.querySelector("a[href]");
    return {
      title: t(".t-feed__post-title"),
      date: t(".t-feed__post-date"),
      descr: t(".t-feed__post-descr"),
      parts: t(".t-feed__post-parts"),
      url: a ? a.href : "",
      image: bg,
    };
  }));
  console.log(key, out[key].length);
  await p.close();
}
await b.close();
const fs = await import("node:fs");
fs.writeFileSync("tools/sout-src/raw/feeds.json", JSON.stringify(out, null, 2), "utf8");
