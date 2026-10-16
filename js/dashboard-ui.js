"use strict";
document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll("[data-current-year]").forEach((node) => { node.textContent = String(new Date().getFullYear()); });
  const menuButton = document.querySelector(".menu-toggle");
  const nav = document.querySelector("#dashboard-navigation");
  if (menuButton && nav) {
    menuButton.addEventListener("click", () => {
      const open = menuButton.getAttribute("aria-expanded") === "true";
      menuButton.setAttribute("aria-expanded", String(!open));
      menuButton.setAttribute("aria-label", open ? "Open workspace menu" : "Close workspace menu");
      nav.classList.toggle("is-open", !open);
    });
    nav.querySelectorAll("a").forEach((link) => link.addEventListener("click", () => {
      if (link.hash) {
        nav.querySelectorAll("a").forEach((item) => item.removeAttribute("aria-current"));
        link.setAttribute("aria-current", "page");
      }
      menuButton.setAttribute("aria-expanded", "false");
      menuButton.setAttribute("aria-label", "Open workspace menu");
      nav.classList.remove("is-open");
    }));
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        menuButton.setAttribute("aria-expanded", "false");
        menuButton.setAttribute("aria-label", "Open workspace menu");
        nav.classList.remove("is-open");
      }
    });
  }
});
