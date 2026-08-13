/*
 * Nini — moteur de scroll minimaliste pour la version statique.
 * Le défilement joue le film : chaque chapitre possède sa tranche du plan
 * continu (tranches contiguës du même film, donc raccords invisibles).
 * Respecte prefers-reduced-motion : aucune vidéo chargée, posters seuls.
 */
(function () {
  "use strict";

  var stage = document.querySelector(".scrub__stage");
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

  if (!stage || layers.length === 0 || chapters.length !== layers.length) {
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
    video.preload = index === 0 ? "auto" : "metadata";
    video.src = isMobile ? layer.dataset.mobileClip : layer.dataset.clip;
    video.tabIndex = -1;
    layer.appendChild(video);

    var segment = {
      layer: layer,
      video: video,
      chapter: chapters[index],
      duration: 0,
      target: 0,
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
    video.addEventListener("canplay", function () {
      if (!segment.painted && video.currentTime > 0) {
        segment.painted = true;
        layer.classList.add("is-painted");
      }
    });
    return segment;
  });

  // Déblocage iOS : une lecture muette d'un instant autorise le scrubbing.
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

  var activeIndex = 0;
  segments[0].layer.classList.add("is-active");
  if (routeButtons[0]) {
    routeButtons[0].classList.add("is-active");
  }
  var clamp = function (value) {
    return Math.min(1, Math.max(0, value));
  };

  function update() {
    var viewport = window.innerHeight;
    var globalStart = null;
    var globalEnd = null;
    var nextActive = activeIndex;

    segments.forEach(function (segment, index) {
      var rect = segment.chapter.getBoundingClientRect();
      var travel = Math.max(rect.height - viewport, 1);
      var progress = clamp(-rect.top / travel);
      segment.target = progress;

      if (globalStart === null) {
        globalStart = rect.top + window.scrollY;
      }
      globalEnd = rect.bottom + window.scrollY;

      if (rect.top <= viewport * 0.5 && rect.bottom > viewport * 0.5) {
        nextActive = index;
      }
    });

    if (nextActive !== activeIndex) {
      activeIndex = nextActive;
      segments.forEach(function (segment, index) {
        segment.layer.classList.toggle("is-active", index === activeIndex);
      });
      routeButtons.forEach(function (button, index) {
        button.classList.toggle("is-active", index === activeIndex);
      });
    }

    var active = segments[activeIndex];
    if (active && active.duration > 0) {
      var time = active.target * Math.max(active.duration - 0.05, 0);
      if (Math.abs(active.video.currentTime - time) > 0.033) {
        try {
          active.video.currentTime = time;
        } catch (error) {
          /* métadonnées pas encore prêtes */
        }
      }
    }

    if (progressBar && globalStart !== null) {
      var span = Math.max(globalEnd - globalStart - viewport, 1);
      var scrolled = clamp((window.scrollY - globalStart) / span);
      progressBar.style.transform = "scaleX(" + scrolled + ")";
    }
  }

  var ticking = false;
  function requestUpdate() {
    if (!ticking) {
      ticking = true;
      window.requestAnimationFrame(function () {
        ticking = false;
        update();
      });
    }
  }

  window.addEventListener("scroll", requestUpdate, { passive: true });
  window.addEventListener("resize", requestUpdate);
  update();
})();
