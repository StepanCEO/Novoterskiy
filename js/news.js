/* Лента новостей: рисует записи из content/news.json в блок .news-feed.
   Пустое состояние живёт в разметке — если файла нет или раздел пуст,
   на странице остаётся текст «пока нет записей», а не битая вёрстка. */
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

  /* Те же правила, что в cms.js: пускаем только http(s) и относительные
     адреса, чтобы запись из админки не могла подсунуть javascript:. */
  function safeUrl(value) {
    var url = String(value == null ? "" : value).trim();
    if (!url || /[\u0000-\u001f\\]/.test(url) || /^\/\//.test(url)) return "";
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
    var iso = parts.year + "-" + ("0" + (parts.month + 1)).slice(-2) + "-" + ("0" + parts.day).slice(-2);
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

      var image = safeUrl(item.image);
      var alt = item.image_alt_ru || item.title_ru || "";
      var picture = image
        ? '<div class="news-photo"><img src="' + esc(image) + '" loading="lazy" width="' +
          (parseInt(item.image_width, 10) || 800) + '" height="' +
          (parseInt(item.image_height, 10) || 500) + '" alt="' + esc(alt) +
          '" data-alt-ru="' + esc(alt) + '" data-alt-en="' + esc(item.image_alt_en || alt) + '" /></div>'
        : "";

      var titleRu = esc(item.title_ru || "");
      var title = '<h2 class="news-title" data-en="' + esc(esc(item.title_en || item.title_ru || "")) +
        '">' + titleRu + "</h2>";

      var textRu = esc(item.text_ru || "");
      var text = textRu
        ? '<p class="news-text" data-en="' + esc(esc(item.text_en || item.text_ru || "")) + '">' + textRu + "</p>"
        : "";

      var link = safeUrl(item.url);
      // Заголовок ссылки дублируем в sr-only: список из одинаковых «Подробнее»
      // без контекста бесполезен для скринридера.
      var more = link
        ? '<p class="news-more"><a href="' + esc(link) + '" target="_blank" rel="noopener" data-analytics="news-open">' +
          '<span data-en="Read more">Подробнее</span>' +
          '<span class="sr-only" data-en=": ' + esc(esc(item.title_en || item.title_ru || "")) + '">: ' + titleRu + "</span></a></p>"
        : "";

      return '<li class="news-item">' + picture +
        '<div class="news-body">' + time + title + text + more + "</div></li>";
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
