/* Кросс-браузерная проверка (ТЗ п.14).
   Гоняет пять страниц в трёх движках: Chromium, Gecko (Firefox) и WebKit
   (движок Safari — на Windows сам Safari не существует, WebKit это его ядро).
   Плюс отдельный проход iPhone-профилем и проход с prefers-reduced-motion,
   чтобы поймать требование «без анимации смысл не теряется».

   Запуск: node tools/crossbrowser.mjs [базовый-адрес]

   Скрипт ничего не правит — только собирает факты: ошибки консоли, упавшие
   запросы, битые картинки, горизонтальный оверфлоу и живость анимаций. */
/* Playwright намеренно стоит вне проекта: сайт статический, без сборки, и
   тащить node_modules в репозиторий ради одной проверки незачем. Путь можно
   переопределить переменной PW_PATH. */
import { writeFileSync, mkdirSync } from "node:fs";
const PW = process.env.PW_PATH || "C:/Users/User/AppData/Local/novo-pw/node_modules/playwright/index.js";
const pw = await import(new URL("file:///" + PW).href);
/* playwright — CommonJS-пакет: при динамическом импорте из ESM его экспорты
   оказываются в .default, а не в корне модуля. */
const { chromium, firefox, webkit, devices } = pw.default || pw;

const BASE = process.argv[2] || "http://localhost:4322";
const PAGES = ["/index.html", "/catalog.html", "/story.html", "/documents.html", "/privacy.html"];
const SHOTS = "tools/.crossbrowser";

/* Консоль шумит и на здоровых сайтах: превью-сервер, шрифты Google, favicon.
   Нас интересуют только ошибки самого сайта. */
const NOISE = /favicon|fonts\.googleapis|fonts\.gstatic|\[vite\]|websocket|net::ERR_ABORTED.*hot/i;

async function probe(page) {
  return page.evaluate(async () => {
    await new Promise((r) => setTimeout(r, 1800));

    const imgs = [...document.querySelectorAll("img")];
    /* naturalWidth === 0 — ненадёжный признак: Firefox так отвечает для любого
       SVG без width/height в корне, хотя картинка рисуется нормально. Поэтому
       спрашиваем decode(): он отказывает только когда файл правда не читается.
       Ленивые и ещё не начатые не проверяем — только те, что complete. */
    const broken = [];
    for (const i of imgs) {
      if (!i.complete || !i.getAttribute("src")) continue;
      const ok = await i.decode().then(() => true).catch(() => false);
      if (!ok) broken.push(i.getAttribute("src"));
    }

    const avif = imgs.filter((i) => (i.currentSrc || "").endsWith(".avif")).length;

    /* Горизонтальный скролл — главный симптом сломанной мобильной вёрстки. */
    const doc = document.documentElement;
    const overflow = doc.scrollWidth - doc.clientWidth;

    const wide = [...document.querySelectorAll("body *")]
      .filter((el) => el.getBoundingClientRect().right > doc.clientWidth + 2)
      .slice(0, 6)
      .map((el) => (el.className && typeof el.className === "string" ? "." + el.className.split(" ")[0] : el.tagName));

    /* Считаем только живые анимации. При prefers-reduced-motion мы глушим их
       через animation-duration: 0.001ms — playState при этом остаётся
       "running", хотя кадр давно финальный и ничего не двигается. Поэтому
       отбрасываем всё короче 20мс, иначе отчёт показывает движение там,
       где его нет (проверено замером координат: смещения ноль). */
    const animated = [...document.querySelectorAll("*")].filter((el) => {
      const cs = getComputedStyle(el);
      if (cs.animationName === "none" || cs.animationPlayState !== "running") return false;
      return parseFloat(cs.animationDuration) > 0.02;
    }).length;

    /* Смысл без анимации: заголовок, подзаголовок и кнопки должны быть видимы,
       а не ждать, пока их проявит reveal-обсервер. */
    const visible = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const cs = getComputedStyle(el);
      const box = el.getBoundingClientRect();
      return cs.visibility !== "hidden" && Number(cs.opacity) > 0.01 && box.width > 0 && box.height > 0;
    };

    return {
      broken,
      imgs: imgs.length,
      avif,
      overflow,
      wide,
      animated,
      h1: (document.querySelector("h1")?.textContent || "").trim().slice(0, 40),
      h1Visible: visible("h1"),
      subVisible: visible(".hero-sub") ?? visible(".legal-sub") ?? visible(".page-lede"),
      ctaVisible: visible(".btn") ?? visible(".btn-primary"),
      revealPending: document.querySelectorAll(".reveal:not(.in)").length,
      lang: document.documentElement.lang,
      canonical: document.querySelector("#canonicalLink")?.getAttribute("href") || null,
    };
  });
}

async function run(name, browserType, contextOpts, shot) {
  const browser = await browserType.launch();
  const context = await browser.newContext(contextOpts);
  const results = [];

  for (const path of PAGES) {
    const page = await context.newPage();
    const errors = [];
    const failed = [];
    page.on("console", (m) => {
      if (m.type() === "error" && !NOISE.test(m.text())) errors.push(m.text().slice(0, 160));
    });
    page.on("pageerror", (e) => errors.push("JS: " + String(e.message).slice(0, 160)));
    page.on("requestfailed", (r) => {
      if (!NOISE.test(r.url())) failed.push(r.url().replace(BASE, "") + " — " + (r.failure()?.errorText || ""));
    });

    let data = {};
    try {
      await page.goto(BASE + path, { waitUntil: "load", timeout: 30000 });
      data = await probe(page);
      if (shot && path === "/index.html") {
        await page.screenshot({ path: `${SHOTS}/${shot}.png`, fullPage: false });
      }
    } catch (e) {
      errors.push("NAV: " + String(e.message).slice(0, 120));
    }

    results.push({ path, errors, failed, ...data });
    await page.close();
  }

  await browser.close();
  return { name, results };
}

mkdirSync(SHOTS, { recursive: true });

const iphone = devices["iPhone 14 Pro"];
const runs = [
  ["Chromium · desktop", chromium, { viewport: { width: 1440, height: 900 } }, "chromium-desktop"],
  ["Firefox · desktop", firefox, { viewport: { width: 1440, height: 900 } }, "firefox-desktop"],
  ["WebKit · desktop (Safari)", webkit, { viewport: { width: 1440, height: 900 } }, "webkit-desktop"],
  ["WebKit · iPhone 14 Pro", webkit, { ...iphone }, "webkit-iphone"],
  ["Chromium · Android 390px", chromium, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 }, null],
  ["Chromium · reduced-motion", chromium, { viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" }, "chromium-reduced"],
  ["WebKit · reduced-motion", webkit, { viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" }, null],
];

const all = [];
for (const [name, type, opts, shot] of runs) {
  process.stdout.write(`→ ${name} ... `);
  const r = await run(name, type, opts, shot);
  all.push(r);
  /* Если навигация или probe упали, полей вроде broken в результате нет —
     считаем через ?? , иначе сводка падает вместо того, чтобы показать сбой. */
  const bad = r.results.reduce(
    (n, p) => n + (p.errors?.length ?? 0) + (p.failed?.length ?? 0) + (p.broken?.length ?? 0) + (p.overflow > 2 ? 1 : 0),
    0
  );
  console.log(bad ? `${bad} замечаний` : "чисто");
}

writeFileSync("tools/.crossbrowser/report.json", JSON.stringify(all, null, 2));

console.log("\n================ ИТОГ ================");
for (const { name, results } of all) {
  console.log("\n### " + name);
  for (const p of results) {
    const flags = [];
    if (p.overflow > 2) flags.push(`оверфлоу ${p.overflow}px → ${(p.wide || []).join(", ")}`);
    if (p.broken?.length) flags.push(`битые: ${p.broken.join(", ")}`);
    if (p.failed?.length) flags.push(`запросы: ${p.failed.join(" | ")}`);
    if (p.errors?.length) flags.push(`консоль: ${p.errors.join(" | ")}`);
    if (p.h1Visible === false) flags.push("H1 невидим");
    if (p.subVisible === false) flags.push("подзаголовок невидим");
    if (p.ctaVisible === false) flags.push("кнопка невидима");
    if (p.revealPending > 0) flags.push(`reveal не раскрыт: ${p.revealPending}`);
    console.log(
      `  ${p.path.padEnd(17)} img ${String(p.imgs).padStart(2)} (avif ${String(p.avif).padStart(2)})  анимаций ${String(p.animated).padStart(3)}  ` +
        (flags.length ? "⚠ " + flags.join("; ") : "ок")
    );
  }
}
