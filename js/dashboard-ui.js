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
  const calendarCells = document.querySelector("#calendar-cells");
  let displayedMonth = new Date(2026, 9, 1);
  const renderMonth = () => {
    if (!monthHeading || !calendarCells) return;
    monthHeading.textContent = displayedMonth.toLocaleDateString("en-IN", {month:"long", year:"numeric"});
    const year = displayedMonth.getFullYear();
    const month = displayedMonth.getMonth();
    const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cellCount = Math.ceil((firstWeekday + daysInMonth) / 7) * 7;
    const html = [];
    for (let i = 0; i < cellCount; i += 1) {
      const date = new Date(year, month, i - firstWeekday + 1);
      const inMonth = date.getMonth() === month;
      const day = date.getDate();
      const event = inMonth && year === 2026 && month === 9 && day === 8
        ? '<small class="calendar-event">Draft preview</small>'
        : inMonth && year === 2026 && month === 9 && day === 15
          ? '<small class="calendar-event calendar-event--blue">Planned post</small>'
          : "";
      html.push('<div class="calendar-cell' + (inMonth ? '' : ' is-muted') + '"><span>' + day + '</span>' + event + '</div>');
    }
    calendarCells.innerHTML = html.join("");
  };
  renderMonth();
  document.querySelectorAll("[data-calendar-shift]").forEach((button) => button.addEventListener("click", () => {
    displayedMonth = new Date(displayedMonth.getFullYear(), displayedMonth.getMonth() + Number(button.dataset.calendarShift), 1);
    renderMonth();
  }));
  const todayButton = document.querySelector("[data-calendar-today]");
  if (todayButton) todayButton.addEventListener("click", () => {
    displayedMonth = new Date();
    renderMonth();
    announce("Calendar moved to the current month. Any visible entries are illustrative sample content.");
  });
  const search = document.querySelector("#media-search");
  const mediaType = document.querySelector("#media-type");
  const mediaItems = [...document.querySelectorAll(".media-library-item")];
  const filterMedia = () => {
    const term = (search?.value || "").trim().toLowerCase();
    const type = mediaType?.value || "All files";
    mediaItems.forEach((item) => {
      const matchesText = item.textContent.toLowerCase().includes(term);
      const itemType = item.dataset.mediaType || "other";
      const matchesType = type === "All files" || (type === "Images" && itemType === "image") || (type === "Videos" && itemType === "video") || (type === "Documents" && itemType === "document");
      item.hidden = !(matchesText && matchesType);
    });
    if (search?.value || (mediaType && mediaType.value !== "All files")) announce("Filtered illustrative media items only. No media service is connected.");
  };
  if (search) search.addEventListener("input", filterMedia);
  if (mediaType) mediaType.addEventListener("change", filterMedia);
});
