/* Novoterskaya — interactions */
(function () {
  "use strict";

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---- Hero load sequence ---- */
  var hero = document.getElementById("hero");
  if (hero) {
    requestAnimationFrame(function () { hero.classList.add("loaded"); });
  }

  /* ---- Scroll reveals ---- */
  var revealEls = document.querySelectorAll(".reveal:not(.hero .reveal)");
  if ("IntersectionObserver" in window && !reduceMotion) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) {
          e.target.classList.add("in");
          io.unobserve(e.target);
        }
      });
    }, { threshold: 0.14, rootMargin: "0px 0px -8% 0px" });
    revealEls.forEach(function (el) {
      // hero children are driven by CSS keyframes, skip them
      if (!el.closest(".hero")) io.observe(el);
    });
  } else {
    revealEls.forEach(function (el) { el.classList.add("in"); });
  }

  /* ---- Header scrolled state + water-thread progress ---- */
  var header = document.querySelector(".site-header");
  var threadPath = document.querySelector(".thread-path");
  var THREAD_LEN = 1400;

  function onScroll() {
    var y = window.scrollY || window.pageYOffset;
    if (header) header.classList.toggle("scrolled", y > 24);
    if (threadPath) {
      var docH = document.documentElement.scrollHeight - window.innerHeight;
      var p = docH > 0 ? Math.min(1, y / docH) : 0;
      threadPath.style.setProperty("--thread-offset", (THREAD_LEN * (1 - p)).toFixed(1));
    }
  }
  var ticking = false;
  window.addEventListener("scroll", function () {
    if (!ticking) {
      window.requestAnimationFrame(function () { onScroll(); ticking = false; });
      ticking = true;
    }
  }, { passive: true });
  onScroll();

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
    htmlEl.setAttribute("lang", toEn ? "en" : "ru");
    if (langToggle) {
      langToggle.querySelectorAll(".lang-opt").forEach(function (o) {
        o.classList.toggle("is-active", o.getAttribute("data-lang") === lang);
      });
    }
    try { localStorage.setItem("novo-lang", lang); } catch (e) {}
  }

  if (langToggle) {
    langToggle.addEventListener("click", function () {
      var next = htmlEl.getAttribute("lang") === "en" ? "ru" : "en";
      setLang(next);
    });
    var saved;
    try { saved = localStorage.getItem("novo-lang"); } catch (e) {}
    if (saved === "en") setLang("en");
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
})();
