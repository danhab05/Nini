/*
 * Nini — moteur de scroll pour la version statique.
 * Le défilement joue le film : la progression GLOBALE du voyage pilote le
 * temps vidéo (les quatre tranches sont contiguës dans le même plan, donc
 * la lecture est continue et les raccords invisibles). Le temps est lissé
 * pour un scrub sans à-coups, et chaque chapitre expose sa progression en
 * variable CSS (--p) pour que le texte bouge avec le film.
 * prefers-reduced-motion : aucune vidéo chargée, posters seuls.
 */
(function () {
  "use strict";

  var story = document.querySelector(".scrub__story");
  var chapters = Array.prototype.slice.call(
    document.querySelectorAll(".scrub__chapter")
  );
  var layers = Array.prototype.slice.call(
    document.querySelectorAll(".scrub__layer")
  );
  var progressBar = document.querySelector(".scrub__progress span");
  var routeButtons = Array.prototype.slice.call(
    document.querySelectorAll(".scrub__route button")
  );

  if (!story || layers.length === 0 || chapters.length !== layers.length) {
    return;
  }

  routeButtons.forEach(function (button) {
    button.addEventListener("click", function () {
      var target = document.getElementById(button.dataset.target);
      if (target) {
        target.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
  });

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  if (reduceMotion.matches) {
    return; // Posters + texte : l'histoire complète, sans aucune vidéo.
  }

  var isMobile = window.matchMedia(
    "(hover: none) and (pointer: coarse), (max-width: 860px)"
  ).matches;

  if (isMobile) {
    layers.forEach(function (layer) {
      var img = layer.querySelector("img");
      if (img && img.dataset.mobileSrc) {
        img.src = img.dataset.mobileSrc;
      }
    });
  }

  var segments = layers.map(function (layer, index) {
    var video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.setAttribute("playsinline", "");
    video.setAttribute("muted", "");
    video.preload = "auto";
    video.src = isMobile ? layer.dataset.mobileClip : layer.dataset.clip;
    video.tabIndex = -1;
    layer.appendChild(video);

    var segment = {
      layer: layer,
      video: video,
      chapter: chapters[index],
      copy: chapters[index].querySelector(".scrub__copy"),
      duration: 0,
      target: 0,
      smooth: 0,
      painted: false,
    };

    video.addEventListener("loadedmetadata", function () {
      segment.duration = video.duration || 0;
    });
    video.addEventListener("seeked", function () {
      if (!segment.painted) {
        segment.painted = true;
        layer.classList.add("is-painted");
      }
    });
    return segment;
  });

  // Déblocage mobile : une lecture muette d'un instant autorise le scrubbing.
  var primed = false;
  function primeVideos() {
    if (primed) {
      return;
    }
    primed = true;
    segments.forEach(function (segment) {
      var playing = segment.video.play();
      if (playing && typeof playing.then === "function") {
        playing
          .then(function () {
            segment.video.pause();
          })
          .catch(function () {
            /* le poster reste affiché */
          });
      }
    });
    window.removeEventListener("touchstart", primeVideos);
    window.removeEventListener("pointerdown", primeVideos);
  }
  window.addEventListener("touchstart", primeVideos, { passive: true });
  window.addEventListener("pointerdown", primeVideos, { passive: true });

  var clamp = function (value) {
    return Math.min(1, Math.max(0, value));
  };

  var activeIndex = 0;
  segments[0].layer.classList.add("is-active");
  if (routeButtons[0]) {
    routeButtons[0].classList.add("is-active");
  }

  function setActive(index) {
    if (index === activeIndex) {
      return;
    }
    activeIndex = index;
    segments.forEach(function (segment, i) {
      segment.layer.classList.toggle("is-active", i === activeIndex);
      if (i === activeIndex) {
        // Repartir exactement du temps demandé, sans rattrapage visible.
        segment.smooth = segment.target * Math.max(segment.duration - 0.06, 0);
      }
    });
    routeButtons.forEach(function (button, i) {
      button.classList.toggle("is-active", i === activeIndex);
    });
  }

  function measure() {
    var viewport = window.innerHeight;
    var rect = story.getBoundingClientRect();
    var total = Math.max(rect.height - viewport, 1);
    var global = clamp(-rect.top / total);

    // Position dans le film : 0..4 en continu sur tout le voyage.
    var pos = Math.min(segments.length - 0.0001, global * segments.length);
    var index = Math.floor(pos);
    var local = pos - index;

    segments.forEach(function (segment, i) {
      segment.target = i === index ? local : i < index ? 1 : 0;

      var chapterRect = segment.chapter.getBoundingClientRect();
      var travel = Math.max(chapterRect.height, 1);
      var p = clamp((viewport - chapterRect.top) / (travel + viewport));
      segment.chapter.style.setProperty("--p", p.toFixed(4));

      // Fondu de sortie : le texte s'éteint avant la barre de navigation,
      // il appartient au film et n'entre jamais en collision avec le chrome.
      if (segment.copy) {
        var copyRect = segment.copy.getBoundingClientRect();
        segment.copy.style.opacity = clamp((copyRect.top - 56) / 130).toFixed(3);
      }
    });

    setActive(index);

    if (progressBar) {
      progressBar.style.transform = "scaleX(" + global + ")";
    }
  }

  function tick() {
    measure();
    var segment = segments[activeIndex];
    if (segment.duration > 0) {
      var desired = segment.target * Math.max(segment.duration - 0.06, 0);
      segment.smooth += (desired - segment.smooth) * 0.28;
      if (Math.abs(desired - segment.smooth) < 0.004) {
        segment.smooth = desired;
      }
      if (
        !segment.video.seeking &&
        Math.abs(segment.video.currentTime - segment.smooth) > 0.02
      ) {
        try {
          segment.video.currentTime = segment.smooth;
        } catch (error) {
          /* métadonnées pas encore prêtes */
        }
      }
    }
    window.requestAnimationFrame(tick);
  }

  window.requestAnimationFrame(tick);
})();
