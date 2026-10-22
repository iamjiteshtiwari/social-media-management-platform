/* Lightweight SPA navigation for the workspace prototype.
 * Keeps direct .html URLs, uses History API, and remains frontend-preview only.
 */
"use strict";
(() => {
  const allowedPages = new Set([
    "dashboard.html", "brand-management.html", "social-accounts.html",
    "content-planner.html", "media-library.html", "post-editor.html",
    "publishing-queue.html", "analytics.html", "notifications.html",
    "admin-approvals.html"
  ]);
  const rootMain = () => document.querySelector("#main-content");
  const pageScriptInitializers = {
    "dashboard-ui.js": "dashboard",
    "workspace-demo-ui.js": "workspaceDemo",
    "post-editor-ui.js": "postEditor"
  };
  const loadedScripts = new Set([...document.scripts].map((script) => {
    try { return new URL(script.src, location.href).pathname.split("/").pop(); }
    catch (_) { return ""; }
  }).filter(Boolean));
  let navigationId = 0;

  function pageName(url) { return url.pathname.split("/").pop() || "index.html"; }

  function isInternalWorkspaceLink(link) {
    if (!link || link.hasAttribute("download") || link.target === "_blank") return false;
    let url;
    try { url = new URL(link.href, location.href); } catch (_) { return false; }
    return url.origin === location.origin && allowedPages.has(pageName(url)) && url.pathname.endsWith(".html");
  }

  function updateNavigation(url) {
    document.querySelectorAll("#workspace-navigation a, #dashboard-navigation a").forEach((link) => {
      let matches = false;
      try { matches = pageName(new URL(link.href, location.href)) === pageName(url); } catch (_) {}
      if (matches) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    });
    const menu = document.querySelector(".menu-toggle");
    const nav = document.querySelector("#workspace-navigation, #dashboard-navigation");
    if (menu && nav) {
      menu.setAttribute("aria-expanded", "false");
      menu.setAttribute("aria-label", "Open workspace menu");
      nav.classList.remove("is-open");
    }
  }

  async function ensureStylesheets(doc) {
    const targetLinks = [...doc.querySelectorAll('link[rel="stylesheet"][href]')];
    const targetHrefs = new Set(targetLinks.map((link) => new URL(link.getAttribute("href"), location.href).href));
    const currentLinks = [...document.querySelectorAll('link[rel="stylesheet"][href]')];
    const currentHrefs = new Set(currentLinks.map((link) => new URL(link.href, location.href).href));

    await Promise.all(targetLinks.map((link) => {
      const href = new URL(link.getAttribute("href"), location.href).href;
      if (currentHrefs.has(href)) return Promise.resolve();
      return new Promise((resolve, reject) => {
        const next = document.createElement("link");
        next.rel = "stylesheet";
        next.href = href;
        if (link.media) next.media = link.media;
        next.onload = resolve;
        next.onerror = () => reject(new Error("Stylesheet failed to load: " + href));
        document.head.appendChild(next);
        currentHrefs.add(href);
      });
    }));

    // Remove page-specific styles only after the destination stylesheets are ready.
    currentLinks.forEach((link) => {
      if (!targetHrefs.has(new URL(link.href, location.href).href)) link.remove();
    });
  }

  function ensureScript(src) {
    const url = new URL(src, location.href);
    const file = url.pathname.split("/").pop();
    if (loadedScripts.has(file)) return Promise.resolve();
    return new Promise((resolve) => {
      const script = document.createElement("script");
      script.src = url.href;
      script.defer = true;
      script.onload = () => { loadedScripts.add(file); resolve(); };
      script.onerror = () => reject(new Error("Page script failed to load: " + url.href));
      document.head.appendChild(script);
    });
  }

  async function navigate(rawUrl, options = {}) {
    const url = new URL(rawUrl, location.href);
    if (!allowedPages.has(pageName(url))) { location.href = url.href; return; }
    const id = ++navigationId;
    const currentMain = rootMain();
    if (!currentMain) { location.href = url.href; return; }

    try {
      const response = await fetch(url.href, { headers: { "X-Requested-With": "fetch" } });
      if (!response.ok) throw new Error("Page request failed");
      const html = await response.text();
      if (id !== navigationId) return;
      const nextDoc = new DOMParser().parseFromString(html, "text/html");
      const nextMain = nextDoc.querySelector("#main-content");
      if (!nextMain) throw new Error("Expected main content was not found");
      await ensureStylesheets(nextDoc);
      if (id !== navigationId) return;

      currentMain.className = nextMain.className;
      currentMain.innerHTML = nextMain.innerHTML;
      document.body.className = nextDoc.body.className;
      document.title = nextDoc.title || document.title;

      const scriptNames = [...nextDoc.querySelectorAll("script[src]")]
        .map((script) => new URL(script.getAttribute("src"), url.href))
        .filter((scriptUrl) => scriptUrl.origin === location.origin)
        .map((scriptUrl) => ({ src: scriptUrl.href, file: scriptUrl.pathname.split("/").pop() }))
        .filter((item) => Object.hasOwn(pageScriptInitializers, item.file));
      for (const item of scriptNames) {
        await ensureScript(item.src);
        if (id !== navigationId) return;
      }
      for (const item of scriptNames) {
        const initializer = pageScriptInitializers[item.file];
        if (typeof window.SMMPageInitializers?.[initializer] === "function") window.SMMPageInitializers[initializer]();
      }
      if (options.push !== false) history.pushState({ smmSpa: true }, "", url.href);
      updateNavigation(url);
      window.scrollTo({ top: 0, behavior: "auto" });
    } catch (_) {
      location.href = url.href;
    }
  }

  document.addEventListener("click", (event) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = event.target.closest("a[href]");
    if (!isInternalWorkspaceLink(link)) return;
    const url = new URL(link.href, location.href);
    if (url.pathname === location.pathname && url.search === location.search && url.hash) return;
    event.preventDefault();
    navigate(url.href);
  });
  window.addEventListener("popstate", () => navigate(location.href, { push: false }));
  window.addEventListener("pageshow", () => updateNavigation(new URL(location.href)));
})();
