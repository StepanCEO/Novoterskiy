/* Shared language switcher for internal pages. */
(function () {
  "use strict";

  var html = document.documentElement;
  var toggle = document.getElementById("langToggle");
  var russianHtml = new WeakMap();
  var russianAttributes = new WeakMap();

  function rememberAttribute(element, name) {
    var stored = russianAttributes.get(element);
    if (!stored) {
      stored = {};
      russianAttributes.set(element, stored);
    }
    if (!(name in stored)) stored[name] = element.getAttribute(name) || "";
    return stored[name];
  }

  function setTranslatedAttribute(selector, attribute, dataAttribute, toEnglish) {
    document.querySelectorAll(selector).forEach(function (element) {
      var russian = rememberAttribute(element, attribute);
      element.setAttribute(attribute, toEnglish ? element.getAttribute(dataAttribute) : russian);
    });
  }

  function setLanguage(language) {
    var toEnglish = language === "en";

    document.querySelectorAll("[data-en]").forEach(function (element) {
      if (!russianHtml.has(element)) russianHtml.set(element, element.innerHTML);
      element.innerHTML = toEnglish ? element.getAttribute("data-en") : russianHtml.get(element);
    });

    setTranslatedAttribute("[data-en-content]", "content", "data-en-content", toEnglish);
    setTranslatedAttribute("[data-en-aria-label]", "aria-label", "data-en-aria-label", toEnglish);
    setTranslatedAttribute("[data-en-alt]", "alt", "data-en-alt", toEnglish);

    html.setAttribute("lang", language);
    if (toggle) {
      toggle.querySelectorAll(".lang-opt").forEach(function (option) {
        var active = option.getAttribute("data-lang") === language;
        option.classList.toggle("is-active", active);
        option.setAttribute("aria-hidden", active ? "false" : "true");
      });
      toggle.setAttribute("aria-label", toEnglish ? "Switch language to Russian" : "Сменить язык на английский");
    }

    try { localStorage.setItem("novo-lang", language); } catch (error) {}
    // Адрес отражает язык (?lang=en) — так работает hreflang и ссылкой на
    // английскую версию можно поделиться. Через History API, без перезагрузки.
    try {
      var url = new URL(window.location.href);
      if (toEnglish) url.searchParams.set("lang", "en");
      else url.searchParams.delete("lang");
      window.history.replaceState(null, "", url.pathname + url.search + url.hash);
      // canonical должен указывать на текущую языковую версию, иначе поисковик
      // сочтёт английскую страницу дублем русской и выкинет её из индекса.
      var canonical = document.getElementById("canonicalLink");
      if (canonical) {
        var base = canonical.getAttribute("href").split("?")[0];
        canonical.setAttribute("href", toEnglish ? base + "?lang=en" : base);
      }
    } catch (error) {}
    document.dispatchEvent(new CustomEvent("novo:languagechange", { detail: { language: language } }));
  }

  if (!toggle) return;

  toggle.addEventListener("click", function () {
    setLanguage(html.getAttribute("lang") === "en" ? "ru" : "en");
  });

  // Язык из адреса важнее сохранённого: по ссылке должна открыться
  // именно та версия, на которую сослались.
  var languageFromUrl = null;
  try { languageFromUrl = new URL(window.location.href).searchParams.get("lang"); } catch (error) {}
  var savedLanguage = "ru";
  try { savedLanguage = localStorage.getItem("novo-lang") || "ru"; } catch (error) {}
  var initial = languageFromUrl !== null ? languageFromUrl : savedLanguage;
  setLanguage(initial === "en" ? "en" : "ru");
})();
