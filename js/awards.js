/* Листалка наград (awards.html).

   Сама прокрутка — родная: у дорожки overflow-x и scroll-snap, поэтому свайп,
   колесо, трекпад и клавиатурная навигация по ссылкам внутри работают без
   единой строчки скрипта. Этот файл добавляет только стрелки и счётчик
   страниц, то есть ровно то, что без JS не сделать. Если скрипт не загрузился,
   галерея остаётся проходимой — панель управления просто не появляется
   (в CSS у .awards-nav display:none до класса is-ready).

   «Страница» — целое число карточек, влезающих в кадр: их количество задаёт
   CSS-переменная --per, и на разной ширине оно разное. Поэтому шаг считается
   из фактических размеров, а не из константы. */
(function () {
  "use strict";

  var sliders = [].slice.call(document.querySelectorAll(".awards-slider"));
  if (!sliders.length) return;

  var ICON_PREV = '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M15 4 7 12l8 8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var ICON_NEXT = '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M9 4l8 8-8 8" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  function button(icon, ru, en) {
    var element = document.createElement("button");
    element.type = "button";
    element.className = "awards-arrow";
    element.innerHTML = icon;
    element.setAttribute("aria-label", ru);
    element.setAttribute("data-en-aria-label", en);
    return element;
  }

  function setup(slider) {
    var track = slider.querySelector(".awards-track");
    if (!track) return;
    var items = track.children;
    if (items.length < 2) return;

    var nav = document.createElement("div");
    nav.className = "awards-nav";
    var prev = button(ICON_PREV, "Предыдущие награды", "Previous awards");
    var next = button(ICON_NEXT, "Следующие награды", "Next awards");

    /* Счётчик собран из отдельных кусков намеренно: переключатель языка
       переписывает innerHTML у всего с data-en, поэтому сами числа лежат
       снаружи переводимых узлов — иначе после смены языка на их месте
       оказался бы русский шаблон. Косая черта видна, «из» — только
       скринридеру: «1 / 13» вслух звучит как набор символов. */
    var count = document.createElement("p");
    count.className = "awards-count";
    var now = document.createElement("span");
    now.textContent = "1";
    var slash = document.createElement("span");
    slash.setAttribute("aria-hidden", "true");
    slash.textContent = " / ";
    var of = document.createElement("span");
    of.className = "sr-only";
    of.setAttribute("data-en", " of ");
    of.textContent = " из ";
    var total = document.createElement("span");
    count.appendChild(now);
    count.appendChild(slash);
    count.appendChild(of);
    count.appendChild(total);

    if (track.id) {
      prev.setAttribute("aria-controls", track.id);
      next.setAttribute("aria-controls", track.id);
    }

    nav.appendChild(prev);
    nav.appendChild(next);
    nav.appendChild(count);
    slider.insertBefore(nav, track);

    var step = 0;
    var per = 1;
    var pages = 1;

    function measure() {
      var first = items[0];
      var gap = parseFloat(getComputedStyle(track).columnGap) || 0;
      step = first.getBoundingClientRect().width + gap;
      /* Округляем к ближайшему целому: из-за дробных пикселей ширины
         calc() отношение бывает 3.98 вместо 4, и floor давал бы на одну
         карточку меньше — последний скан оставался бы недостижимым. */
      per = step > 0 ? Math.max(1, Math.round(track.clientWidth / step)) : 1;
      pages = Math.max(1, Math.ceil(items.length / per));
      total.textContent = String(pages);
      nav.classList.toggle("is-ready", pages > 1);
    }

    function page() {
      if (!step) return 0;
      /* Последняя страница почти всегда неполная: она упирается в правый край
         и до её «начала» прокрутка не доезжает. Считать её номер из scrollLeft
         поэтому нельзя — у сорока девяти сканов по четыре в кадре последний
         экран так показывал бы 9 из 13. У правого края номер берём напрямую. */
      if (atEnd()) return pages - 1;
      var raw = Math.round(track.scrollLeft / (step * per));
      return Math.min(Math.max(raw, 0), pages - 1);
    }

    function atEnd() {
      var max = track.scrollWidth - track.clientWidth;
      return max > 0 && track.scrollLeft >= max - 1;
    }

    function sync() {
      now.textContent = String(page() + 1);
      var atStart = track.scrollLeft <= 1;
      /* Если гаснет кнопка, на которой стоит фокус, он улетает на <body> и
         клавиатурный обход начинается заново. Передаём его соседней. */
      if (atStart && document.activeElement === prev) next.focus();
      else if (atEnd() && document.activeElement === next) prev.focus();
      prev.disabled = atStart;
      next.disabled = atEnd();
    }

    /* behavior в scrollTo сильнее, чем scroll-behavior в CSS, поэтому
       «без анимации» приходится спрашивать здесь ещё раз: иначе правило
       в prefers-reduced-motion ничего бы не решало для кнопок. */
    var calm = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)");

    function go(delta) {
      var target = Math.min(Math.max(page() + delta, 0), pages - 1);
      track.scrollTo({
        left: Math.round(target * per * step),
        behavior: calm && calm.matches ? "auto" : "smooth",
      });
    }

    prev.addEventListener("click", function () { go(-1); });
    next.addEventListener("click", function () { go(1); });

    /* Стрелки на клавиатуре: фокус на дорожке или на любой карточке внутри.
       Родное поведение прокрутки на стрелках сдвигает кадр на пару десятков
       пикселей и оставляет карточку разрезанной — листаем целыми страницами. */
    track.addEventListener("keydown", function (event) {
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      if (event.key === "ArrowRight") { event.preventDefault(); go(1); }
      else if (event.key === "ArrowLeft") { event.preventDefault(); go(-1); }
    });

    var frame = 0;
    track.addEventListener("scroll", function () {
      if (frame) return;
      frame = requestAnimationFrame(function () { frame = 0; sync(); });
    }, { passive: true });

    /* Пересчёт при смене ширины: --per другой, значит и страницы другие.
       ResizeObserver, а не resize у окна: дорожка меняет ширину и когда
       окно не двигается — например, при появлении вертикальной полосы
       прокрутки после дозагрузки картинок. */
    if (window.ResizeObserver) {
      var known = 0;
      new ResizeObserver(function () {
        if (Math.abs(track.clientWidth - known) < 1) return;
        known = track.clientWidth;
        measure();
        sync();
      }).observe(track);
    } else {
      window.addEventListener("resize", function () { measure(); sync(); });
    }

    measure();
    sync();
  }

  sliders.forEach(setup);

  /* Кнопки и «из» появились после старта переключателя языка — просим его
     перевести их, если выбран английский. */
  document.dispatchEvent(new CustomEvent("novo:contentadded"));
})();
