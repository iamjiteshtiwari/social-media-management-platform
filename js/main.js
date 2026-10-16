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

  const year = document.querySelector("#current-year");
  if (year) year.textContent = String(new Date().getFullYear());
});
