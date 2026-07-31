/* Novoterskaya — interactions */
(function () {
  "use strict";

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* Отложить до первой отрисовки, но не потерять вызов. requestAnimationFrame
     в фоновой вкладке не приходит вовсе (открыли ссылку в новой вкладке —
     кадра нет, пока не переключатся), поэтому дублируем таймером: кто первым
     сработал, тот и выполняет. Иначе ролики так и не начинают грузиться. */
  function afterPaint(fn) {
    var done = false;
    var run = function () {
      if (done) return;
      done = true;
      fn();
    };
    requestAnimationFrame(run);
    setTimeout(run, 200);
  }

  /* ---- Hero load sequence ---- */
  var hero = document.getElementById("hero");
  if (hero) {
    afterPaint(function () { hero.classList.add("loaded"); });
  }

  /* ---- Ролики героя. Их два и они идут одновременно: сзади панорама
         ледников, спереди — бутылка на камне со всплеском. Оба в конце
         застывают на последнем кадре до следующей загрузки страницы.
         По кругу не гоняем: заказчик просил один проход, поэтому loop нет
         ни здесь, ни в разметке ---- */
  function wireHeroVideo(video) {
    if (!video) return;
    /* Safari/WebKit на <source type='video/webm; codecs="vp9"'> отвечает
       canPlayType → "probably", но VP9 в WebM у него не декодируется: элемент
       навсегда остаётся в readyState 0 при networkState 2 (грузит и грузит).
       Браузер при этом не считает это ошибкой, поэтому ни error, ни переход к
       следующему <source> не происходят — и событие load страницы не наступает
       вообще. Сторожевой таймер: нет метаданных за 2.5с → берём mp4 напрямую.
       В движках, которые webm читают, метаданные приходят раньше, и таймер
       снимается, так что размер (webm вдвое легче mp4) не теряется. */
    /* Источники собираем здесь, а не в разметке: в Safari <source> внутри
       <video> навсегда удерживает событие load страницы. Плюс так ролики не
       отбирают канал у постеров, а постер и есть первый экран. */
    var mp4 = video.getAttribute("data-mp4");
    var webm = video.getAttribute("data-webm");
    var start = function () {
      if (mp4) {
        var stuckWatch = setTimeout(function () {
          if (video.readyState === 0) {
            video.querySelectorAll("source").forEach(function (node) { node.remove(); });
            video.src = mp4;
            video.load();
          }
        }, 2500);
        video.addEventListener("loadedmetadata", function () { clearTimeout(stuckWatch); }, { once: true });
      }
      // Порядок важен: webm лёгкий, mp4 — запасной.
      var sources = document.createDocumentFragment();
      [[webm, 'video/webm; codecs="vp9"'], [mp4, "video/mp4"]].forEach(function (pair) {
        if (!pair[0]) return;
        var source = document.createElement("source");
        source.setAttribute("src", pair[0]);
        source.setAttribute("type", pair[1]);
        sources.appendChild(source);
      });
      video.insertBefore(sources, video.firstChild);
      video.load();
    };
    // После load и первой отрисовки: сперва кадр, потом занимаем канал.
    if (document.readyState === "complete") afterPaint(start);
    else window.addEventListener("load", function () { afterPaint(start); }, { once: true });

    // done: проход отмечаем сами — иначе возврат на вкладку пускает ролик заново.
    var done = false;
    // Останавливаемся за кадр до конца, а не по событию ended: паузу видно
    // сразу, кадр остаётся на экране и перемотка не нужна. Перемотка тут
    // ненадёжна — если сервер отдаёт файл без Range-запросов, seekable пуст
    // и любое присвоение currentTime отбрасывает ролик на нулевой кадр.
    var freeze = function () {
      done = true;
      video.pause();
    };
    video.addEventListener("timeupdate", function () {
      if (done || !video.duration) return;
      if (video.currentTime >= video.duration - 0.08) freeze();
    });
    video.addEventListener("ended", freeze);
    if (reduceMotion) {
      // без анимаций: ролик не запускаем вовсе — на экране остаётся постер
      video.addEventListener("loadedmetadata", freeze);
    } else {
      var play = function () {
        var p = video.play();
        if (p && p.catch) p.catch(function () { /* автоплей запрещён — остаётся постер */ });
      };
      if (video.readyState >= 2) play();
      else video.addEventListener("canplay", play, { once: true });
      // если вкладка была в фоне и браузер приостановил ролик — доигрываем;
      // после последнего кадра не трогаем, иначе пойдёт заново
      document.addEventListener("visibilitychange", function () {
        if (done || document.visibilityState !== "visible") return;
        if (!video.ended && video.paused) play();
      });
    }
  }
  wireHeroVideo(document.getElementById("heroVideo"));
  wireHeroVideo(document.getElementById("sceneVideo"));

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
  var pathLastDot = document.querySelector(".path-step:last-child .path-dot");
  var pathSection = document.querySelector(".path");
  var pathSticky = document.querySelector(".path-sticky");
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
    // Нить должна выходить из-под нижней точки последнего кружка, а не из
    // линии-подложки: у кружка свой центр (он шире линии), и расхождение в
    // пару пикселей читается как косой выход из бока.
    var anchor = pathLastDot ? pathLastDot.getBoundingClientRect() : end;
    var startX = anchor.left + anchor.width / 2;
    // Два пикселя перекрытия убирают просвет между соседними штрихами.
    var scrollY = window.scrollY || window.pageYOffset;
    if (pathSection && pathSticky) {
      var sectionRect = pathSection.getBoundingClientRect();
      var stickyRect = pathSticky.getBoundingClientRect();
      var lineBottomInSticky = anchor.bottom - stickyRect.top;
      threadStartY = Math.floor(scrollY + sectionRect.bottom - (stickyRect.height - lineBottomInSticky)) - 2;
    } else {
      threadStartY = Math.floor(scrollY + anchor.bottom) - 2;
    }
    var footerTop = footer ? scrollY + footer.getBoundingClientRect().top : doc.scrollHeight;
    var waterline = footer ? footer.querySelector(".footer-waterline") : null;
    var waterlineHeight = waterline ? waterline.getBoundingClientRect().height : 0;
    // В центре SVG поверхность проходит примерно посередине волны.
    // Ручеёк касается этой кромки, но не продолжается внутри подвала.
    var riverEndY = footerTop - waterlineHeight * 0.5;
    var height = Math.max(1, Math.floor(riverEndY - threadStartY));
    threadHeight = height;
    var centerX = width / 2;
    var sway = Math.min(130, Math.max(72, width * 0.09));
    // Короткий вертикальный участок под кружком: без него изгиб к центру
    // страницы начинается сразу и капля будто вытекает из бока, а не снизу.
    var drop = Math.min(46, height * 0.01);
    // Длина съезда к центру зависит от того, сколько нужно пройти по горизонтали:
    // так наклон русла остаётся одинаково мягким при любой ширине окна.
    var reach = Math.abs(centerX - startX);
    var settle = drop + Math.min(Math.max(300, reach * 1.6), Math.max(320, height * 0.22));
    // На очень коротких страницах съезд не должен вылезать за пределы SVG.
    settle = Math.min(settle, height);
    // Оба контрольных плеча вертикальны: сверху — чтобы гладко продолжить
    // прямой участок, снизу — чтобы совпасть с волнами русла, которые тоже
    // входят и выходят вертикально. Иначе на стыке виден залом.
    var ease = (settle - drop) * 0.46;
    var d = [
      "M " + startX.toFixed(1) + " 0",
      "L " + startX.toFixed(1) + " " + drop.toFixed(1),
      "C " + startX.toFixed(1) + " " + (drop + ease).toFixed(1) + ", " + centerX.toFixed(1) + " " + (settle - ease).toFixed(1) + ", " + centerX.toFixed(1) + " " + settle.toFixed(1)
    ];

    // Чередующиеся безье-сегменты дают заметное, но спокойное русло.
    // Разная длина и амплитуда изгибов убирают механическую «синусоиду».
    var waveSpan = Math.min(760, Math.max(520, height / 10));
    var spanPattern = [0.92, 1.08, 0.84, 1.14];
    var swayPattern = [0.76, 1, 0.86, 1.1, 0.92];

    // Сначала намечаем границы волн. Короткий остаток у подвала не выделяем в
    // отдельный сегмент: русло успело бы только резко дёрнуться к центру —
    // вместо этого им удлиняется последняя волна.
    var stops = [];
    var markY = settle;
    var wave = 0;
    while (markY < height) {
      var span = waveSpan * spanPattern[wave % spanPattern.length];
      var stopY = markY + span;
      if (height - stopY < span * 0.6) stopY = height;
      stops.push(Math.min(stopY, height));
      markY = stopY;
      wave++;
    }

    var riverY = settle;
    var riverX = centerX;
    var direction = 1;
    stops.forEach(function (nextY, index) {
      var length = nextY - riverY;
      // Последняя волна приходит ровно в центр — там нить встречает волну подвала.
      var nextX = nextY >= height ? centerX : centerX + direction * sway * swayPattern[index % swayPattern.length];
      d.push(
        "C " + riverX.toFixed(1) + " " + (riverY + length * 0.3).toFixed(1) + ", " +
        nextX.toFixed(1) + " " + (nextY - length * 0.3).toFixed(1) + ", " +
        nextX.toFixed(1) + " " + nextY.toFixed(1)
      );
      riverX = nextX;
      riverY = nextY;
      direction *= -1;
    });
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
  var pathSceneEls = Array.prototype.slice.call(document.querySelectorAll(".path-scene"));
  var pathStepEls = Array.prototype.slice.call(document.querySelectorAll(".path-step"));
  var pathActiveIndex = -1;

  function smoothStep(value) {
    value = Math.max(0, Math.min(1, value));
    return value * value * (3 - 2 * value);
  }

  function updatePathFlow() {
    if (!pathSection || !pathSteps || !pathLineFill) return;
    var rect = pathSection.getBoundingClientRect();
    var vh = window.innerHeight;
    var scrollRange = Math.max(1, rect.height - vh);
    var p = -rect.top / scrollRange;
    p = Math.max(0, Math.min(1, p));
    var lastIndex = Math.max(1, pathSceneEls.length - 1);
    var stagePosition = p * lastIndex;
    var activeIndex = Math.max(0, Math.min(lastIndex, Math.round(stagePosition)));
    var pct = (p * 100).toFixed(2) + "%";
    pathLineFill.style.height = pct;
    pathSteps.style.setProperty("--flow", pct);
    pathSteps.classList.toggle("flowing", p > 0.01 && p < 0.99);

    pathSceneEls.forEach(function (scene, index) {
      var rawOpacity = reduceMotion ? (index === activeIndex ? 1 : 0) : 1 - Math.abs(stagePosition - index);
      var opacity = smoothStep(rawOpacity);
      var localProgress = Math.max(0, Math.min(1, (stagePosition - index + 1) / 2));
      scene.style.setProperty("--scene-opacity", opacity.toFixed(4));
      scene.style.setProperty("--scene-scale", (1.035 + localProgress * 0.025).toFixed(4));
      scene.style.setProperty("--scene-y", ((0.5 - localProgress) * 12).toFixed(2) + "px");
    });

    if (activeIndex !== pathActiveIndex) {
      pathActiveIndex = activeIndex;
      pathStepEls.forEach(function (step, index) {
        var isActive = index === activeIndex;
        step.classList.toggle("is-active", isActive);
        step.classList.toggle("is-past", index < activeIndex);
        if (isActive) step.setAttribute("aria-current", "step");
        else step.removeAttribute("aria-current");
      });
      if (pathStepEls[activeIndex]) {
        pathSection.setAttribute("data-active-stage", pathStepEls[activeIndex].getAttribute("data-stage"));
      }
    }
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
    updatePathFlow();
    if (!reduceMotion) updateOriginParallax();
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
  window.addEventListener("resize", updatePathFlow, { passive: true });
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

  /* ---- Галерея внутри карточки товара ----
     Все снимки одного товара лежат в одной .product-photo, показан один;
     стрелки по краям фото и точки под ним переключают. Скрытые кадры —
     display:none, поэтому lazy-загрузка до них не доходит: страница каталога
     не тянет три десятка картинок разом. Перед первым переключением
     «прогреваем» карточку. */
  function initProductGalleries() {
    document.querySelectorAll(".product").forEach(function (card) {
      // cms.js пересобирает карточки целиком, так что после перерисовки
      // флага на новом узле нет и обработчики вешаются заново.
      if (card.dataset.gallery) return;
      var shots = card.querySelectorAll(".product-photo .pshot");
      var dots = card.querySelectorAll(".product-dots .pdot");
      if (shots.length < 2 || dots.length !== shots.length) return;
      card.dataset.gallery = "on";

      var warmed = false;
      function warm() {
        if (warmed) return;
        warmed = true;
        shots.forEach(function (shot) {
          var img = shot.querySelector("img");
          if (img) img.loading = "eager";
        });
      }
      card.addEventListener("pointerenter", warm);
      card.addEventListener("focusin", warm);

      var current = 0;
      function show(index) {
        warm();
        current = (index + shots.length) % shots.length;
        shots.forEach(function (shot, i) { shot.classList.toggle("is-on", i === current); });
        dots.forEach(function (dot, i) {
          dot.classList.toggle("is-on", i === current);
          dot.setAttribute("aria-pressed", i === current ? "true" : "false");
        });
      }

      dots.forEach(function (dot, index) {
        dot.addEventListener("click", function () { show(index); });
        dot.addEventListener("keydown", function (ev) {
          var step = ev.key === "ArrowRight" ? 1 : ev.key === "ArrowLeft" ? -1 : 0;
          if (!step) return;
          ev.preventDefault();
          var next = (index + step + dots.length) % dots.length;
          show(next);
          dots[next].focus();
        });
      });

      // Стрелки по краям фото: пролистывают по кругу, чтобы с последнего
      // кадра можно было вернуться к бутылке одним нажатием.
      card.querySelectorAll(".product-photo .pnav").forEach(function (arrow) {
        var step = arrow.classList.contains("pnav-prev") ? -1 : 1;
        arrow.addEventListener("click", function () { show(current + step); });
      });
    });
  }
  initProductGalleries();

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
    document.querySelectorAll("[data-alt-en]").forEach(function (el) {
      el.setAttribute("alt", toEn ? el.getAttribute("data-alt-en") : (el.getAttribute("data-alt-ru") || ""));
    });
    htmlEl.setAttribute("lang", toEn ? "en" : "ru");
    if (langToggle) {
      langToggle.querySelectorAll(".lang-opt").forEach(function (o) {
        o.classList.toggle("is-active", o.getAttribute("data-lang") === lang);
      });
    }
    try { localStorage.setItem("novo-lang", lang); } catch (e) {}
    // Адрес отражает язык: ?lang=en. Это нужно для hreflang и для того, чтобы
    // ссылкой на английскую версию можно было поделиться. History API — без
    // перезагрузки, поэтому требование ТЗ «переключение не сбрасывает
    // страницу» сохраняется.
    try {
      var url = new URL(window.location.href);
      if (toEn) url.searchParams.set("lang", "en");
      else url.searchParams.delete("lang");
      window.history.replaceState(null, "", url.pathname + url.search + url.hash);
      // canonical должен указывать на текущую языковую версию, иначе поисковик
      // сочтёт английскую страницу дублем русской и выкинет её из индекса.
      var canonical = document.getElementById("canonicalLink");
      if (canonical) {
        var base = canonical.getAttribute("href").split("?")[0];
        canonical.setAttribute("href", toEn ? base + "?lang=en" : base);
      }
    } catch (e) {}
  }

  if (langToggle) {
    langToggle.addEventListener("click", function () {
      var next = htmlEl.getAttribute("lang") === "en" ? "ru" : "en";
      setLang(next);
    });
    // Язык из адреса важнее сохранённого: пользователь пришёл по конкретной
    // ссылке, и она должна открыться именно на том языке.
    var fromUrl = null;
    try { fromUrl = new URL(window.location.href).searchParams.get("lang"); } catch (e) {}
    var saved;
    try { saved = localStorage.getItem("novo-lang"); } catch (e) {}
    if (fromUrl === "en" || (fromUrl === null && saved === "en")) setLang("en");
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
    // CMS перезаписала русскую базу. Старый WeakMap иначе возвращал бы
    // прежнюю статическую версию после переключения EN → RU.
    ruStore = new WeakMap();
    applyReveals(document);
    initCollectionDots(); // карусель перерисована из JSON — пересобираем точки
    initProductGalleries();
    if (htmlEl.getAttribute("lang") === "en") setLang("en");
  });
})();
