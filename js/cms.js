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

  /* Внутренние страницы (каталог, документы) используют тот же site.json,
     где ссылки на разделы главной записаны как «#origin». На подстранице
     такой якорь никуда не ведёт — дописываем index.html. */
  var onHome = /(^|\/)(index\.html)?$/i.test(location.pathname);

  function resolveHash(value) {
    if (onHome || typeof value !== "string") return value;
    return value.charAt(0) === "#" ? "index.html" + value : value;
  }

  function getJSON(url) {
    return fetch(url, { cache: "no-cache" }).then(function (response) {
      if (!response.ok) throw new Error(url + " " + response.status);
      return response.json();
    });
  }

  /* root === null означает «секции нет на этой странице»: без этого поиск
     провалился бы в document и переписал бы чужой узел с тем же классом. */
  function one(selector, root) {
    if (arguments.length > 1 && !root) return null;
    return (root || document).querySelector(selector);
  }

  function all(selector, root) {
    if (arguments.length > 1 && !root) return [];
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
    if (element && value != null) element.setAttribute("href", safeUrl(resolveHash(value), fallback || element.getAttribute("href"), true));
  }

  function setImage(element, value, fallback, altRu, altEn) {
    if (!element) return;
    if (value != null) {
      var previous = element.getAttribute("src");
      var src = safeAsset(value, fallback || previous);
      element.setAttribute("src", src);
      // Картинка может быть завёрнута в <picture> с AVIF-источником. Если
      // редактор поставил из CMS другой файл, у него нет пары .avif — а
      // <picture> при неудачной загрузке <source> НЕ откатывается на <img>,
      // а показывает битую картинку. Поэтому AVIF-источник просто снимаем:
      // новое фото грузится в своём формате, пусть и без экономии веса.
      if (src !== previous) {
        var picture = element.parentNode;
        if (picture && picture.tagName === "PICTURE") {
          var sources = picture.querySelectorAll('source[type="image/avif"]');
          for (var i = 0; i < sources.length; i++) {
            sources[i].parentNode.removeChild(sources[i]);
          }
        }
      }
    }
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
    /* Логотип теперь и в подвале — правим оба вхождения, иначе после смены
       картинки в админке шапка и подвал разъехались бы. */
    all(".brand-mark").forEach(function (node) { setImage(node, brand.logo); });

    /* Меню двухуровневое, поэтому идём по верхним пунктам, а не по всем
       ссылкам подряд: у пункта с подменю подписью служит .nav-label внутри
       кнопки, а сами ссылки лежат в соседнем списке. Порядок в site.json
       должен совпадать с порядком в разметке — это же правило действовало и
       для плоского меню. */
    var header = data.header || {};
    var navItems = header.nav || [];
    all("#siteNav > .nav-item, #siteNav > .nav-link").forEach(function (node, index) {
      var item = navItems[index];
      if (!item) return;
      var isGroup = node.classList.contains("nav-item");
      /* Подпись всегда во вложенном .nav-label: рядом с ней лежит иконка, и
         запись текста в сам пункт стёрла бы её. */
      var label = one(".nav-label", node) || node;
      bilingual(label, item.label_ru, item.label_en);
      if (!isGroup) {
        setLink(node, item.url);
        return;
      }
      all(".nav-sub a", node).forEach(function (link, subIndex) {
        var sub = (item.children || [])[subIndex];
        if (!sub) return;
        bilingual(link, sub.label_ru, sub.label_en);
        setLink(link, sub.url);
      });
    });

    /* «Где купить» вынесена из меню в кнопку справа, поэтому и в site.json
       она лежит отдельным полем — иначе сдвинулись бы номера пунктов.
       Экземпляров в разметке два (в плашке и в панели меню), но виден всегда
       один — правим оба, чтобы после переименования в админке они не
       разошлись. */
    var cta = header.cta;
    if (cta) {
      all(".header-cta").forEach(function (ctaLink) {
        bilingual(ctaLink, cta.label_ru, cta.label_en);
        setLink(ctaLink, cta.url);
      });
    }

    var hero = data.hero || {};
    var heroTitle = one("#hero-title");
    /* Заголовок — связка из трёх строк: имя и под ним две строки слогана.
       Имя необязательно: если в JSON его нет, остаются те же две строки,
       что и раньше, и вёрстка не рассыпается. */
    if (heroTitle && hero.title_line_1_ru != null && hero.title_line_2_ru != null) {
      var brandRu = hero.brand_ru == null ? "" : String(hero.brand_ru).trim();
      var brandEn = hero.brand_en == null ? brandRu : String(hero.brand_en).trim();
      var apex = function (value) {
        return value ? '<span class="hero-brand">' + esc(value) + "</span> " : "";
      };
      heroTitle.innerHTML = apex(brandRu) +
        '<span class="hero-line">' + esc(hero.title_line_1_ru) + '</span> ' +
        '<span class="hero-line">' + esc(hero.title_line_2_ru) + '</span>';
      heroTitle.setAttribute("data-en", apex(brandEn) +
        '<span class="hero-line">' + esc(hero.title_line_1_en || "") + '</span> ' +
        '<span class="hero-line">' + esc(hero.title_line_2_en || "") + '</span>');
    }
    bilingual(one(".hero-sub"), hero.text_ru, hero.text_en);
    var heroCtas = all(".hero-cta a");
    bilingual(heroCtas[0], hero.primary_cta_ru, hero.primary_cta_en);
    setLink(heroCtas[0], hero.primary_cta_url);
    bilingual(one(".btn-play-label", heroCtas[1]), hero.secondary_cta_ru, hero.secondary_cta_en);
    setLink(heroCtas[1], hero.secondary_cta_url);
    setImage(one(".hero-bg img"), hero.background);
    /* Ролик один: горы и бутылка на камне сведены в кадр заранее. Адреса
       пишем в data-*: сами <source> собирает main.js после window.load
       (см. пояснение там). */
    var setVideo = function (id, poster, webm, mp4) {
      var v = document.getElementById(id);
      if (!v) return;
      if (poster) v.setAttribute("poster", poster);
      if (webm)   v.setAttribute("data-webm", webm);
      if (mp4)    v.setAttribute("data-mp4",  mp4);
    };
    setVideo("heroVideo", hero.video_poster, hero.video_webm, hero.video_mp4);

    var elements = data.elements || {};
    var elementsRoot = one("#elements");
    sectionHead(elementsRoot, elements);
    all(".el", elementsRoot).forEach(function (card, index) {
      var item = (elements.items || [])[index];
      if (!item) return;
      bilingual(one("h3", card), item.title_ru, item.title_en);
      bilingual(one(".el-slogan", card), item.slogan_ru, item.slogan_en);
      /* :not(.el-slogan) обязательно: слоган в разметке стоит первым абзацем,
         и простой «.el-cap p» подставлял бы пояснение вместо него. */
      bilingual(one(".el-cap p:not(.el-slogan)", card), item.text_ru, item.text_en);
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
    /* Заголовок «Источника» тоже набран треугольником: три строки, каждая
       следующая длиннее. Если в JSON строк нет — остаётся обычный заголовок
       одной строкой, как было раньше. */
    var originTitle = one(".origin-title", originRoot);
    if (originTitle && origin.title_line_1_ru != null) {
      var originLines = function (suffix) {
        return [1, 2, 3].map(function (n) {
          var value = origin["title_line_" + n + "_" + suffix];
          return '<span class="origin-line">' + esc(value == null ? "" : value) + "</span>";
        }).join(" ");
      };
      originTitle.innerHTML = originLines("ru");
      originTitle.setAttribute("data-en", originLines("en"));
    } else {
      bilingual(originTitle, origin.title_ru, origin.title_en);
    }
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
    /* Ссылка на документы живёт в блоке .trust-docs. Без этого уточнения селектор
       забирал первую .trust-link во всей секции — а это ссылка «О лаборатории» в
       карточке 03, и CMS молча переписывала её на documents.html. */
    var docsCta = one(".trust-docs .trust-link", trustRoot);
    bilingual(docsCta, trust.documents_cta_ru, trust.documents_cta_en);
    setLink(docsCta, trust.documents_cta_url);

    var collection = data.collection || {};
    var collectionRoot = one("#collection");
    sectionHead(collectionRoot, collection);
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
    /* Слоган набран треугольником — двумя строками, как на первом экране, — и
       строки должны остаться строками. bilingual() пишет textContent и снёс бы
       разметку, поэтому здесь свой разбор; text_ru/text_en остаются запасным
       вариантом на случай, если раздельных строк в JSON нет. */
    var footerSlogan = one(".footer-brand p");
    if (footerSlogan && footer.line_1_ru != null && footer.line_2_ru != null) {
      var footerLines = function (first, second) {
        return '<span class="footer-line">' + esc(first || "") + "</span> " +
               '<span class="footer-line">' + esc(second || "") + "</span>";
      };
      footerSlogan.innerHTML = footerLines(footer.line_1_ru, footer.line_2_ru);
      footerSlogan.setAttribute("data-en", footerLines(footer.line_1_en, footer.line_2_en));
    } else {
      bilingual(footerSlogan, footer.text_ru, footer.text_en);
    }
    all(".footer-nav a").forEach(function (node, index) {
      var item = (footer.nav || [])[index];
      if (!item) return;
      bilingual(node, item.label_ru, item.label_en);
      setLink(node, item.url);
    });
    /* Политика лежит первой ссылкой в .footer-legal-docs — рядом с СОУТ и
       охраной труда; копирайт — соседний span. Без :not() под копирайт попал бы
       сам блок документов и три ссылки заменились бы строкой «© АО…». */
    var privacyLink = one(".footer-legal a");
    bilingual(privacyLink, footer.privacy_ru, footer.privacy_en);
    setLink(privacyLink, footer.privacy_url);
    bilingual(one(".footer-legal > span:not(.footer-legal-docs)"), footer.copyright_ru, footer.copyright_en);

    var cookie = data.cookie || {};
    bilingual(one("#cookie p"), cookie.text_ru, cookie.text_en);
    bilingual(one("#cookieOk"), cookie.button_ru, cookie.button_en);
  }

  /* Уровень заголовка карточки — на одну ступень ниже заголовка секции.
     На catalog.html «Каталог» это h1, значит товары h2; если секция когда-нибудь
     вернётся на главную внутрь h2 — товары станут h3. Уровень читаем из
     .section-head, чтобы не считать заголовки самих карточек. */
  function productHeading() {
    var head = one(".collection .section-head h1, .collection .section-head h2, .collection .section-head h3");
    var level = head ? Number(head.tagName.charAt(1)) : 2;
    return "h" + Math.min(level + 1, 6);
  }

  /* В названии товара объём набран отдельно — «Целебная <em>0.5</em>». В JSON
     он лежит одной строкой, поэтому последнее слово-число оборачиваем сами:
     иначе после перерисовки из CMS карточка теряет акцент на литраже. */
  function productTitle(title) {
    var m = String(title).match(/^(.*\S)\s+([\d.,]+)$/);
    if (!m) return esc(title);
    return esc(m[1]) + " <em>" + esc(m[2]) + "</em>";
  }

  /* У товара несколько снимков: бутылка, две бутылки, упаковка, контрэтикетка.
     Первый лежит в photo/photo_width/photo_height (так было до галереи и так
     его редактирует CMS), остальные — в gallery[]. Приводим к одному виду. */
  function productShots(product) {
    var alt = product.alt_ru || (product.title + " — " + product.type);
    var shots = [{
      photo: product.photo,
      width: product.photo_width,
      height: product.photo_height,
      alt_ru: alt,
      alt_en: product.alt_en || alt,
      caption_ru: product.photo_caption_ru,
      caption_en: product.photo_caption_en
    }];
    (Array.isArray(product.gallery) ? product.gallery : []).forEach(function (shot) {
      if (!shot || !shot.photo) return;
      var shotAlt = shot.alt_ru || alt;
      shots.push({
        photo: shot.photo,
        width: shot.photo_width,
        height: shot.photo_height,
        alt_ru: shotAlt,
        alt_en: shot.alt_en || shotAlt,
        caption_ru: shot.caption_ru,
        caption_en: shot.caption_en
      });
    });
    return shots;
  }

  function shotMarkup(shot, index) {
    var photo = safeAsset(shot.photo, "");
    // AVIF-источник ставим «на пробу»: у файла из репозитория пара .avif есть,
    // у только что загруженного через CMS — нет. Если источник не откроется,
    // его снимет обработчик ошибки ниже, и картинка догрузится в своём формате.
    var avif = photo.replace(/\.(webp|jpe?g|png)$/i, ".avif");
    var source = avif !== photo ? '<source srcset="' + esc(avif) + '" type="image/avif" />' : "";
    // width/height обязательны, даже когда высоту задаёт CSS: без них браузер
    // не знает пропорций до загрузки и верстка дёргается (CLS), а Lighthouse
    // ругается на unsized-images. Если в CMS размеры не указали, берём формат
    // бутылки — 225×763.
    var w = parseInt(shot.width, 10) || 225;
    var h = parseInt(shot.height, 10) || 763;
    return '<picture class="pshot' + (index === 0 ? " is-on" : "") + '">' + source +
      '<img src="' + esc(photo) + '" width="' + w + '" height="' + h +
      '" loading="lazy" alt="' + esc(shot.alt_ru) + '" data-alt-ru="' + esc(shot.alt_ru) +
      '" data-alt-en="' + esc(shot.alt_en) + '" /></picture>';
  }

  /* Стрелки по краям фото. Лежат внутри .product-photo, чтобы попадать на
     сам снимок, а не на подпись. Название кнопки — sr-only-строкой, как у
     точек: так оно и озвучивается, и переводится через data-en. */
  function navMarkup(shots) {
    if (shots.length < 2) return "";
    var chevron = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
      '<path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2" ' +
      'stroke-linecap="round" stroke-linejoin="round" /></svg>';
    function arrow(dir, ru, en) {
      return '<button class="pnav pnav-' + dir + '" type="button">' + chevron +
        '<span class="sr-only" data-en="' + esc(esc(en)) + '">' + esc(ru) + '</span></button>';
    }
    return arrow("prev", "Предыдущее фото", "Previous photo") +
      arrow("next", "Следующее фото", "Next photo");
  }

  /* Точки под фото. Подпись лежит внутри кнопки как sr-only: она и даёт
     кнопке доступное имя, и переводится тем же механизмом data-en. */
  function dotsMarkup(shots) {
    if (shots.length < 2) return "";
    return '<div class="product-dots">' + shots.map(function (shot, index) {
      var ru = shot.caption_ru || ("Фото " + (index + 1));
      var en = shot.caption_en || ("Photo " + (index + 1));
      return '<button class="pdot' + (index === 0 ? " is-on" : "") + '" type="button" aria-pressed="' +
        (index === 0 ? "true" : "false") + '"><span class="sr-only" data-en="' + esc(esc(en)) + '">' +
        esc(ru) + '</span></button>';
    }).join("") + '</div>';
  }

  function hydrateProducts(data) {
    var track = one(".collection-track");
    if (!track || !data || !Array.isArray(data.items) || !data.items.length) return;
    var collection = siteContent.collection || {};
    track.innerHTML = data.items.map(function (product) {
      var href = safeUrl(resolveHash(product.buy_url), resolveHash(collection.default_buy_url) || "buy.html", true);
      var titleEn = productTitle(product.title_en || product.title);
      var typeEn = esc(product.type_en || product.type);
      var shots = productShots(product);
      // На каталоге заголовок страницы — h1, поэтому карточки идут h2:
      // h3 после h1 даёт разрыв в уровнях (heading-order). На главной этот
      // список живёт внутри секции со своим h2, и там уровень задаёт headingLevel.
      var hx = productHeading();
      // Доля высоты бокса под товар: 0,33 л не должна вставать вровень с
      // пятилитровой канистрой. Значение живёт в products.json, CSS читает
      // его как --pscale; при отсутствии или мусоре остаётся прежняя единица.
      var scale = parseFloat(product.scale);
      var style = scale > 0 && scale <= 1 && scale !== 1 ? ' style="--pscale:' + scale + '"' : "";
      return '<article class="product reveal"' + style + '><div class="product-photo">' +
        shots.map(shotMarkup).join("") + navMarkup(shots) + '</div>' + dotsMarkup(shots) +
        '<' + hx + ' data-en="' + esc(titleEn) + '">' + productTitle(product.title) + '</' + hx + '>' +
        '<p class="product-type" data-en="' + esc(typeEn) + '">' + esc(product.type) + '</p>' +
        '<a class="btn btn-outline" href="' + esc(href) + '" data-analytics="product-buy" data-product="' +
        esc(product.id) + '" data-en="' + esc(esc(collection.buy_en || "Buy")) + '">' + esc(collection.buy_ru || "Купить") + '</a></article>';
    }).join("");

    // Страховка для фото, загруженных через CMS: у них нет пары .avif, а
    // <picture> при неудачной загрузке <source> не откатывается на <img>, а
    // показывает битую картинку. Снимаем источник и перезапускаем загрузку.
    all(".product-photo img", track).forEach(function (image) {
      image.addEventListener("error", function onError() {
        image.removeEventListener("error", onError);
        var picture = image.parentNode;
        if (!picture || picture.tagName !== "PICTURE") return;
        var sources = picture.querySelectorAll('source[type="image/avif"]');
        if (!sources.length) return;
        for (var i = 0; i < sources.length; i++) sources[i].parentNode.removeChild(sources[i]);
        image.src = image.getAttribute("src");
      });
    });
  }

  function hydrateContacts(data) {
    if (!data) return;
    /* Поиск по data-contact, а не по индексу блока: карточки контактов можно
       переставлять и дополнять, не трогая этот код. */
    var section = one("#contacts");
    function field(name) { return one('[data-contact="' + name + '"]', section); }
    bilingual(field("company"), data.company, data.company_en || data.company);
    bilingual(field("director"), data.director, data.director_en || data.director);
    bilingual(field("address"), data.address, data.address_en || data.address);
    var inn = field("inn");
    if (inn && data.inn) inn.textContent = String(data.inn);
    var phone = field("phone");
    if (phone && data.phone) { phone.textContent = String(data.phone); phone.href = safeUrl("tel:" + String(data.phone).replace(/[^+\d]/g, ""), phone.href, true); }
    var email = field("email");
    if (email && data.email) { email.textContent = String(data.email); email.href = safeUrl("mailto:" + data.email, email.href, true); }
    var socials = all("a", field("social"));
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
      // Подпись рисуем, только если она есть. У документов по охране труда её нет —
      // пустой span всё равно занимал строку и оставлял под названием дырку.
      var desc = documentItem.desc
        ? '<span class="doc-desc" data-en="' + esc(esc(documentItem.desc_en || documentItem.desc)) + '">' + esc(documentItem.desc) + '</span>'
        : "";
      return '<li class="doc reveal"><a class="doc-link" href="' + esc(href) + '"' + external +
        ' data-analytics="doc-open" data-doc="' + esc(documentItem.id) + '"><span class="doc-mark" aria-hidden="true">✓</span>' +
        '<span class="doc-name" data-en="' + esc(esc(documentItem.name_en || documentItem.name)) + '">' + esc(documentItem.name) + '</span>' +
        desc + '</a></li>';
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
