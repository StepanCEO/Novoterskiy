/* Novoterskaya — CMS hydration (п.14 ТЗ)
   Подтягивает контент из /content/*.json и обновляет соответствующие блоки.
   Работает поверх статической разметки: если JSON недоступен (например,
   открыли файл локально без сервера) — на странице остаётся вёрстка по умолчанию.
   Редактирование контента — через админку /admin/ (Sveltia/Decap CMS),
   которая коммитит изменения в эти JSON-файлы. Пересборка не требуется. */
(function () {
  "use strict";

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function getJSON(url) {
    return fetch(url, { cache: "no-cache" }).then(function (r) {
      if (!r.ok) throw new Error(url + " " + r.status);
      return r.json();
    });
  }

  /* ---- Продукция ---- */
  function hydrateProducts(data) {
    var track = document.querySelector(".collection-track");
    if (!track || !data || !Array.isArray(data.items) || !data.items.length) return;
    track.innerHTML = data.items.map(function (p) {
      return '' +
        '<article class="product reveal">' +
          '<div class="product-photo">' +
            '<img src="' + esc(p.photo) + '" loading="lazy" alt="' + esc(p.title + " — " + p.type) + '" />' +
          '</div>' +
          '<h3>' + esc(p.title) + '</h3>' +
          '<p class="product-type" data-en="' + esc(p.type_en || p.type) + '">' + esc(p.type) + '</p>' +
          '<a class="btn btn-outline" href="#where" data-analytics="product-buy" data-product="' +
            esc(p.id) + '" data-en="Buy">Купить</a>' +
        '</article>';
    }).join("");
  }

  /* ---- Где купить ---- */
  function hydrateDistributors(data) {
    var grid = document.querySelector(".where-grid");
    if (!grid || !data || !Array.isArray(data.distributors) || !data.distributors.length) return;
    grid.innerHTML = data.distributors.map(function (d) {
      var lines = "";
      if (d.phone) {
        lines += '<p class="dist-line"><a href="tel:' + esc(d.phone.replace(/[^+\d]/g, "")) +
          '">' + esc(d.phone) + '</a></p>';
      }
      (d.emails || []).forEach(function (m) {
        lines += '<p class="dist-line"><a href="mailto:' + esc(m) + '">' + esc(m) + '</a></p>';
      });
      return '<article class="dist reveal"><h3>' + esc(d.name) + '</h3>' + lines + '</article>';
    }).join("");
  }

  /* ---- Документы ---- */
  function hydrateDocuments(data) {
    var list = document.querySelector(".docs-grid");
    if (!list || !data || !Array.isArray(data.items) || !data.items.length) return;
    list.innerHTML = data.items.map(function (d) {
      var href = d.file ? esc(d.file) : ("documents.html#" + esc(d.anchor || d.id));
      var ext = d.file ? ' target="_blank" rel="noopener"' : "";
      var nameEn = d.name_en ? ' data-en="' + esc(d.name_en) + '"' : "";
      var descEn = d.desc_en ? ' data-en="' + esc(d.desc_en) + '"' : "";
      return '<li class="doc reveal">' +
        '<a class="doc-link" href="' + href + '"' + ext +
          ' data-analytics="doc-open" data-doc="' + esc(d.id) + '">' +
          '<span class="doc-mark" aria-hidden="true">✓</span>' +
          '<span class="doc-name"' + nameEn + '>' + esc(d.name) + '</span>' +
          '<span class="doc-desc"' + descEn + '>' + esc(d.desc) + '</span>' +
        '</a></li>';
    }).join("");
  }

  var jobs = [
    ["content/products.json", hydrateProducts],
    ["content/contacts.json", hydrateDistributors],
    ["content/documents.json", hydrateDocuments]
  ];

  Promise.all(jobs.map(function (j) {
    return getJSON(j[0]).then(j[1]).catch(function () { /* оставляем статическую вёрстку */ });
  })).then(function () {
    // Пересобрали DOM — уведомляем основной скрипт, чтобы повесить reveal/язык/аналитику
    document.dispatchEvent(new CustomEvent("novo:hydrated"));
  });
})();
