/* The article directory follows each post's real path beneath _posts.
   Folder browsing and tag search share one static, GitHub Pages compatible index. */
(function () {
  "use strict";

  function start() {
    var browser = document.querySelector("[data-blog-browser]");
    if (!browser) return;

    var controls = browser.querySelector("[data-browser-controls]");
    var fallback = browser.querySelector("[data-browser-fallback]");
    var error = browser.querySelector("[data-browser-error]");
    var search = browser.querySelector("[data-browser-search]");
    var tagSearch = browser.querySelector("[data-browser-tag-search]");
    var folders = browser.querySelector("[data-browser-folders]");
    var breadcrumbs = browser.querySelector("[data-browser-breadcrumbs]");
    var status = browser.querySelector("[data-browser-status]");
    var tagList = browser.querySelector("[data-browser-tags]");
    var activeFilters = browser.querySelector("[data-browser-active-filters]");
    var results = browser.querySelector("[data-browser-results]");
    var pagination = browser.querySelector("[data-browser-pagination]");
    var filters = browser.querySelector("[data-browser-filters]");
    var filterToggle = browser.querySelector("[data-browser-filter-toggle]");
    var filterClose = browser.querySelector("[data-browser-filter-close]");
    var yearSelect = browser.querySelector("[data-browser-year]");
    var monthSelect = browser.querySelector("[data-browser-month]");
    var reset = browser.querySelector("[data-browser-reset]");
    var moreTags = browser.querySelector("[data-browser-more-tags]");
    var pageSize = 20;
    var tagMap = new Map();
    var folderLinks = new Map();
    var folderBranches = new Map();
    var posts;
    var state;
    var searchTimer;
    var tagSlugs = [];
    var allTagsVisible = false;

    function normalized(value) {
      return String(value || "").normalize("NFKC").toLocaleLowerCase();
    }

    function element(name, className, text) {
      var el = document.createElement(name);
      if (className) el.className = className;
      if (text !== undefined) el.textContent = text;
      return el;
    }

    function readState() {
      var params = new URL(window.location.href).searchParams;
      var tags = params.getAll("tag").map(normalized).filter(Boolean);
      if (!tags.length && window.location.hash) {
        var hash = window.location.hash.slice(1);
        try { hash = decodeURIComponent(hash); } catch (ignored) {}
        var legacy = tagSlugs.find(function (tag) { return tag.slug === hash; });
        if (legacy) tags.push(normalized(legacy.name));
      }
      return {
        folder: params.get("folder") || "",
        tags: new Set(tags),
        query: params.get("q") || "",
        year: /^\d{4}$/.test(params.get("year") || "") ? params.get("year") : "",
        month: /^(0?[1-9]|1[0-2])$/.test(params.get("month") || "") ? params.get("month").padStart(2, "0") : "",
        page: Math.max(1, parseInt(params.get("page"), 10) || 1)
      };
    }

    function stateURL(folder) {
      var url = new URL(window.location.href);
      ["folder", "tag", "q", "year", "month", "page"].forEach(function (key) { url.searchParams.delete(key); });
      var path = folder === undefined ? state.folder : folder;
      if (path) url.searchParams.set("folder", path);
      state.tags.forEach(function (key) {
        url.searchParams.append("tag", tagMap.has(key) ? tagMap.get(key).label : key);
      });
      if (state.query.trim()) url.searchParams.set("q", state.query.trim());
      if (state.year) url.searchParams.set("year", state.year);
      if (state.month) url.searchParams.set("month", state.month);
      if (folder === undefined && state.page > 1) url.searchParams.set("page", state.page);
      url.hash = "";
      return url.pathname + url.search;
    }

    function folderLink(path, label, count) {
      var link = element("a", "blog-browser__folder-link");
      link.dataset.folder = path;
      link.appendChild(element("span", "blog-browser__folder-name", label));
      if (count !== undefined) link.appendChild(element("span", "blog-browser__count", count));
      return link;
    }

    function buildTimeOptions() {
      Array.from(new Set(posts.map(function (post) { return post.date.slice(0, 4); })))
        .filter(function (year) { return /^\d{4}$/.test(year); })
        .sort().reverse().forEach(function (year) {
          var option = element("option", "", year);
          option.value = year;
          yearSelect.appendChild(option);
        });
      ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
        .forEach(function (name, index) {
          var option = element("option", "", name);
          option.value = String(index + 1).padStart(2, "0");
          monthSelect.appendChild(option);
        });
    }

    function setFilterPanel(open, returnFocus) {
      filters.dataset.mobileOpen = String(open);
      filterToggle.setAttribute("aria-expanded", String(open));
      if (open) filterClose.focus({ preventScroll: true });
      else if (returnFocus) filterToggle.focus({ preventScroll: true });
    }

    function buildTree() {
      var root = { children: new Map(), count: posts.length };
      posts.forEach(function (post) {
        var node = root;
        post.parts.forEach(function (part) {
          if (!node.children.has(part)) node.children.set(part, { children: new Map(), count: 0 });
          node = node.children.get(part);
          node.count += 1;
        });
      });
      var all = folderLink("", "All topics", root.count);
      folderLinks.set("", all);
      folders.appendChild(all);
      var preferred = ["endpoint-security", "ai-security", "embodied-ai", "ai-infrastructure", "ai-foundations", "software-foundations", "security-foundations", "learning-notes"];
      function ordered(entries, depth) {
        return Array.from(entries).sort(function (a, b) {
          if (depth === 0) {
            var ai = preferred.indexOf(a[0]);
            var bi = preferred.indexOf(b[0]);
            if (ai !== bi) return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
          }
          return a[0].localeCompare(b[0], "en", { numeric: true });
        });
      }
      function branch(node, prefix, depth) {
        var list = element("ul", "blog-browser__tree");
        ordered(node.children, depth).forEach(function (entry) {
          var name = entry[0];
          var child = entry[1];
          var path = prefix ? prefix + "/" + name : name;
          var item = element("li");
          var link = folderLink(path, name, child.count);
          folderLinks.set(path, link);
          if (child.children.size) {
            var details = element("details", "blog-browser__branch");
            details.open = false;
            var summary = element("summary");
            summary.appendChild(link);
            details.appendChild(summary);
            details.appendChild(branch(child, path, depth + 1));
            folderBranches.set(path, details);
            item.appendChild(details);
          } else {
            item.appendChild(link);
          }
          list.appendChild(item);
        });
        return list;
      }
      folders.appendChild(branch(root, "", 0));
      var unfiled = posts.filter(function (post) { return !post.folder; }).length;
      if (unfiled) {
        var note = element("p", "blog-browser__tag-hint", unfiled + " posts are outside these topics.");
        folders.appendChild(note);
      }
    }

    function showSelectedBranch() {
      var prefix = "";
      state.folder.split("/").filter(Boolean).forEach(function (part) {
        prefix = prefix ? prefix + "/" + part : part;
        if (folderBranches.has(prefix)) folderBranches.get(prefix).open = true;
      });
    }

    function tagButton(key, count, removal) {
      var info = tagMap.get(key);
      var label = info ? info.label : key;
      var button = element("button", "blog-browser__tag", (removal ? "× " : "") + label);
      button.type = "button";
      button.dataset.tag = key;
      button.setAttribute("aria-pressed", String(state.tags.has(key)));
      if (removal) button.setAttribute("aria-label", "Remove tag " + label);
      if (count !== undefined) button.appendChild(element("span", "", count));
      return button;
    }

    function renderTags(candidates) {
      var counts = new Map();
      candidates.forEach(function (post) {
        post.tagKeys.forEach(function (key) { counts.set(key, (counts.get(key) || 0) + 1); });
      });
      tagList.replaceChildren();
      var term = normalized(tagSearch.value.trim());
      var available = Array.from(tagMap).filter(function (entry) {
        return (counts.has(entry[0]) || state.tags.has(entry[0])) && normalized(entry[1].label).includes(term);
      }).sort(function (a, b) {
        return Number(state.tags.has(b[0])) - Number(state.tags.has(a[0])) ||
          (counts.get(b[0]) || 0) - (counts.get(a[0]) || 0) ||
          a[1].label.localeCompare(b[1].label, "en", { numeric: true });
      });
      var visibleTags = term || allTagsVisible ? available : available.slice(0, Math.max(12, state.tags.size));
      visibleTags.forEach(function (entry) {
        tagList.appendChild(tagButton(entry[0], counts.get(entry[0]) || 0, false));
      });
      moreTags.hidden = Boolean(term) || available.length <= 12;
      moreTags.textContent = allTagsVisible ? "Show fewer tags" : "Show all " + available.length + " tags";
      moreTags.setAttribute("aria-expanded", String(allTagsVisible));
      if (!tagList.children.length) tagList.appendChild(element("p", "blog-browser__tag-hint", "No matching tags."));
      activeFilters.replaceChildren();
      state.tags.forEach(function (key) { activeFilters.appendChild(tagButton(key, undefined, true)); });
    }

    function renderBreadcrumbs() {
      breadcrumbs.replaceChildren();
      breadcrumbs.hidden = !state.folder;
      var root = folderLink("", "All topics");
      if (!state.folder) root.setAttribute("aria-current", "page");
      breadcrumbs.appendChild(root);
      var prefix = "";
      state.folder.split("/").filter(Boolean).forEach(function (part, index, parts) {
        prefix = prefix ? prefix + "/" + part : part;
        breadcrumbs.appendChild(element("span", "", "/"));
        var link = folderLink(prefix, part);
        if (index === parts.length - 1) link.setAttribute("aria-current", "page");
        breadcrumbs.appendChild(link);
      });
      breadcrumbs.querySelectorAll("[data-folder]").forEach(function (link) {
        link.href = stateURL(link.dataset.folder);
      });
    }

    function renderCard(post) {
      var article = element("article", "archive__item blog-browser__card");
      var meta = element("p", "blog-browser__card-meta");
      var time = element("time", "", post.date.slice(0, 10));
      time.dateTime = post.date;
      meta.appendChild(time);
      meta.appendChild(document.createTextNode(" · "));
      var path = element("a", "", post.folder ? post.parts[post.parts.length - 1] : "General");
      path.dataset.folder = post.folder;
      path.href = stateURL(post.folder);
      meta.appendChild(path);
      var title = element("h2", "archive__item-title");
      var link = element("a", "", post.title);
      link.href = post.url;
      title.appendChild(link);
      article.appendChild(title);
      article.appendChild(meta);
      if (post.excerpt) article.appendChild(element("p", "archive__item-excerpt blog-browser__excerpt", post.excerpt));
      if (post.tagKeys.length) {
        var tags = element("div", "blog-browser__card-tags");
        post.tagKeys.slice(0, 3).forEach(function (key) { tags.appendChild(tagButton(key)); });
        article.appendChild(tags);
      }
      return article;
    }

    function render(mode) {
      var terms = normalized(state.query.trim()).split(/\s+/).filter(Boolean);
      var candidates = posts.filter(function (post) {
        return (!state.folder || post.folder === state.folder || post.folder.startsWith(state.folder + "/")) &&
          (!state.year || post.date.slice(0, 4) === state.year) &&
          (!state.month || post.date.slice(5, 7) === state.month) &&
          terms.every(function (term) { return post.search.includes(term); });
      });
      var matches = candidates.filter(function (post) {
        return Array.from(state.tags).every(function (tag) { return post.tagKeys.includes(tag); });
      });
      var filtering = Boolean(state.folder || state.query.trim() || state.tags.size || state.year || state.month);
      var pageCount = Math.max(1, Math.ceil(matches.length / pageSize));
      state.page = Math.min(state.page, pageCount);
      if (mode) {
        var url = stateURL();
        if (url !== window.location.pathname + window.location.search + window.location.hash) {
          history[mode === "push" ? "pushState" : "replaceState"](null, "", url);
        }
      }
      search.value = state.query;
      if (state.year && !Array.from(yearSelect.options).some(function (option) { return option.value === state.year; })) {
        var missingYear = element("option", "", state.year);
        missingYear.value = state.year;
        yearSelect.appendChild(missingYear);
      }
      yearSelect.value = state.year;
      monthSelect.value = state.month;
      status.textContent = matches.length + (matches.length === 1 ? " post" : " posts");
      reset.hidden = !filtering && !tagSearch.value;
      folderLinks.forEach(function (link, path) {
        link.href = stateURL(path);
        if (path === state.folder) link.setAttribute("aria-current", "page");
        else link.removeAttribute("aria-current");
      });
      showSelectedBranch();
      renderBreadcrumbs();
      renderTags(candidates);
      results.replaceChildren();
      matches.slice((state.page - 1) * pageSize, state.page * pageSize).forEach(function (post) {
        results.appendChild(renderCard(post));
      });
      if (!matches.length) results.appendChild(element("p", "blog-browser__empty", "No matching posts. Try another search or clear the filters."));
      pagination.replaceChildren();
      if (matches.length > pageSize) {
        var previous = element("button", "", "Previous");
        previous.type = "button";
        previous.dataset.page = state.page - 1;
        previous.disabled = state.page === 1;
        var next = element("button", "", "Next");
        next.type = "button";
        next.dataset.page = state.page + 1;
        next.disabled = state.page === pageCount;
        pagination.appendChild(previous);
        pagination.appendChild(element("span", "", "Page " + state.page + " of " + pageCount));
        pagination.appendChild(next);
      }
    }

    browser.addEventListener("click", function (event) {
      var folder = event.target.closest("a[data-folder]");
      if (folder && browser.contains(folder)) {
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        event.stopPropagation();
        state.folder = folder.dataset.folder;
        state.page = 1;
        render("push");
        return;
      }
      var tag = event.target.closest("button[data-tag]");
      if (tag && browser.contains(tag)) {
        var key = tag.dataset.tag;
        if (state.tags.has(key)) state.tags.delete(key);
        else state.tags.add(key);
        state.page = 1;
        render("push");
        return;
      }
      var page = event.target.closest("button[data-page]");
      if (page && !page.disabled && browser.contains(page)) {
        state.page = Number(page.dataset.page);
        render("push");
        results.scrollIntoView({ block: "start", behavior: "instant" });
      }
    });
    search.addEventListener("input", function () {
      clearTimeout(searchTimer);
      state.query = search.value;
      state.page = 1;
      searchTimer = setTimeout(function () {
        render("replace");
      }, 160);
    });
    tagSearch.addEventListener("input", function () { render(); });
    yearSelect.addEventListener("change", function () {
      state.year = yearSelect.value;
      state.page = 1;
      render("push");
    });
    monthSelect.addEventListener("change", function () {
      state.month = monthSelect.value;
      state.page = 1;
      render("push");
    });
    filterToggle.addEventListener("click", function () {
      setFilterPanel(filters.dataset.mobileOpen !== "true", false);
    });
    filterClose.addEventListener("click", function () { setFilterPanel(false, true); });
    browser.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && filters.dataset.mobileOpen === "true") setFilterPanel(false, true);
    });
    moreTags.addEventListener("click", function () {
      allTagsVisible = !allTagsVisible;
      render();
    });
    reset.addEventListener("click", function () {
      clearTimeout(searchTimer);
      state = { folder: "", tags: new Set(), query: "", year: "", month: "", page: 1 };
      tagSearch.value = "";
      allTagsVisible = false;
      render("push");
      search.focus({ preventScroll: true });
    });
    window.addEventListener("popstate", function () {
      clearTimeout(searchTimer);
      if (!posts) return;
      state = readState();
      render();
    });

    fetch(browser.dataset.indexUrl, { credentials: "same-origin" }).then(function (response) {
      if (!response.ok) throw new Error("Article index unavailable");
      return response.json();
    }).then(function (index) {
      if (!Array.isArray(index.posts)) throw new Error("Invalid article index");
      tagSlugs = Array.isArray(index.tags) ? index.tags : [];
      posts = index.posts.map(function (post) {
        var parts = String(post.path).replace(/\\/g, "/").replace(/^_posts\//, "").split("/");
        parts.pop();
        var tags = Array.isArray(post.tags) ? post.tags : [];
        var keys = [];
        tags.forEach(function (label) {
          label = String(label).trim();
          var key = normalized(label);
          if (!key || keys.includes(key)) return;
          keys.push(key);
          if (!tagMap.has(key)) tagMap.set(key, { label: label });
        });
        var url = new URL(post.url, window.location.href);
        if (url.origin !== window.location.origin) throw new Error("Invalid article link");
        var entry = {
          parts: parts,
          folder: parts.join("/"),
          title: String(post.title || "Untitled post"),
          url: url.href,
          date: String(post.date || ""),
          excerpt: String(post.excerpt || ""),
          tagKeys: keys
        };
        entry.search = normalized([entry.title, entry.excerpt, parts.join(" "), tags.join(" ")].join(" "));
        return entry;
      }).sort(function (a, b) { return b.date.localeCompare(a.date); });
      state = readState();
      buildTree();
      buildTimeOptions();
      render("replace");
      fallback.hidden = true;
      controls.hidden = false;
    }).catch(function () {
      error.textContent = "The filters could not load. You can still browse the posts below, or refresh to try again.";
      error.hidden = false;
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
