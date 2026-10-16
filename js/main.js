/*
 * Frontend foundation only.
 * Do not place credentials, session tokens, or provider secrets in this file.
 * Protected operations must be authenticated and authorized by the backend.
 */
"use strict";

document.addEventListener("DOMContentLoaded", () => {
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
        workspaceNav.querySelectorAll("a").forEach((item) => item.removeAttribute("aria-current"));
        link.setAttribute("aria-current", "page");
      });
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        menuButton.setAttribute("aria-expanded", "false");
        menuButton.setAttribute("aria-label", "Open workspace menu");
        workspaceNav.classList.remove("is-open");
      }
    });
  }

  const accountButton = document.querySelector(".account-button");
  const accountNotice = document.querySelector("#account-notice");
  const dismissNotice = document.querySelector(".notice-dismiss");

  const closeAccountNotice = () => {
    if (!accountButton || !accountNotice) return;
    accountNotice.hidden = true;
    accountButton.setAttribute("aria-expanded", "false");
  };

  if (accountButton && accountNotice) {
    accountButton.addEventListener("click", () => {
      const isOpen = accountButton.getAttribute("aria-expanded") === "true";
      accountButton.setAttribute("aria-expanded", String(!isOpen));
      accountNotice.hidden = isOpen;
    });

    if (dismissNotice) dismissNotice.addEventListener("click", closeAccountNotice);

    document.addEventListener("click", (event) => {
      if (!accountButton.contains(event.target) && !accountNotice.contains(event.target)) {
        closeAccountNotice();
      }
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeAccountNotice();
    });
  }

  const year = document.querySelector("#current-year");
  if (year) year.textContent = String(new Date().getFullYear());
});
