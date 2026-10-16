/*
 * Frontend foundation only.
 * Do not place credentials, session tokens, or provider secrets in this file.
 * Protected operations must be authenticated and authorized by the backend.
 */
"use strict";

document.addEventListener("DOMContentLoaded", () => {
  const themeRoot = document.documentElement;
  const themeToggle = document.querySelector("[data-theme-toggle]");
  const themeColorMeta = document.querySelector('meta[name="theme-color"]');
  const themeStorageKey = "smm-theme";
  const faviconBase = "https://iamjiteshtiwari.in/assets/favicon/Jitesh%20Tiwari%20(iamjiteshtiwari.in)%20Favicon%20";

  const applyTheme = (theme, persist = false) => {
    const safeTheme = theme === "dark" ? "dark" : "light";
    themeRoot.setAttribute("data-theme", safeTheme);
    themeRoot.style.colorScheme = safeTheme;
    if (themeColorMeta) themeColorMeta.setAttribute("content", safeTheme === "dark" ? "#0b1220" : "#eff6ff");
    document.querySelectorAll("[data-theme-favicon]").forEach((link) => {
      const mode = link.getAttribute("data-theme-favicon");
      const size = link.getAttribute("data-favicon-size") || "32x32";
      link.href = faviconBase + size + (mode === "light" ? "%20-%20Light.png" : "%20Dark.png");
      link.media = mode === safeTheme ? "all" : "not all";
    });
    if (themeToggle) {
      const nextTheme = safeTheme === "dark" ? "light" : "dark";
      themeToggle.setAttribute("aria-label", "Switch to " + nextTheme + " theme");
      themeToggle.setAttribute("title", "Switch to " + nextTheme + " theme");
      themeToggle.setAttribute("aria-pressed", String(safeTheme === "dark"));
    }
    if (persist) {
      try { window.localStorage.setItem(themeStorageKey, safeTheme); } catch (error) { /* Theme still works for this page. */ }
    }
  };

  let initialTheme = themeRoot.getAttribute("data-theme");
  try {
    const savedTheme = window.localStorage.getItem(themeStorageKey);
    if (savedTheme === "light" || savedTheme === "dark") initialTheme = savedTheme;
  } catch (error) { /* Fall back to the current system preference. */ }
  if (initialTheme !== "light" && initialTheme !== "dark") {
    initialTheme = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  applyTheme(initialTheme);
  if (themeToggle) themeToggle.addEventListener("click", () => {
    applyTheme(themeRoot.getAttribute("data-theme") === "dark" ? "light" : "dark", true);
  });
  if (window.matchMedia) {
    const systemTheme = window.matchMedia("(prefers-color-scheme: dark)");
    const followSystem = () => {
      try {
        if (window.localStorage.getItem(themeStorageKey)) return;
      } catch (error) { /* Continue following the system theme. */ }
      applyTheme(systemTheme.matches ? "dark" : "light");
    };
    if (systemTheme.addEventListener) systemTheme.addEventListener("change", followSystem);
    else if (systemTheme.addListener) systemTheme.addListener(followSystem);
  }

  const status = document.querySelector("#app-status");
  if (status) status.textContent = "Frontend scaffold loaded";

  const menuButton = document.querySelector(".menu-toggle");
  const workspaceNav = document.querySelector("#workspace-navigation");

  if (menuButton && workspaceNav) {
    menuButton.addEventListener("click", () => {
      const isOpen = menuButton.getAttribute("aria-expanded") === "true";
      menuButton.setAttribute("aria-expanded", String(!isOpen));
      menuButton.setAttribute("aria-label", isOpen ? "Open workspace menu" : "Close workspace menu");
      workspaceNav.classList.toggle("is-open", !isOpen);
    });

    workspaceNav.querySelectorAll("a").forEach((link) => {
      link.addEventListener("click", () => {
        menuButton.setAttribute("aria-expanded", "false");
        menuButton.setAttribute("aria-label", "Open workspace menu");
        workspaceNav.classList.remove("is-open");
        workspaceNav.querySelectorAll("a").forEach((item) => {
          if (item === link) item.setAttribute("aria-current", "page");
          else item.removeAttribute("aria-current");
        });
      });
    });

    const closeWorkspaceMenu = () => {
      menuButton.setAttribute("aria-expanded", "false");
      menuButton.setAttribute("aria-label", "Open workspace menu");
      workspaceNav.classList.remove("is-open");
    };

    document.addEventListener("click", (event) => {
      if (!workspaceNav.classList.contains("is-open")) return;
      if (!menuButton.contains(event.target) && !workspaceNav.contains(event.target)) {
        closeWorkspaceMenu();
      }
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && workspaceNav.classList.contains("is-open")) {
        closeWorkspaceMenu();
        menuButton.focus();
      }
    });

    window.addEventListener("resize", () => {
      if (window.matchMedia("(min-width: 761px)").matches) closeWorkspaceMenu();
    });
  }
  const accountButton = document.querySelector(".account-icon-link");
  const accountPopover = document.querySelector("#account-options");

  if (accountButton && accountPopover) {
    const closeAccountPopover = (restoreFocus = false) => {
      accountPopover.hidden = true;
      accountButton.setAttribute("aria-expanded", "false");
      if (restoreFocus) accountButton.focus();
    };

    const openAccountPopover = () => {
      accountPopover.hidden = false;
      accountButton.setAttribute("aria-expanded", "true");
    };

    accountButton.addEventListener("click", (event) => {
      event.preventDefault();
      const shouldOpen = accountPopover.hidden;
      if (shouldOpen) openAccountPopover();
      else closeAccountPopover();
    });

    document.addEventListener("click", (event) => {
      if (accountPopover.hidden) return;
      if (!accountPopover.contains(event.target) && !accountButton.contains(event.target)) {
        closeAccountPopover();
      }
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !accountPopover.hidden) closeAccountPopover(true);
    });

    accountPopover.querySelectorAll("a").forEach((link) => {
      link.addEventListener("click", () => closeAccountPopover());
    });
  }

  const destinationModal = document.querySelector("#destination-choice");
  const brandLink = document.querySelector(".site-brand");

  if (destinationModal && brandLink) {
    const dialog = destinationModal.querySelector('[role="dialog"]');
    const closeButtons = destinationModal.querySelectorAll("[data-destination-close]");
    let previousFocus = null;

    const closeDestinationModal = () => {
      destinationModal.hidden = true;
      destinationModal.setAttribute("aria-hidden", "true");
      document.body.classList.remove("modal-open");
      if (previousFocus && typeof previousFocus.focus === "function") previousFocus.focus();
    };

    const openDestinationModal = (event) => {
      event.preventDefault();
      previousFocus = brandLink;
      destinationModal.hidden = false;
      destinationModal.setAttribute("aria-hidden", "false");
      document.body.classList.add("modal-open");
      if (dialog) dialog.focus();
    };

    destinationModal.hidden = true;
    destinationModal.setAttribute("aria-hidden", "true");
    brandLink.addEventListener("click", openDestinationModal);

    closeButtons.forEach((button) => button.addEventListener("click", closeDestinationModal));

    destinationModal.addEventListener("click", (event) => {
      if (event.target === destinationModal) closeDestinationModal();
    });

    destinationModal.addEventListener("keydown", (event) => {
      if (event.key !== "Tab") return;
      const focusable = [...destinationModal.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')]
        .filter((element) => !element.hidden && element.getAttribute("aria-hidden") !== "true");
      if (!focusable.length) {
        event.preventDefault();
        if (dialog) dialog.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !destinationModal.hidden) closeDestinationModal();
    });
  }

  const year = document.querySelector("#current-year");
  if (year) year.textContent = String(new Date().getFullYear());
});
