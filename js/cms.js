/* Novoterskaya — безопасная подстановка контента из Sveltia CMS.
   Статическая HTML-разметка остаётся fallback, если JSON недоступен. */
(function () {
  "use strict";

  function esc(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function safeUrl(value, fallback, contactAllowed) {
    var url = String(value == null ? "" : value).trim();
    if (!url || /[\u0000-\u001f\\]/.test(url) || /^\/\//.test(url)) return fallback || "";
    var protocol = url.match(/^([a-z][a-z0-9+.-]*):/i);
    if (protocol && !/^https?$/i.test(protocol[1]) && !(contactAllowed && /^(mailto|tel)$/i.test(protocol[1]))) {
      return fallback || "";
    }
    return url;
  }

  function safeAsset(value, fallback) {
    return safeUrl(value, fallback, false);
  }

  function getJSON(url) {
    return fetch(url, { cache: "no-cache" }).then(function (response) {
      if (!response.ok) throw new Error(url + " " + response.status);
      return response.json();
    });
  }

  function one(selector, root) {
    return (root || document).querySelector(selector);
  }

  function all(selector, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(selector));
  }

  /* English is entity-escaped because main.js deliberately swaps data-en through
     innerHTML. Russian is always written with textContent. */
  function bilingual(element, ru, en) {
    if (!element || ru == null) return;
    element.textContent = String(ru);
    if (en != null) element.setAttribute("data-en", esc(en));
  }

  function setLink(element, value, fallback) {
    if (element && value != null) element.setAttribute("href", safeUrl(value, fallback || element.getAttribute("href"), true));
  }

  function setImage(element, value, fallback, altRu, altEn) {
    if (!element) return;
    if (value != null) element.setAttribute("src", safeAsset(value, fallback || element.getAttribute("src")));
    if (altRu != null) {
      element.setAttribute("alt", String(altRu));
      element.setAttribute("data-alt-ru", String(altRu));
    }
    if (altEn != null) element.setAttribute("data-alt-en", esc(altEn));
  }

  function sectionHead(root, data, withText) {
    if (!root || !data) return;
    bilingual(one(".eyebrow", root), data.eyebrow_ru, data.eyebrow_en);
    bilingual(one(".section-title", root), data.title_ru, data.title_en);
    if (withText !== false) bilingual(one(".section-lede", root), data.text_ru, data.text_en);
  }

  function hydrateSite(data) {
    if (!data) return;
    siteContent = data;

    var brand = data.brand || {};
    all(".brand-name").forEach(function (node) { bilingual(node, brand.name_ru, brand.name_en); });
    bilingual(one(".site-header .brand-tag"), brand.tagline_ru, brand.tagline_en);
    setImage(one(".site-header .brand-mark"), brand.logo);

    var header = data.header || {};
    all(".site-nav a").forEach(function (node, index) {
      var item = (header.nav || [])[index];
      if (!item) return;
      bilingual(node, item.label_ru, item.label_en);
      setLink(node, item.url);
    });
    var headerCta = one(".header-actions .btn");
    bilingual(headerCta, header.cta_ru, header.cta_en);
    setLink(headerCta, header.cta_url);

    var hero = data.hero || {};
    var heroTitle = one("#hero-title");
    if (heroTitle && hero.title_line_1_ru != null && hero.title_line_2_ru != null) {
      heroTitle.innerHTML = '<span class="hero-line">' + esc(hero.title_line_1_ru) + '</span> ' +
        '<span class="hero-line">' + esc(hero.title_line_2_ru) + '</span>';
      heroTitle.setAttribute("data-en", '<span class="hero-line">' + esc(hero.title_line_1_en || "") + '</span> ' +
        '<span class="hero-line">' + esc(hero.title_line_2_en || "") + '</span>');
    }
    bilingual(one(".hero-sub"), hero.text_ru, hero.text_en);
    var heroCtas = all(".hero-cta a");
    bilingual(heroCtas[0], hero.primary_cta_ru, hero.primary_cta_en);
    setLink(heroCtas[0], hero.primary_cta_url);
    bilingual(one(".btn-play-label", heroCtas[1]), hero.secondary_cta_ru, hero.secondary_cta_en);
    setLink(heroCtas[1], hero.secondary_cta_url);
    setImage(one(".hero-bg img"), hero.background);

    var elements = data.elements || {};
    var elementsRoot = one("#elements");
    sectionHead(elementsRoot, elements);
    all(".el", elementsRoot).forEach(function (card, index) {
      var item = (elements.items || [])[index];
      if (!item) return;
      bilingual(one("h3", card), item.title_ru, item.title_en);
      bilingual(one(".el-cap p", card), item.text_ru, item.text_en);
      setImage(one(".el-photo", card), item.image, null, item.image_alt_ru, item.image_alt_en);
      setImage(one(".el-icon img", card), item.icon);
    });

    var path = data.path || {};
    var pathRoot = one("#path");
    sectionHead(pathRoot, path);
    (path.items || []).forEach(function (item) {
      var stage = String(item.stage || "").replace(/[^a-z-]/gi, "");
      var step = one('.path-step[data-stage="' + stage + '"]', pathRoot);
      var scene = one('.path-scene[data-scene="' + stage + '"] img', pathRoot);
      bilingual(one("h3", step), item.title_ru, item.title_en);
      bilingual(one("p", step), item.text_ru, item.text_en);
      setImage(scene, item.image);
    });

    var minerals = data.minerals || {};
    var mineralsRoot = one("#minerals");
    sectionHead(mineralsRoot, minerals, false);
    all(".mineral", mineralsRoot).forEach(function (card, index) {
      var item = (minerals.items || [])[index];
      if (!item) return;
      if (item.symbol != null && one(".mineral-sym", card)) one(".mineral-sym", card).textContent = String(item.symbol);
      bilingual(one("h3", card), item.title_ru, item.title_en);
      bilingual(one("p", card), item.text_ru, item.text_en);
      setImage(one(".mineral-photo img", card), item.image, null, item.image_alt_ru, item.image_alt_en);
    });

    var origin = data.origin || {};
    var originRoot = one("#origin");
    bilingual(one(".eyebrow", originRoot), origin.eyebrow_ru, origin.eyebrow_en);
    bilingual(one(".origin-title", originRoot), origin.title_ru, origin.title_en);
    bilingual(one(".origin-fact", originRoot), origin.text_ru, origin.text_en);
    var originCta = one(".link-arrow", originRoot);
    bilingual(originCta, origin.cta_ru, origin.cta_en);
    setLink(originCta, origin.cta_url);
    if (originRoot && origin.background) {
      var originImage = encodeURI(safeAsset(origin.background, "assets/photos/origin-stream.webp")).replace(/["'\\]/g, "");
      originRoot.style.backgroundImage = "linear-gradient(90deg, rgba(244,249,252,.42) 0%, rgba(244,249,252,.06) 55%), url(\"" + originImage + "\")";
      originRoot.style.backgroundPosition = "center";
      originRoot.style.backgroundSize = "cover";
    }

    var trust = data.trust || {};
    var trustRoot = one("#trust");
    sectionHead(trustRoot, trust);
    all(".trust-stats .stat", trustRoot).forEach(function (card, index) {
      var item = (trust.stats || [])[index];
      if (!item) return;
      var value = one(".stat-val", card);
      var suffix = one(".stat-unit", card);
      if (value) {
        value.textContent = String(item.value == null ? "" : item.value);
        if (/^\d+$/.test(String(item.value))) value.setAttribute("data-count", String(item.value));
        else value.removeAttribute("data-count");
      }
      if (suffix) suffix.textContent = String(item.suffix || "");
      bilingual(one(".stat-cap", card), item.label_ru, item.label_en);
    });
    all(".trust-card", trustRoot).forEach(function (card, index) {
      var item = (trust.cards || [])[index];
      if (!item) return;
      bilingual(one("h3", card), item.title_ru, item.title_en);
      bilingual(one("p", card), item.text_ru, item.text_en);
    });
    bilingual(one(".docs-title", trustRoot), trust.documents_title_ru, trust.documents_title_en);
    bilingual(one(".docs-note", trustRoot), trust.documents_note_ru, trust.documents_note_en);
    var docsCta = one(".trust-link", trustRoot);
    bilingual(docsCta, trust.documents_cta_ru, trust.documents_cta_en);
    setLink(docsCta, trust.documents_cta_url);

    var collection = data.collection || {};
    var collectionRoot = one("#collection");
    sectionHead(collectionRoot, collection, false);
    all(".product .btn", collectionRoot).forEach(function (button) {
      bilingual(button, collection.buy_ru, collection.buy_en);
      if (!button.getAttribute("href")) setLink(button, collection.default_buy_url);
    });

    var finalData = data.final || {};
    var finalRoot = one("#final");
    bilingual(one(".final-quote", finalRoot), finalData.quote_ru, finalData.quote_en);
    bilingual(one(".final-accent", finalRoot), finalData.accent_ru, finalData.accent_en);
    var finalCta = one(".final-inner .btn", finalRoot);
    bilingual(finalCta, finalData.cta_ru, finalData.cta_en);
    setLink(finalCta, finalData.cta_url);
    setImage(one(".final-bottle img", finalRoot), finalData.bottle);
    setImage(one(".final-mark", finalRoot), finalData.logo);

    sectionHead(one("#where"), data.where || {});
    sectionHead(one("#contacts"), data.contacts || {}, false);

    var footer = data.footer || {};
    bilingual(one(".footer-brand p"), footer.text_ru, footer.text_en);
    all(".footer-nav a").forEach(function (node, index) {
      var item = (footer.nav || [])[index];
      if (!item) return;
      bilingual(node, item.label_ru, item.label_en);
      setLink(node, item.url);
    });
    var legal = all(".footer-legal > *");
    bilingual(legal[0], footer.privacy_ru, footer.privacy_en);
    setLink(legal[0], footer.privacy_url);
    bilingual(legal[1], footer.copyright_ru, footer.copyright_en);

    var cookie = data.cookie || {};
    bilingual(one("#cookie p"), cookie.text_ru, cookie.text_en);
    bilingual(one("#cookieOk"), cookie.button_ru, cookie.button_en);
  }

  function hydrateProducts(data) {
    var track = one(".collection-track");
    if (!track || !data || !Array.isArray(data.items) || !data.items.length) return;
    var collection = siteContent.collection || {};
    track.innerHTML = data.items.map(function (product) {
      var photo = safeAsset(product.photo, "");
      var href = safeUrl(product.buy_url, collection.default_buy_url || "#where", true);
      var titleEn = esc(product.title_en || product.title);
      var typeEn = esc(product.type_en || product.type);
      var alt = product.alt_ru || (product.title + " — " + product.type);
      return '<article class="product reveal"><div class="product-photo">' +
        '<img src="' + esc(photo) + '" loading="lazy" alt="' + esc(alt) + '" data-alt-ru="' + esc(alt) +
        '" data-alt-en="' + esc(product.alt_en || alt) + '" /></div>' +
        '<h3 data-en="' + esc(titleEn) + '">' + esc(product.title) + '</h3>' +
        '<p class="product-type" data-en="' + esc(typeEn) + '">' + esc(product.type) + '</p>' +
        '<a class="btn btn-outline" href="' + esc(href) + '" data-analytics="product-buy" data-product="' +
        esc(product.id) + '" data-en="' + esc(esc(collection.buy_en || "Buy")) + '">' + esc(collection.buy_ru || "Купить") + '</a></article>';
    }).join("");
  }

  function hydrateContacts(data) {
    if (!data) return;
    var blocks = all("#contacts .contact-block");
    bilingual(one(".contact-val", blocks[0]), data.company, data.company_en || data.company);
    bilingual(one(".contact-val", blocks[1]), data.address, data.address_en || data.address);
    var phone = one(".contact-val a", blocks[2]);
    if (phone && data.phone) { phone.textContent = String(data.phone); phone.href = safeUrl("tel:" + String(data.phone).replace(/[^+\d]/g, ""), phone.href, true); }
    var email = one(".contact-val a", blocks[3]);
    if (email && data.email) { email.textContent = String(data.email); email.href = safeUrl("mailto:" + data.email, email.href, true); }
    var socials = all(".contact-social a", blocks[4]);
    [[data.telegram, socials[0]], [data.vk, socials[1]], [data.ok, socials[2]]].forEach(function (pair) {
      if (pair[1] && pair[0]) pair[1].href = safeUrl(pair[0], pair[1].href, true);
    });

    var grid = one(".where-grid");
    if (!grid || !Array.isArray(data.distributors) || !data.distributors.length) return;
    grid.innerHTML = data.distributors.map(function (distributor) {
      var lines = "";
      if (distributor.phone) {
        var tel = safeUrl("tel:" + String(distributor.phone).replace(/[^+\d]/g, ""), "", true);
        lines += '<p class="dist-line"><a href="' + esc(tel) + '">' + esc(distributor.phone) + '</a></p>';
      }
      (distributor.emails || []).forEach(function (mail) {
        var href = safeUrl("mailto:" + mail, "", true);
        lines += '<p class="dist-line"><a href="' + esc(href) + '">' + esc(mail) + '</a></p>';
      });
      return '<article class="dist reveal"><h3>' + esc(distributor.name) + '</h3>' + lines + '</article>';
    }).join("");
  }

  function hydrateDocuments(data) {
    var list = one(".docs-grid");
    if (!list || !data || !Array.isArray(data.items) || !data.items.length) return;
    list.innerHTML = data.items.map(function (documentItem) {
      var fallback = "documents.html#" + encodeURIComponent(documentItem.anchor || documentItem.id || "");
      var href = safeUrl(documentItem.file, fallback, false);
      var external = documentItem.file ? ' target="_blank" rel="noopener"' : "";
      return '<li class="doc reveal"><a class="doc-link" href="' + esc(href) + '"' + external +
        ' data-analytics="doc-open" data-doc="' + esc(documentItem.id) + '"><span class="doc-mark" aria-hidden="true">✓</span>' +
        '<span class="doc-name" data-en="' + esc(esc(documentItem.name_en || documentItem.name)) + '">' + esc(documentItem.name) + '</span>' +
        '<span class="doc-desc" data-en="' + esc(esc(documentItem.desc_en || documentItem.desc)) + '">' + esc(documentItem.desc) + '</span>' +
        '</a></li>';
    }).join("");
  }

  var siteContent = {};
  var jobs = [
    ["content/site.json", hydrateSite],
    ["content/products.json", hydrateProducts],
    ["content/contacts.json", hydrateContacts],
    ["content/documents.json", hydrateDocuments]
  ];

  Promise.all(jobs.map(function (job) {
    return getJSON(job[0]).then(job[1]).catch(function () { /* HTML fallback */ });
  })).then(function () {
    document.dispatchEvent(new CustomEvent("novo:hydrated"));
  });
})();
