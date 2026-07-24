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
    document.dispatchEvent(new CustomEvent("novo:languagechange", { detail: { language: language } }));
  }

  if (!toggle) return;

  toggle.addEventListener("click", function () {
    setLanguage(html.getAttribute("lang") === "en" ? "ru" : "en");
  });

  var savedLanguage = "ru";
  try { savedLanguage = localStorage.getItem("novo-lang") || "ru"; } catch (error) {}
  setLanguage(savedLanguage === "en" ? "en" : "ru");
})();
