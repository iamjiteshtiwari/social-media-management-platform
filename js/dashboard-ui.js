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

  const announce = (message) => {
    let region = document.querySelector("#preview-action-feedback");
    if (!region) {
      region = document.createElement("p");
      region.id = "preview-action-feedback";
      region.className = "preview-action-feedback";
      region.setAttribute("role", "status");
      region.setAttribute("aria-live", "polite");
      const main = document.querySelector("#main-content");
      if (main) main.append(region);
    }
    region.textContent = message;
  };
  document.querySelectorAll("[data-preview-action]").forEach((button) => {
    button.addEventListener("click", () => announce(button.dataset.previewAction + " is a visual prototype. Nothing was uploaded, created or saved."));
  });

  const monthHeading = document.querySelector("#calendar-month");
  let displayedMonth = new Date(2026, 9, 1);
  const renderMonth = () => {
    if (monthHeading) monthHeading.textContent = displayedMonth.toLocaleDateString("en-IN", {month:"long", year:"numeric"});
  };
  document.querySelectorAll("[data-calendar-shift]").forEach((button) => button.addEventListener("click", () => {
    displayedMonth = new Date(displayedMonth.getFullYear(), displayedMonth.getMonth() + Number(button.dataset.calendarShift), 1);
    renderMonth();
  }));
  const todayButton = document.querySelector("[data-calendar-today]");
  if (todayButton) todayButton.addEventListener("click", () => {
    displayedMonth = new Date();
    renderMonth();
    announce("Calendar heading moved to the current month. Calendar entries are still sample content.");
  });
  const search = document.querySelector("#media-search");
  const mediaType = document.querySelector("#media-type");
  const mediaItems = [...document.querySelectorAll(".media-library-item")];
  const filterMedia = () => {
    const term = (search?.value || "").trim().toLowerCase();
    mediaItems.forEach((item) => {
      const matches = item.textContent.toLowerCase().includes(term);
      item.hidden = !matches;
    });
    if (term) announce("Filtering the illustrative media items only. No media service is connected.");
  };
  if (search) search.addEventListener("input", filterMedia);
  if (mediaType) mediaType.addEventListener("change", () => announce("File type filtering is a preview control; no real media records are loaded."));
});
