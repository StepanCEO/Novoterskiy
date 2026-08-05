/* Первый экран «Легенды бренда»: кадр оживает один раз и замирает.

   Ролик намеренно не зациклен. Облака проходят, туман наползает в долину,
   закатный свет доходит до вершины — и картинка остаётся стоять на последнем
   кадре. Бесконечное движение под текстом легенды мешало бы его читать.

   Под видео лежит <picture> с первым кадром ролика: оно рисуется первым (это
   LCP страницы) и остаётся единственным, если ролик не догрузился, скрипт не
   отработал или человек попросил систему не анимировать. Ровно то, чего требует
   ТЗ: первый экран не зависит целиком от тяжёлого видео.

   Источники подставляются скриптом после window.load. Прописанные в разметке
   <source> Safari считает частью загрузки страницы и держит событие load до
   конца скачивания ролика — с мегабайтом видео это заметная задержка. */
(function () {
  "use strict";

  var video = document.getElementById("legendVideo");
  if (!video) return;

  var reduced = false;
  try {
    reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch (error) {}
  if (reduced) return;

  function addSource(src, type) {
    var source = document.createElement("source");
    source.setAttribute("src", src);
    source.setAttribute("type", type);
    video.appendChild(source);
  }

  /* Кадр под видео и первый кадр ролика — одно и то же изображение, так что
     проявляем видео сразу, как только оно готово рисовать. Единственная
     оговорка: фотография въезжает своей анимацией (bgIn, 1.6 s с лёгким
     масштабом), и если ролик успеет из кеша раньше, чем она доедет, разница в
     масштабе даст рывок. Поэтому не раньше, чем фотография встанет на место. */
  var PHOTO_SETTLED = 1800;

  video.addEventListener("loadeddata", function () {
    var wait = 0;
    try { wait = Math.max(0, PHOTO_SETTLED - performance.now()); } catch (error) {}
    setTimeout(function () { video.classList.add("is-on"); }, wait);
  });

  function start() {
    // muted обязателен: без него браузер не даст запустить ролик без клика.
    video.muted = true;
    addSource(video.getAttribute("data-webm"), "video/webm");
    addSource(video.getAttribute("data-mp4"), "video/mp4");
    video.load();
    var started = video.play();
    // Автозапуск могут запретить (режим энергосбережения на iOS). Тогда на
    // экране останется первый кадр — то же самое, что и фотография под ним.
    if (started && started.catch) started.catch(function () {});
  }

  if (document.readyState === "complete") start();
  else window.addEventListener("load", start);
})();
