/* Novoterskaya — interactions */
(function () {
  "use strict";

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---- Hero load sequence ---- */
  var hero = document.getElementById("hero");
  if (hero) {
    var startHero = function () { hero.classList.add("loaded"); };
    requestAnimationFrame(startHero);
    // Fallback: rAF is throttled in background tabs — guarantee the reveal fires.
    setTimeout(startHero, 200);
  }

  /* ---- Scroll reveals ---- */
  function applyReveals(scope) {
    var els = (scope || document).querySelectorAll(".reveal");
    if ("IntersectionObserver" in window && !reduceMotion) {
      if (!applyReveals._io) {
        applyReveals._io = new IntersectionObserver(function (entries) {
          entries.forEach(function (e) {
            if (e.isIntersecting) {
              e.target.classList.add("in");
              applyReveals._io.unobserve(e.target);
            }
          });
        }, { threshold: 0.14, rootMargin: "0px 0px -8% 0px" });
      }
      els.forEach(function (el) {
        // hero children are driven by CSS keyframes, skip them
        if (!el.classList.contains("in") && !el.closest(".hero")) applyReveals._io.observe(el);
      });
    } else {
      els.forEach(function (el) { el.classList.add("in"); });
    }
  }
  applyReveals(document);

  /* ---- Header scrolled state + water-thread progress ---- */
  var header = document.querySelector(".site-header");
  var threadPath = document.querySelector(".thread-path");
  var THREAD_LEN = 1400;

  /* ---- Water's-path timeline: line fills as the section scrolls ---- */
  var pathSteps = document.querySelector(".path-steps");
  var pathLineFill = document.querySelector(".path-line-fill");

  function updatePathFlow() {
    if (!pathSteps || !pathLineFill) return;
    var rect = pathSteps.getBoundingClientRect();
    var vh = window.innerHeight;
    // 0 when the list top reaches mid-screen, 1 when its bottom passes mid-screen
    var start = vh * 0.62;
    var end = vh * 0.32;
    var p = (start - rect.top) / (rect.height - (start - end));
    p = Math.max(0, Math.min(1, p));
    var pct = (p * 100).toFixed(2) + "%";
    pathLineFill.style.height = pct;
    pathSteps.style.setProperty("--flow", pct);
    pathSteps.classList.toggle("flowing", p > 0.01 && p < 0.99);
  }

  function onScroll() {
    var y = window.scrollY || window.pageYOffset;
    if (header) header.classList.toggle("scrolled", y > 24);
    if (threadPath) {
      var docH = document.documentElement.scrollHeight - window.innerHeight;
      var p = docH > 0 ? Math.min(1, y / docH) : 0;
      threadPath.style.setProperty("--thread-offset", (THREAD_LEN * (1 - p)).toFixed(1));
    }
    if (!reduceMotion) updatePathFlow();
  }
  var ticking = false;
  window.addEventListener("scroll", function () {
    if (!ticking) {
      window.requestAnimationFrame(function () { onScroll(); ticking = false; });
      ticking = true;
    }
  }, { passive: true });
  onScroll();

  /* ---- Language toggle (RU <-> EN, no reload) ---- */
  var langToggle = document.getElementById("langToggle");
  var htmlEl = document.documentElement;
  var ruStore = new WeakMap();

  function setLang(lang) {
    var toEn = lang === "en";
    document.querySelectorAll("[data-en]").forEach(function (el) {
      if (!ruStore.has(el)) ruStore.set(el, el.innerHTML);
      el.innerHTML = toEn ? el.getAttribute("data-en") : ruStore.get(el);
    });
    htmlEl.setAttribute("lang", toEn ? "en" : "ru");
    if (langToggle) {
      langToggle.querySelectorAll(".lang-opt").forEach(function (o) {
        o.classList.toggle("is-active", o.getAttribute("data-lang") === lang);
      });
    }
    try { localStorage.setItem("novo-lang", lang); } catch (e) {}
  }

  if (langToggle) {
    langToggle.addEventListener("click", function () {
      var next = htmlEl.getAttribute("lang") === "en" ? "ru" : "en";
      setLang(next);
    });
    var saved;
    try { saved = localStorage.getItem("novo-lang"); } catch (e) {}
    if (saved === "en") setLang("en");
  }

  /* ---- Cookie banner ---- */
  var cookie = document.getElementById("cookie");
  var cookieOk = document.getElementById("cookieOk");
  var accepted;
  try { accepted = localStorage.getItem("novo-cookie"); } catch (e) {}
  if (cookie && !accepted) {
    setTimeout(function () { cookie.classList.add("show"); }, 1200);
  }
  if (cookieOk) {
    cookieOk.addEventListener("click", function () {
      cookie.classList.remove("show");
      try { localStorage.setItem("novo-cookie", "1"); } catch (e) {}
    });
  }

  /* ---- Analytics ----
     Цели (п.14 ТЗ): просмотр легенды «Баланс стихий», клики по продукции,
     открытие документов. Работает через единый track(): пишет в dataLayer
     (GA4/GTM) и вызывает ym-цель Яндекс.Метрики, если счётчики подключены.
     Чтобы включить сбор — вставьте ID ниже (см. index.html подключение gtag/ym). */
  var YM_ID = window.NOVO_YM_ID || null;   // напр. 12345678
  window.dataLayer = window.dataLayer || [];

  function track(goal, params) {
    var payload = params || {};
    try { window.dataLayer.push(Object.assign({ event: goal }, payload)); } catch (e) {}
    if (typeof window.gtag === "function") {
      try { window.gtag("event", goal, payload); } catch (e) {}
    }
    if (YM_ID && typeof window.ym === "function") {
      try { window.ym(YM_ID, "reachGoal", goal, payload); } catch (e) {}
    }
  }

  // Клики: продукция («Купить») и документы — по data-analytics
  document.addEventListener("click", function (ev) {
    var t = ev.target.closest("[data-analytics]");
    if (!t) return;
    var goal = t.getAttribute("data-analytics");
    if (goal === "product-buy") {
      track("product_click", { product: t.getAttribute("data-product") || "" });
    } else if (goal === "doc-open") {
      track("document_open", { document: t.getAttribute("data-doc") || "" });
    }
  });

  // Просмотр легенды «Баланс четырёх стихий»
  var legend = document.getElementById("elements");
  if (legend && "IntersectionObserver" in window) {
    var legendSeen = false;
    var legendIo = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting && !legendSeen) {
          legendSeen = true;
          track("legend_view", {});
          legendIo.disconnect();
        }
      });
    }, { threshold: 0.15 });
    legendIo.observe(legend);
  }

  /* ---- CMS re-hydration hook ----
     Когда cms.js перерисовал секции из JSON, заново вешаем reveal-анимации
     и применяем текущий язык к новым узлам. */
  document.addEventListener("novo:hydrated", function () {
    applyReveals(document);
    if (htmlEl.getAttribute("lang") === "en") setLang("en");
  });
})();
