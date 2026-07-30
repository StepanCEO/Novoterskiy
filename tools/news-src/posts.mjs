/* Обход всех записей старой ленты: у каждой открываем её страницу и снимаем
   заголовок, дату, текст по абзацам и снимки. Страницы на Tilda дорисовывает
   скрипт, поэтому снова через браузер, а не curl. */
const PW = process.env.PW_PATH || "C:/Users/User/AppData/Local/novo-pw/node_modules/playwright/index.js";
const { chromium } = (await import(new URL("file:///" + PW).href)).default;
const fs = await import("node:fs");

const feeds = JSON.parse(fs.readFileSync("tools/sout-src/raw/feeds.json", "utf8"));
const b = await chromium.launch({ executablePath: "C:/Users/User/AppData/Local/ms-playwright/chromium-1155/chrome-win/chrome.exe" });
const out = {};

for (const [key, list] of Object.entries(feeds)) {
  out[key] = [];
  for (const card of list) {
    // Одна запись ведёт не в ленту, а на сторонний сайт — её берём как есть.
    if (!/\/tpost\//.test(card.url)) { out[key].push({ ...card, external: true }); continue; }
    const p = await b.newPage({ viewport: { width: 1400, height: 1000 } });
    await p.goto(card.url, { waitUntil: "networkidle", timeout: 60000 });
    await p.waitForSelector(".js-feed-post-title", { timeout: 20000 }).catch(() => {});
    const data = await p.evaluate(() => {
      const text = document.querySelector(".js-feed-post-text");
      const paras = text
        ? text.innerText.split(/\n{1,}/).map((s) => s.trim()).filter(Boolean)
        : [];
      const pics = new Set();
      document.querySelectorAll(".t-feed__post-popup__cover-wrapper img, .js-feed-post-text img").forEach((i) => {
        const src = i.getAttribute("data-original") || i.getAttribute("src") || "";
        if (/tildacdn/.test(src)) pics.add(src.split("?")[0]);
      });
      document.querySelectorAll(".t-feed__post-popup__cover-wrapper [data-original]").forEach((i) => {
        const src = i.getAttribute("data-original") || "";
        if (/tildacdn/.test(src)) pics.add(src.split("?")[0]);
      });
      const frames = [].map.call(document.querySelectorAll(".js-feed-post-text iframe, .t-video-lazyload"),
        (f) => f.getAttribute("src") || f.getAttribute("data-videolazy-id") || "");
      return {
        title: (document.querySelector(".js-feed-post-title") || {}).innerText || "",
        date: (document.querySelector(".t-feed__post-popup__date-wrapper") || {}).innerText || "",
        paras: paras,
        pics: [...pics],
        frames: frames.filter(Boolean),
      };
    });
    await p.close();
    out[key].push({ url: card.url, cardDate: card.date, cardImage: card.image, ...data });
    console.log(key, out[key].length, "|", data.title.slice(0, 50), "| абзацев", data.paras.length, "| фото", data.pics.length);
  }
}
await b.close();
fs.writeFileSync("tools/sout-src/raw/posts.json", JSON.stringify(out, null, 2), "utf8");
