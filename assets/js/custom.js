/* Custom enhancements: reading progress, back-to-top, code copy buttons,
   scroll reveal, hero typewriter, right-hand outline. All progressive — the site works without JS. */
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

    /* ----- compact outline from existing section headings ----- */
    var updateOutline = function () {};
    var main = document.getElementById("main");
    var content = document.querySelector(".page__content, #main > .archive");
    if (main && content) {
      // Direct children only: skip hero titles, project cards and embedded widgets.
      var headings = Array.prototype.filter.call(content.children, function (el) {
        return /^H[1-3]$/.test(el.tagName) && !el.classList.contains("page__title") && el.textContent.trim();
      });
      var level = headings.reduce(function (min, el) {
        return Math.min(min, Number(el.tagName.slice(1)));
      }, 3);
      var sections = headings.filter(function (el) {
        return Number(el.tagName.slice(1)) === level;
      });
      // Imported posts may repeat the page title as a single H1 above their H2 sections.
      if (sections.length < 2) {
        var subsections = headings.filter(function (el) {
          return Number(el.tagName.slice(1)) === level + 1;
        });
        sections = subsections.length > 1 ? subsections : headings;
      }

      // Short pages need no extra navigation; keep their profile unchanged.
      if (sections.length > 1) {
        var outline = document.createElement("nav");
        outline.className = "page-outline";
        outline.setAttribute("aria-label", "On this page");
        var label = document.createElement("p");
        label.className = "page-outline__label";
        label.textContent = "On this page";
        var list = document.createElement("ul");
        list.className = "page-outline__list";
        outline.appendChild(label);
        outline.appendChild(list);

        var links = sections.map(function (heading, index) {
          if (!heading.id) {
            var id = "page-section-" + (index + 1);
            while (document.getElementById(id)) id += "-section";
            heading.id = id;
          }
          var item = document.createElement("li");
          var link = document.createElement("a");
          link.className = "page-outline__link";
          link.href = "#" + encodeURIComponent(heading.id);
          link.textContent = heading.textContent.trim();
          link.addEventListener("click", function (event) {
            if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
            event.preventDefault();
            // Avoid the theme's legacy smooth-scroll handler running a second animation.
            event.stopImmediatePropagation();
            if (window.location.hash !== link.hash) history.pushState(null, "", link.hash);
            if (!heading.hasAttribute("tabindex")) heading.setAttribute("tabindex", "-1");
            heading.focus({ preventScroll: true });
            heading.scrollIntoView({ behavior: prefersReduced ? "auto" : "smooth", block: "start" });
          });
          item.appendChild(link);
          list.appendChild(item);
          return link;
        });
        var outlineRail = document.createElement("div");
        outlineRail.className = "page-outline-rail";
        outlineRail.appendChild(outline);
        main.appendChild(outlineRail);
        main.classList.add("has-page-outline");

        var activeIndex = -1;
        updateOutline = function () {
          if (!window.matchMedia("(min-width: 1280px)").matches) return;
          var nextIndex = -1;
          sections.forEach(function (heading, index) {
            if (heading.getBoundingClientRect().top <= 120) nextIndex = index;
          });
          var doc = document.documentElement;
          if (doc.scrollHeight > doc.clientHeight && doc.scrollTop + doc.clientHeight >= doc.scrollHeight - 4) {
            nextIndex = sections.length - 1;
          }
          if (nextIndex === activeIndex) return;
          if (activeIndex >= 0) links[activeIndex].removeAttribute("aria-current");
          activeIndex = nextIndex;
          if (activeIndex >= 0) {
            var activeLink = links[activeIndex];
            activeLink.setAttribute("aria-current", "location");
            // Scroll only the rail when a long outline puts the current link out of view.
            var rail = outline.getBoundingClientRect();
            var rect = activeLink.getBoundingClientRect();
            if (rect.bottom > rail.bottom) outline.scrollTop += rect.bottom - rail.bottom + 8;
            else if (rect.top < rail.top) outline.scrollTop -= rail.top - rect.top + 8;
          } else {
            outline.scrollTop = 0;
          }
        };
      }
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
        updateOutline();
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
