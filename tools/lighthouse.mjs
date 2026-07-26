/* Lighthouse (ТЗ п.14) через Node API, а не CLI: у CLI на Windows падает
   уборка временного профиля (EPERM при rm в %TEMP%) — уже после того, как
   аудит прошёл, но код возврата ненулевой и отчёт легко счесть неудачным.

   Chrome как таковой на машине не установлен, поэтому берём полный Chromium из
   кэша Playwright (headless shell не годится: Lighthouse требует полноценную
   сборку). Путь переопределяется через CHROME_PATH.

   Запуск: node tools/lighthouse.mjs [базовый-адрес]

   Важная оговорка: цифры сняты с локального http.server без сжатия, HTTP/2 и
   CDN. Для LCP/TTFB это заниженная оценка — итоговые значения меряются на
   боевом домене. Доверять здесь стоит доступности, SEO и best-practices. */
import { writeFileSync, mkdirSync } from "node:fs";

const LH = "C:/Users/User/AppData/Local/novo-pw/node_modules/lighthouse/core/index.js";
const CL = "C:/Users/User/AppData/Local/novo-pw/node_modules/chrome-launcher/dist/index.js";
const CHROME = process.env.CHROME_PATH || "C:/Users/User/AppData/Local/ms-playwright/chromium-1181/chrome-win/chrome.exe";

const lighthouse = (await import(new URL("file:///" + LH).href)).default;
const { launch } = await import(new URL("file:///" + CL).href);

const BASE = process.argv[2] || "http://127.0.0.1:4322";
const PAGES = ["/index.html", "/catalog.html", "/story.html", "/documents.html", "/privacy.html"];
const CATEGORIES = ["performance", "accessibility", "best-practices", "seo"];
mkdirSync("tools/.crossbrowser", { recursive: true });

const chrome = await launch({ chromePath: CHROME, chromeFlags: ["--headless=new", "--no-sandbox"] });
const summary = [];

for (const formFactor of ["mobile", "desktop"]) {
  const screenEmulation = formFactor === "desktop"
    ? { mobile: false, width: 1350, height: 940, deviceScaleFactor: 1, disabled: false }
    : { mobile: true, width: 412, height: 823, deviceScaleFactor: 1.75, disabled: false };

  for (const path of PAGES) {
    const result = await lighthouse(BASE + path, {
      port: chrome.port,
      output: "json",
      logLevel: "error",
      onlyCategories: CATEGORIES,
      formFactor,
      screenEmulation,
      /* На десктопе троттлинг сети/CPU мешает: он моделирует мобильный 4G. */
      throttlingMethod: "simulate",
      ...(formFactor === "desktop"
        ? { throttling: { rttMs: 40, throughputKbps: 10240, cpuSlowdownMultiplier: 1 } }
        : {}),
    });

    const lhr = result.lhr;
    const scores = {};
    for (const c of CATEGORIES) scores[c] = Math.round((lhr.categories[c]?.score ?? 0) * 100);

    /* Провалившиеся проверки доступности и SEO — то, что правится в коде,
       в отличие от скоростных метрик локального сервера. */
    const failed = Object.values(lhr.audits)
      .filter((a) => a.score !== null && a.score < 0.9 && !/^(largest-contentful|first-contentful|speed-index|total-blocking|cumulative-layout|interactive|server-response|render-blocking|unminified|unused|uses-|efficient-animated|legacy-javascript|third-party|font-display|network-|max-potential|dom-size|bootup|mainthread|duplicated)/.test(a.id))
      .map((a) => a.id);

    summary.push({
      page: path,
      formFactor,
      ...scores,
      lcp: lhr.audits["largest-contentful-paint"]?.displayValue || "?",
      cls: lhr.audits["cumulative-layout-shift"]?.displayValue || "?",
      tbt: lhr.audits["total-blocking-time"]?.displayValue || "?",
      failed,
    });
    writeFileSync(`tools/.crossbrowser/lh-${path.replace(/[/.]/g, "") || "root"}-${formFactor}.json`, JSON.stringify(lhr));
    console.log(`${formFactor.padEnd(7)} ${path.padEnd(16)} perf ${String(scores.performance).padStart(3)}  a11y ${String(scores.accessibility).padStart(3)}  bp ${String(scores["best-practices"]).padStart(3)}  seo ${String(scores.seo).padStart(3)}`);
  }
}

/* chrome-launcher чистит временный профиль синхронным rmSync внутри kill(),
   и на Windows он ловит EPERM: Chromium ещё держит файлы профиля. Аудит к
   этому моменту полностью закончен, поэтому ошибку глотаем — но именно
   try/catch, а не .catch(): throw синхронный, промис его не увидит. */
try { await chrome.kill(); } catch { /* временный профиль подчистит система */ }
writeFileSync("tools/.crossbrowser/lighthouse-summary.json", JSON.stringify(summary, null, 2));

console.log("\n================ LIGHTHOUSE ================");
for (const s of summary) {
  console.log(`\n${s.formFactor} ${s.page}`);
  console.log(`  perf ${s.performance} · a11y ${s.accessibility} · best-practices ${s["best-practices"]} · seo ${s.seo}`);
  console.log(`  LCP ${s.lcp} · CLS ${s.cls} · TBT ${s.tbt}`);
  if (s.failed.length) console.log("  ⚠ проверки: " + s.failed.join(", "));
}
process.exit(0);
