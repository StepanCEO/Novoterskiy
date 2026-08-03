/* Двухуровневое меню: выпадающие списки на десктопе, бургер-панель с
   аккордеоном на узких экранах. Отдельный файл, потому что подключается и к
   главной с каталогом (main.js), и к внутренним страницам (internal.js). */
(function () {
  "use strict";

  var header = document.querySelector(".site-header");
  var nav = document.getElementById("siteNav");
  var burger = document.getElementById("navBurger");
  if (!header || !nav) return;

  var toggles = Array.prototype.slice.call(nav.querySelectorAll(".nav-toggle"));
  /* Порог должен совпадать с media-запросом в CSS: там панель включается
     на 1023px и ниже. Если разойдётся — на планшете откроются обе схемы. */
  var panelMode = window.matchMedia("(max-width: 1023px)");

  function setSubmenu(toggle, open) {
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
    var item = toggle.closest(".nav-item");
    if (item) item.classList.toggle("is-submenu-open", open);
  }

  function closeSubmenus(except) {
    toggles.forEach(function (toggle) {
      if (toggle !== except) setSubmenu(toggle, false);
    });
  }

  function setPanel(open) {
    if (!burger) return;
    header.classList.toggle("nav-open", open);
    burger.setAttribute("aria-expanded", open ? "true" : "false");
    if (!open) closeSubmenus(null);
  }

  function panelOpen() {
    return header.classList.contains("nav-open");
  }

  function toggleSubmenu(toggle) {
    var open = toggle.getAttribute("aria-expanded") === "true";
    if (panelMode.matches && !panelOpen()) setPanel(true);
    /* В панели раскрыт один раздел за раз — иначе список не помещается
       на экран и приходится скроллить внутри скролла. На десктопе тоже
       закрываем соседний: два открытых списка перехлёстываются. */
    closeSubmenus(toggle);
    setSubmenu(toggle, !open);
  }

  if (burger) {
    burger.addEventListener("click", function (event) {
      event.preventDefault();
      event.stopPropagation();
      setPanel(!panelOpen());
    });
  }

  toggles.forEach(function (toggle) {
    /* В мобильной панели состояние держим через явный класс на родителе.
       Так iOS sticky :hover не может показать/спрятать список наоборот. */
    toggle.addEventListener("click", function (event) {
      event.preventDefault();
      event.stopPropagation();
      toggleSubmenu(toggle);
    });
  });

  /* Клик по ссылке подменю: на десктопе список нужно закрыть руками —
     переход по якорю страницу не перезагружает, и меню осталось бы висеть. */
  nav.addEventListener("click", function (event) {
    if (!event.target.closest("a")) return;
    closeSubmenus(null);
    setPanel(false);
  });

  document.addEventListener("click", function (event) {
    if (nav.contains(event.target)) return;
    if (burger && burger.contains(event.target)) return;
    closeSubmenus(null);
    if (panelOpen()) setPanel(false);
  });

  document.addEventListener("keydown", function (event) {
    if (event.key !== "Escape") return;
    var openToggle = toggles.filter(function (toggle) {
      return toggle.getAttribute("aria-expanded") === "true";
    })[0];
    if (openToggle) {
      closeSubmenus(null);
      openToggle.focus();
      return;
    }
    if (panelOpen()) {
      setPanel(false);
      if (burger) burger.focus();
    }
  });

  /* Стрелки внутри открытого списка — требование клавиатурной доступности:
     до нижних пунктов иначе доходишь только длинной серией Tab. */
  nav.addEventListener("keydown", function (event) {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    var sub = event.target.closest(".nav-sub");
    var toggle = event.target.closest(".nav-toggle");
    if (toggle) {
      if (event.key !== "ArrowDown") return;
      event.preventDefault();
      toggle.setAttribute("aria-expanded", "true");
      var first = toggle.nextElementSibling && toggle.nextElementSibling.querySelector("a");
      if (first) first.focus();
      return;
    }
    if (!sub) return;
    var links = Array.prototype.slice.call(sub.querySelectorAll("a"));
    var index = links.indexOf(event.target);
    if (index === -1) return;
    event.preventDefault();
    var next = index + (event.key === "ArrowDown" ? 1 : -1);
    if (next < 0) {
      var owner = sub.previousElementSibling;
      if (owner) owner.focus();
      return;
    }
    if (links[next]) links[next].focus();
  });

  /* Смена схемы на лету (поворот планшета, ресайз окна): состояние из одной
     схемы в другой не переносится — сбрасываем всё в закрытое. */
  var onModeChange = function () {
    closeSubmenus(null);
    setPanel(false);
  };
  if (panelMode.addEventListener) panelMode.addEventListener("change", onModeChange);
  else if (panelMode.addListener) panelMode.addListener(onModeChange);
})();
