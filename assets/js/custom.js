/* Custom enhancements: reading progress, back-to-top, code copy buttons,
   scroll reveal, hero typewriter. All progressive — the site works without JS. */
(function () {
  "use strict";

  var prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var isEN = /^\/en(\/|$)/.test(window.location.pathname);

  function ready(fn) {
    if (document.readyState !== "loading") fn();
    else document.addEventListener("DOMContentLoaded", fn);
  }

  ready(function () {
    /* let CSS hide the duplicated layout <h1> when a hero is present */
    if (document.querySelector(".hero")) {
      document.body.classList.add("has-hero");
    }

    /* ----- reading progress + back to top ----- */
    var progress = document.createElement("div");
    progress.className = "reading-progress";
    progress.innerHTML = "<span></span>";
    document.body.appendChild(progress);
    var fill = progress.firstChild;

    var toTop = document.createElement("button");
    toTop.type = "button";
    toTop.className = "to-top";
    toTop.setAttribute("aria-label", isEN ? "Back to top" : "回到顶部");
    toTop.textContent = "↑";
    document.body.appendChild(toTop);
    toTop.addEventListener("click", function () {
      window.scrollTo({ top: 0, behavior: prefersReduced ? "auto" : "smooth" });
    });

    var ticking = false;
    function onScroll() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(function () {
        var doc = document.documentElement;
        var max = doc.scrollHeight - doc.clientHeight;
        fill.style.width = (max > 0 ? Math.min(100, (doc.scrollTop / max) * 100) : 0) + "%";
        toTop.classList.toggle("show", doc.scrollTop > 600);
        ticking = false;
      });
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    onScroll();

    /* ----- code copy buttons ----- */
    var copyIcon =
      '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
      'stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<rect x="9" y="9" width="12" height="12" rx="2.5"></rect>' +
      '<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>';

    document
      .querySelectorAll("div.highlighter-rouge, figure.highlight")
      .forEach(function (block) {
        if (block.querySelector(".code-copy")) return;
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "code-copy";
        btn.setAttribute("aria-label", isEN ? "Copy code" : "复制代码");
        btn.innerHTML = copyIcon + "<span>" + (isEN ? "copy" : "复制") + "</span>";

        btn.addEventListener("click", function () {
          var pre = block.querySelector("pre");
          var text = (pre || block).innerText;

          function done() {
            btn.classList.add("copied");
            btn.querySelector("span").textContent = isEN ? "copied" : "已复制";
            setTimeout(function () {
              btn.classList.remove("copied");
              btn.querySelector("span").textContent = isEN ? "copy" : "复制";
            }, 1600);
          }

          function fallback() {
            var ta = document.createElement("textarea");
            ta.value = text;
            ta.style.position = "fixed";
            ta.style.opacity = "0";
            document.body.appendChild(ta);
            ta.select();
            try {
              document.execCommand("copy");
              done();
            } catch (e) { /* clipboard unavailable */ }
            document.body.removeChild(ta);
          }

          if (navigator.clipboard && window.isSecureContext) {
            navigator.clipboard.writeText(text).then(done, fallback);
          } else {
            fallback();
          }
        });

        block.appendChild(btn);
      });

    /* ----- scroll reveal ----- */
    if (!prefersReduced && "IntersectionObserver" in window) {
      var io = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (entry) {
            if (entry.isIntersecting) {
              entry.target.classList.add("in");
              io.unobserve(entry.target);
            }
          });
        },
        { rootMargin: "0px 0px -8% 0px", threshold: 0.05 }
      );
      document
        .querySelectorAll(".archive__item, .work-time-card")
        .forEach(function (el) {
          el.classList.add("reveal");
          io.observe(el);
        });
    }

    /* ----- hero typewriter ----- */
    var typer = document.getElementById("hero-typer");
    if (typer && !prefersReduced) {
      var words = [];
      try {
        words = JSON.parse(typer.getAttribute("data-words") || "[]");
      } catch (e) { /* keep the server-rendered word */ }
      if (words.length > 1) {
        var wi = 0;
        var ci = words[0].length;
        var deleting = true;
        var tick = function () {
          var word = words[wi];
          var delay;
          if (deleting) {
            ci -= 1;
            delay = 42;
            if (ci <= 0) {
              deleting = false;
              wi = (wi + 1) % words.length;
              delay = 350;
            }
          } else {
            ci += 1;
            delay = 85;
            if (ci >= words[wi].length) {
              ci = words[wi].length;
              deleting = true;
              delay = 2400;
            }
          }
          typer.textContent = words[wi].slice(0, ci);
          setTimeout(tick, delay);
        };
        setTimeout(tick, 2400);
      }
    }
  });
})();
