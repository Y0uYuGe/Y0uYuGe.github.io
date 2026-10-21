/* Keep the built-in counts visible when GitHub or browser storage is unavailable. */
(function () {
  "use strict";

  var hour = 60 * 60 * 1000;
  var retryDelay = 15 * 60 * 1000;
  var repositories = new Map();
  var now = Date.now();

  function validCount(value) {
    return Number.isSafeInteger(value) && value >= 0;
  }

  function readCache(key) {
    try {
      var cached = JSON.parse(window.localStorage.getItem(key));
      return cached && typeof cached === "object" ? cached : {};
    } catch (_) {
      return {};
    }
  }

  function saveCache(key, value) {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch (_) { /* The static count and current request still work without storage. */ }
  }

  function display(links, repository, count, checkedAt) {
    var formatted = count.toLocaleString("en-US");
    links.forEach(function (link) {
      link.querySelector("[data-stars-count]").textContent = formatted;
      link.setAttribute("aria-label", repository + " GitHub stars: " + formatted);
      link.title = "GitHub stars · Last checked " + new Date(checkedAt).toLocaleString("en-US");
    });
  }

  document.querySelectorAll("[data-github-stars]").forEach(function (link) {
    var repository = link.dataset.githubStars;
    if (!/^[a-z0-9-]+\/[a-z0-9_.-]+$/i.test(repository)) return;
    if (!repositories.has(repository)) repositories.set(repository, []);
    repositories.get(repository).push(link);
  });

  repositories.forEach(function (links, repository) {
    var key = "yyg.github-stars.v1:" + repository;
    var cached = readCache(key);
    var savedAt = Number(cached.checkedAt);
    var snapshotAt = Date.parse(links[0].dataset.starsCheckedAt);
    var snapshotText = links[0].querySelector("[data-stars-count]").textContent.trim();
    var snapshotCount = /^\d+$/.test(snapshotText) ? Number(snapshotText) : null;
    var count = snapshotCount;
    var checkedAt = snapshotAt;

    if (validCount(cached.count) && Number.isFinite(savedAt) && savedAt > 0 && savedAt <= now &&
        (!Number.isFinite(snapshotAt) || savedAt >= snapshotAt)) {
      count = cached.count;
      checkedAt = savedAt;
    }
    if (validCount(count) && Number.isFinite(checkedAt)) display(links, repository, count, checkedAt);
    if (Number(cached.retryAt) > now && Number(cached.retryAt) <= now + retryDelay) return;
    if (validCount(count) && Number.isFinite(checkedAt) && checkedAt <= now && now - checkedAt < hour) return;
    if (!window.fetch || !window.AbortController) return;

    var controller = new AbortController();
    var timeout = window.setTimeout(function () { controller.abort(); }, 6000);
    fetch("https://api.github.com/repos/" + repository, {
      headers: { Accept: "application/vnd.github+json" },
      credentials: "omit",
      referrerPolicy: "no-referrer",
      signal: controller.signal
    }).then(function (response) {
      if (!response.ok) throw new Error("GitHub star count unavailable");
      return response.json();
    }).then(function (data) {
      if (!validCount(data.stargazers_count)) throw new Error("Invalid GitHub star count");
      var fetchedAt = Date.now();
      display(links, repository, data.stargazers_count, fetchedAt);
      saveCache(key, { count: data.stargazers_count, checkedAt: fetchedAt });
    }).catch(function () {
      saveCache(key, { count: count, checkedAt: checkedAt, retryAt: Date.now() + retryDelay });
    }).finally(function () {
      window.clearTimeout(timeout);
    });
  });
}());
