/* Лента новостей: рисует записи из content/news.json в блок .news-feed.
   Пустое состояние живёт в разметке — если файла нет или раздел пуст,
   на странице остаётся текст «пока нет записей», а не битая вёрстка.

   Запись показывается свёрнутой: снимок, дата, заголовок и первый абзац.
   Остальные абзацы, полоса кадров и ссылка на ролик прячутся в <details> —
   иначе три десятка полных новостей превращают страницу в простыню. */
(function () {
  "use strict";

  var feed = document.querySelector(".news-feed");
  if (!feed) return;
  var key = feed.getAttribute("data-feed");
  if (!key) return;

  function esc(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  /* Перевод приезжает в data-en и подставляется через innerHTML, поэтому
     текст экранируем дважды: один раз для innerHTML, второй — для атрибута. */
  function attr(value) {
    return esc(lines(esc(value)));
  }

  /* Переносы внутри абзаца значимы только в стихах — там они и есть строфа. */
  function lines(escaped) {
    return escaped.replace(/\r?\n/g, "<br />");
  }

  /* Те же правила, что в cms.js: пускаем только http(s) и относительные
     адреса, чтобы запись из админки не могла подсунуть javascript:. */
  function safeUrl(value) {
    var url = String(value == null ? "" : value).trim();
    if (!url || /[\x00-\x1f\\]/.test(url) || /^\/\//.test(url)) return "";
    var protocol = url.match(/^([a-z][a-z0-9+.-]*):/i);
    if (protocol && !/^https?$/i.test(protocol[1])) return "";
    return url;
  }

  var MONTHS_RU = ["января", "февраля", "марта", "апреля", "мая", "июня",
    "июля", "августа", "сентября", "октября", "ноября", "декабря"];

  /* Дату разбираем вручную из YYYY-MM-DD: new Date("2026-03-05") трактуется
     как UTC, и в минусовых поясах число уезжает на день назад. */
  function parseDate(value) {
    var match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || "").trim());
    if (!match) return null;
    var month = Number(match[2]) - 1;
    if (month < 0 || month > 11) return null;
    return { year: Number(match[1]), month: month, day: Number(match[3]) };
  }

  function formatRu(parts) {
    return parts.day + " " + MONTHS_RU[parts.month] + " " + parts.year;
  }

  function formatEn(parts) {
    var iso = isoOf(parts);
    // toLocaleDateString с явным UTC — иначе тот же сдвиг на сутки.
    try {
      return new Date(iso + "T12:00:00Z").toLocaleDateString("en-GB",
        { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
    } catch (error) {
      return iso;
    }
  }

  function isoOf(parts) {
    return parts.year + "-" + ("0" + (parts.month + 1)).slice(-2) + "-" + ("0" + parts.day).slice(-2);
  }

  /* Текст записи может прийти одной строкой (старый формат админки) или
     списком абзацев — приводим к списку и выбрасываем пустое. */
  function paragraphs(value) {
    var list = Array.isArray(value) ? value : [value];
    return list.map(function (item) { return String(item == null ? "" : item).trim(); })
      .filter(function (item) { return item.length > 0; });
  }

  /* Снимок отдаём в двух форматах: avif лежит рядом с webp под тем же именем.
     Размеры проставлены всегда — без них лента прыгает при загрузке. */
  function picture(photo, className) {
    if (!photo) return "";
    var src = safeUrl(photo.src);
    if (!src) return "";
    var altRu = photo.alt_ru || "";
    var altEn = photo.alt_en || altRu;
    return '<picture class="' + className + '">' +
      '<source srcset="' + esc(src) + '.avif" type="image/avif" />' +
      '<img src="' + esc(src) + '.webp" width="' + (parseInt(photo.w, 10) || 640) +
      '" height="' + (parseInt(photo.h, 10) || 427) + '" loading="lazy" decoding="async"' +
      ' alt="' + esc(altRu) + '" data-en-alt="' + esc(altEn) + '" /></picture>';
  }

  /* Свои ролики лежат в assets/video рядом с обложкой в webp. preload="none" —
     запись открывается по «Читать полностью», и качать три мегабайта до того,
     как человек нажал play, незачем. */
  function clip(item) {
    if (!item) return "";
    var src = safeUrl(item.src);
    if (!src) return "";
    var poster = safeUrl(item.poster);
    var caption = String(item.caption_ru || "").trim();
    return '<figure class="news-clip">' +
      '<video controls playsinline preload="none"' +
      (poster ? ' poster="' + esc(poster) + '.webp"' : "") +
      ' width="' + (parseInt(item.w, 10) || 464) +
      '" height="' + (parseInt(item.h, 10) || 848) + '">' +
      '<source src="' + esc(src) + '" type="video/mp4" />' +
      "</video>" +
      (caption
        ? '<figcaption data-en="' + attr(item.caption_en || caption) + '">' +
          lines(esc(caption)) + "</figcaption>"
        : "") +
      "</figure>";
  }

  function render(items) {
    if (!Array.isArray(items) || !items.length) return;

    // Свежие сверху. Записи без даты не выбрасываем — ставим в конец,
    // иначе опечатка в админке молча скрыла бы новость.
    var list = items.slice().sort(function (a, b) {
      var da = parseDate(a.date), db = parseDate(b.date);
      if (!da && !db) return 0;
      if (!da) return 1;
      if (!db) return -1;
      return isoOf(db).localeCompare(isoOf(da));
    });

    feed.innerHTML = '<ul class="news-list">' + list.map(function (item) {
      var parts = parseDate(item.date);
      var time = parts
        ? '<time class="news-date" datetime="' + esc(isoOf(parts)) + '" data-en="' +
          esc(formatEn(parts)) + '">' + esc(formatRu(parts)) + "</time>"
        : "";

      var titleRu = esc(item.title_ru || "");
      var title = '<h2 class="news-title" data-en="' + attr(item.title_en || item.title_ru || "") +
        '">' + titleRu + "</h2>";

      var ru = paragraphs(item.text_ru);
      var en = paragraphs(item.text_en);
      if (en.length !== ru.length) en = ru;         // перевод не бьётся — не путаем абзацы
      var text = ru.map(function (value, index) {
        return '<p class="news-text" data-en="' + attr(en[index]) + '">' +
          lines(esc(value)) + "</p>";
      });

      var lead = picture(item.photo, "news-photo");
      var shots = (Array.isArray(item.gallery) ? item.gallery : [])
        .map(function (shot) { return picture(shot, "news-shot"); })
        .filter(Boolean);
      var gallery = shots.length ? '<div class="news-gallery">' + shots.join("") + "</div>" : "";

      var clips = (Array.isArray(item.clips) ? item.clips : [])
        .map(clip).filter(Boolean);
      var player = clips.length ? '<div class="news-clips">' + clips.join("") + "</div>" : "";

      // Ролики и сайты партнёров — единственное, что уводит с сайта.
      var links = [];
      var video = item.video && safeUrl(item.video.url);
      if (video) {
        links.push('<a class="news-link is-video" href="' + esc(video) +
          '" target="_blank" rel="noopener" data-analytics="news-video">' +
          '<span data-en="Watch the video">Смотреть видео</span></a>');
      }
      var extra = item.link && safeUrl(item.link.url);
      if (extra) {
        links.push('<a class="news-link" href="' + esc(extra) +
          '" target="_blank" rel="noopener" data-analytics="news-open"><span data-en="' +
          attr(item.link.label_en || item.link.label_ru || item.link.url) + '">' +
          esc(item.link.label_ru || item.link.url) + "</span></a>");
      }
      var more = links.length ? '<p class="news-more">' + links.join("") + "</p>" : "";

      // В свёрнутом виде оставляем первый абзац; всё остальное — под кнопкой.
      var rest = text.slice(1).join("") + player + gallery + more;
      var body = text.slice(0, 1).join("") + (rest
        ? '<details class="news-full"><summary><span data-en="Read in full">Читать полностью</span>' +
          '<span class="sr-only" data-en=": ' + attr(item.title_en || item.title_ru || "") + '">: ' +
          titleRu + "</span></summary><div class=\"news-rest\">" + rest + "</div></details>"
        : "");

      return '<li class="news-item">' + lead +
        '<div class="news-body">' + time + title + body + "</div></li>";
    }).join("") + "</ul>";

    /* Класс .reveal здесь намеренно не ставим: анимацию появления включает
       main.js, а на внутренних страницах его нет — записи остались бы с
       opacity:0 навсегда. */

    /* Записи дорисованы после старта, поэтому переключатель языка их ещё не
       видел: при выбранном EN они остались бы по-русски. */
    document.dispatchEvent(new CustomEvent("novo:contentadded", { detail: { root: feed } }));
  }

  fetch("content/news.json", { cache: "no-cache" })
    .then(function (response) {
      if (!response.ok) throw new Error("news.json " + response.status);
      return response.json();
    })
    .then(function (data) { render(data && data[key]); })
    .catch(function () { /* остаётся пустое состояние из разметки */ });
})();
