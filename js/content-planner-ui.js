"use strict";
window.SMMPageInitializers = window.SMMPageInitializers || {};
window.SMMPageInitializers.contentPlanner = function () {
  const monthHeading = document.querySelector("#calendar-month");
  const cells = document.querySelector("#calendar-cells");
  const grid = document.querySelector("#calendar-grid");
  const status = document.querySelector("#calendar-status");
  const view = document.querySelector("#calendar-view");
  let cursor = new Date();
  cursor.setDate(1);
  const monthFmt = new Intl.DateTimeFormat("en", {month:"long", year:"numeric"});
  const dateKey = (date) => [date.getFullYear(), String(date.getMonth()+1).padStart(2,"0"), String(date.getDate()).padStart(2,"0")].join("-");
  const render = () => {
    if (!cells || !monthHeading) return;
    monthHeading.textContent = monthFmt.format(cursor);
    cells.replaceChildren();
    const mode = view?.value || "Month";
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const mondayOffset = (first.getDay() + 6) % 7;
    const daysInMonth = new Date(cursor.getFullYear(), cursor.getMonth()+1, 0).getDate();
    let dates = [];
    if (mode === "Week") {
      const monday = new Date(cursor);
      monday.setDate(cursor.getDate() - ((cursor.getDay() + 6) % 7));
      dates = Array.from({length:7},(_,i)=>{const d=new Date(monday);d.setDate(monday.getDate()+i);return d;});
      monthHeading.textContent = "Week of " + new Intl.DateTimeFormat("en",{month:"short",day:"numeric",year:"numeric"}).format(monday);
    } else if (mode === "List") {
      dates = Array.from({length:daysInMonth},(_,i)=>new Date(cursor.getFullYear(),cursor.getMonth(),i+1));
    } else {
      const count = Math.ceil((mondayOffset + daysInMonth) / 7) * 7;
      dates = Array.from({length:count},(_,i)=>new Date(cursor.getFullYear(),cursor.getMonth(),i-mondayOffset+1));
    }
    grid?.classList.toggle("calendar-grid--list", mode === "List");
    grid?.classList.toggle("calendar-grid--week", mode === "Week");
    dates.forEach((date) => {
      const cell = document.createElement("div");
      cell.className = "calendar-cell";
      if (date.getMonth() !== cursor.getMonth() && mode === "Month") cell.classList.add("is-outside-month");
      const head = document.createElement("div");
      head.className = "calendar-cell__head";
      const day = document.createElement("span");
      day.textContent = String(date.getDate());
      const create = document.createElement("a");
      create.className = "calendar-cell__add";
      create.href = "post-editor.html?scheduledAt=" + encodeURIComponent(dateKey(date));
      create.textContent = "+ Create";
      create.setAttribute("aria-label","Prepare a post for " + date.toLocaleDateString());
      cell.append(head);
      head.append(day, create);
      const today = new Date();
      if (dateKey(date) === dateKey(today)) cell.classList.add("is-today");
      const empty = document.createElement("p");
      empty.className = "calendar-cell__empty";
      empty.textContent = "No connected posts";
      cell.append(empty);
      cells.append(cell);
    });
    if (status) status.textContent = "Showing " + mode.toLowerCase() + " view. No posts are loaded because the authenticated content API is not connected.";
  };
  document.querySelectorAll("[data-calendar-shift]").forEach((button) => button.addEventListener("click", () => {
    const amount = Number(button.dataset.calendarShift) || 0;
    if ((view?.value || "Month") === "Week") cursor.setDate(cursor.getDate() + amount * 7);
    else cursor.setMonth(cursor.getMonth() + amount);
    render();
  }));
  document.querySelector("[data-calendar-today]")?.addEventListener("click", () => { cursor = new Date(); if ((view?.value || "Month") !== "Week") cursor.setDate(1); render(); });
  view?.addEventListener("change", render);
  render();
};
document.addEventListener("DOMContentLoaded", window.SMMPageInitializers.contentPlanner);
