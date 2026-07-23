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

  /* ---- Bottle video: играет один раз в момент появления бутылки (3s),
         застывает на последнем кадре до следующей загрузки страницы ---- */
  var bottleVideo = document.getElementById("bottleVideo");
  var useIosBottleStill = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (bottleVideo && !useIosBottleStill) {
    bottleVideo.addEventListener("ended", function () {
      // фиксируемся на последнем кадре
      bottleVideo.currentTime = Math.max(0, bottleVideo.duration - 0.05);
      bottleVideo.pause();
    });
    var playBottle = function () {
      var p = bottleVideo.play();
      if (p && p.catch) p.catch(function () { /* автоплей запрещён — остаётся постер */ });
    };
    if (reduceMotion) {
      // без анимаций: сразу финальный кадр
      bottleVideo.addEventListener("loadedmetadata", function () {
        bottleVideo.currentTime = Math.max(0, bottleVideo.duration - 0.05);
      });
    } else {
      // старт синхронно с фазой «бутылка из дымки» (3с сценария)
      setTimeout(playBottle, 3000);
    }
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
  var thread = document.querySelector(".thread");
  var threadPath = document.querySelector(".thread-path");
  var pathLine = document.querySelector(".path-line");
  var footer = document.querySelector(".site-footer");
  var threadStartY = 0;
  var threadHeight = 0;
  var threadLength = 0;

  /* Общая голубая нить начинается точно в конце маршрута «Путь воды»,
     затем течёт по странице плавными изгибами, как горная река. */
  function updateThreadGeometry() {
    if (!thread || !threadPath || !pathLine || window.innerWidth <= 767) return;
    var end = pathLine.getBoundingClientRect();
    var doc = document.documentElement;
    // SVG занимает ширину документа без полосы прокрутки. Используем ту же
    // систему координат, чтобы начало нити попадало точно в центр линии пути.
    var width = doc.clientWidth;
    var startX = end.left + end.width / 2;
    // Два пикселя перекрытия убирают просвет между соседними штрихами.
    threadStartY = Math.floor((window.scrollY || window.pageYOffset) + end.bottom) - 2;
    var scrollY = window.scrollY || window.pageYOffset;
    var footerTop = footer ? scrollY + footer.getBoundingClientRect().top : doc.scrollHeight;
    var waterline = footer ? footer.querySelector(".footer-waterline") : null;
    var waterlineHeight = waterline ? waterline.getBoundingClientRect().height : 0;
    // В центре SVG поверхность проходит примерно посередине волны.
    // Ручеёк касается этой кромки, но не продолжается внутри подвала.
    var riverEndY = footerTop - waterlineHeight * 0.5;
    var height = Math.max(1, Math.floor(riverEndY - threadStartY));
    threadHeight = height;
    var centerX = width / 2;
    var settle = Math.min(360, Math.max(220, height * 0.07));
    var sway = Math.min(130, Math.max(72, width * 0.09));
    var d = [
      "M " + startX.toFixed(1) + " 0",
      "C " + startX.toFixed(1) + " " + (settle * 0.28).toFixed(1) + ", " + (centerX - sway * 0.45).toFixed(1) + " " + (settle * 0.72).toFixed(1) + ", " + centerX.toFixed(1) + " " + settle.toFixed(1)
    ];

    // Чередующиеся безье-сегменты дают заметное, но спокойное русло.
    // Разная длина и амплитуда изгибов убирают механическую «синусоиду».
    var waveSpan = Math.min(760, Math.max(520, height / 10));
    var spanPattern = [0.92, 1.08, 0.84, 1.14];
    var swayPattern = [0.76, 1, 0.86, 1.1, 0.92];
    var riverY = settle;
    var riverX = centerX;
    var direction = 1;
    var wave = 0;
    while (riverY < height) {
      var span = Math.min(waveSpan * spanPattern[wave % spanPattern.length], height - riverY);
      var nextY = riverY + span;
      var nextX = centerX + direction * sway * swayPattern[wave % swayPattern.length];
      if (nextY === height) nextX = centerX;
      d.push(
        "C " + riverX.toFixed(1) + " " + (riverY + span * 0.3).toFixed(1) + ", " +
        nextX.toFixed(1) + " " + (riverY + span * 0.7).toFixed(1) + ", " +
        nextX.toFixed(1) + " " + nextY.toFixed(1)
      );
      riverX = nextX;
      riverY = nextY;
      direction *= -1;
      wave++;
    }
    d = d.join(" ");
    thread.style.setProperty("--thread-top", threadStartY + "px");
    thread.style.setProperty("--thread-height", height + "px");
    thread.setAttribute("viewBox", "0 0 " + width + " " + height);
    threadPath.setAttribute("d", d);
    // Достаточный запас для stroke-dasharray: так линия корректно рисуется
    // и в браузерах, где SVGPathElement#getTotalLength недоступен.
    threadLength = Math.ceil(height * 1.2 + Math.abs(centerX - startX) * 1.5);
    threadPath.style.setProperty("--thread-length", threadLength);
  }

  /* ---- Water's-path timeline: line fills as the section scrolls ---- */
  var pathSteps = document.querySelector(".path-steps");
  var pathLineFill = document.querySelector(".path-line-fill");

  /* Сцены «Пути воды» (ТЗ п.6): фон секции плавно меняется по мере скролла —
     светлый лёд → умеренно тёмная порода → тёплый отсвет Огня → зелень источника */
  var pathSection = document.querySelector(".path");
  var SCENES = [
    [0.0,  [246, 250, 252]], // Воздух/Лёд — светлый
    [0.38, [214, 205, 192]], // Земля — натуральная порода, умеренно темнее
    [0.66, [236, 215, 188]], // Огонь — тёплый отсвет
    [1.0,  [223, 235, 221]]  // Источник — мягкая зелень
  ];
  function sceneColor(p) {
    for (var i = 1; i < SCENES.length; i++) {
      if (p <= SCENES[i][0]) {
        var a = SCENES[i - 1], b = SCENES[i];
        var k = (p - a[0]) / (b[0] - a[0]);
        return "rgb(" + a[1].map(function (c, j) {
          return Math.round(c + (b[1][j] - c) * k);
        }).join(",") + ")";
      }
    }
    return "rgb(" + SCENES[SCENES.length - 1][1].join(",") + ")";
  }

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
    if (pathSection) pathSection.style.background = sceneColor(p);
  }

  /* Параллакс фото «Истории происхождения»: фон движется медленнее скролла */
  var originSection = document.querySelector(".origin");
  function updateOriginParallax() {
    if (!originSection) return;
    var r = originSection.getBoundingClientRect();
    if (r.bottom <= 0 || r.top >= window.innerHeight) return;
    var p = (window.innerHeight - r.top) / (window.innerHeight + r.height);
    // первый слой — градиент (center), второй — фото: сдвигаем только фото
    originSection.style.backgroundPosition = "center, 50% " + (35 + p * 30).toFixed(2) + "%";
  }

  function onScroll() {
    var y = window.scrollY || window.pageYOffset;
    if (header) header.classList.toggle("scrolled", y > 24);
    if (threadPath && threadLength) {
      // Нить растёт вслед за прокруткой, когда источник проходит середину
      // экрана — точка старта остаётся видимой, пока поток идёт ниже.
      var p = Math.max(0, Math.min(1, (y + window.innerHeight * 0.5 - threadStartY) / Math.max(1, threadHeight)));
      threadPath.style.setProperty("--thread-offset", (threadLength * (1 - p)).toFixed(1));
    }
    if (!reduceMotion) { updatePathFlow(); updateOriginParallax(); }
  }
  var ticking = false;
  window.addEventListener("scroll", function () {
    if (!ticking) {
      window.requestAnimationFrame(function () { onScroll(); ticking = false; });
      ticking = true;
    }
  }, { passive: true });
  updateThreadGeometry();
  window.addEventListener("resize", updateThreadGeometry, { passive: true });
  window.addEventListener("load", updateThreadGeometry, { once: true });
  onScroll();

  /* ---- Счётчики цифр в блоке доверия: накручиваются при появлении ---- */
  var statVals = document.querySelectorAll(".stat-val[data-count]");
  if (statVals.length && "IntersectionObserver" in window && !reduceMotion) {
    var cntIo = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        cntIo.unobserve(e.target);
        var el = e.target;
        var target = parseInt(el.getAttribute("data-count"), 10);
        if (!isFinite(target)) return;
        var t0 = null, DUR = 1400;
        function tick(ts) {
          if (t0 === null) t0 = ts;
          var k = Math.min(1, (ts - t0) / DUR);
          k = 1 - Math.pow(1 - k, 3); // easeOutCubic
          el.textContent = String(Math.round(target * k));
          if (k < 1) requestAnimationFrame(tick);
          else el.textContent = String(target);
        }
        requestAnimationFrame(tick);
      });
    }, { threshold: 0.6 });
    statVals.forEach(function (el) { cntIo.observe(el); });
  }

  /* ---- Индикатор мобильной карусели коллекции (ТЗ п.10) ---- */
  function initCollectionDots() {
    var track = document.querySelector(".collection-track");
    var section = document.getElementById("collection");
    if (!track || !section) return;
    var old = section.querySelector(".collection-dots");
    if (old) old.remove();
    var items = track.children.length;
    if (items < 2) return;
    var dots = document.createElement("div");
    dots.className = "collection-dots";
    dots.setAttribute("aria-hidden", "true");
    for (var i = 0; i < items; i++) {
      var d = document.createElement("span");
      d.className = "cdot" + (i === 0 ? " on" : "");
      dots.appendChild(d);
    }
    section.appendChild(dots);
    var dotEls = dots.querySelectorAll(".cdot");
    var dotTick = false;
    track.addEventListener("scroll", function () {
      if (dotTick) return;
      dotTick = true;
      requestAnimationFrame(function () {
        var max = track.scrollWidth - track.clientWidth;
        var idx = max > 0 ? Math.round(track.scrollLeft / max * (items - 1)) : 0;
        dotEls.forEach(function (el, j) { el.classList.toggle("on", j === idx); });
        dotTick = false;
      });
    }, { passive: true });
  }
  initCollectionDots();

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
    initCollectionDots(); // карусель перерисована из JSON — пересобираем точки
    if (htmlEl.getAttribute("lang") === "en") setLang("en");
  });
})();
