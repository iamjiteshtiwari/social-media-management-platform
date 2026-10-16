"use strict";
document.addEventListener("DOMContentLoaded", () => {\n  document.querySelectorAll("[data-current-year]").forEach((node) => { node.textContent = String(new Date().getFullYear()); });
  const feedback = document.querySelector("#workspace-feedback");
  const announce = (message) => { if (feedback) feedback.textContent = message; };
  document.querySelectorAll("[data-demo-notice]").forEach((button) => button.addEventListener("click", () => announce(button.dataset.demoNotice)));

  const queueRows = [...document.querySelectorAll("[data-queue-status]")];
  const queueTabs = [...document.querySelectorAll("[data-queue-filter]")];
  const queueSearch = document.querySelector("#queue-search");
  const queueEmpty = document.querySelector("#queue-empty");
  const filterQueue = () => {
    const active = document.querySelector("[data-queue-filter].is-active")?.dataset.queueFilter || "all";
    const term = (queueSearch?.value || "").trim().toLowerCase();
    let visible = 0;
    queueRows.forEach((row) => {
      const matchesStatus = active === "all" || row.dataset.queueStatus === active;
      const matchesText = row.textContent.toLowerCase().includes(term);
      row.hidden = !(matchesStatus && matchesText);
      if (!row.hidden) visible += 1;
    });
    if (queueEmpty) queueEmpty.hidden = visible > 0;
  };
  queueTabs.forEach((tab) => tab.addEventListener("click", () => {
    queueTabs.forEach((item) => { const active = item === tab; item.classList.toggle("is-active", active); item.setAttribute("aria-pressed", String(active)); });
    filterQueue();
  }));
  queueSearch?.addEventListener("input", filterQueue);

  const notificationItems = [...document.querySelectorAll(".notification-item")];
  const notificationTabs = [...document.querySelectorAll("[data-notification-filter]")];
  const notificationEmpty = document.querySelector("#notification-empty");
  const updateUnreadCount = () => {
    const count = notificationItems.filter((item) => item.dataset.unread === "true").length;
    const node = document.querySelector("#unread-count");
    if (node) node.textContent = String(count);
  };
  const filterNotifications = () => {
    const active = document.querySelector("[data-notification-filter].is-active")?.dataset.notificationFilter || "all";
    let visible = 0;
    notificationItems.forEach((item) => {
      const matches = active === "all" || (active === "unread" && item.dataset.unread === "true") || item.dataset.category === active;
      item.hidden = !matches;
      if (!item.hidden) visible += 1;
    });
    if (notificationEmpty) notificationEmpty.hidden = visible > 0;
  };
  notificationTabs.forEach((tab) => tab.addEventListener("click", () => {
    notificationTabs.forEach((item) => { const active = item === tab; item.classList.toggle("is-active", active); item.setAttribute("aria-pressed", String(active)); });
    filterNotifications();
  }));
  document.querySelectorAll("[data-mark-read]").forEach((button) => button.addEventListener("click", () => {
    const item = button.closest(".notification-item");
    if (!item || item.dataset.unread !== "true") return;
    item.dataset.unread = "false"; item.classList.remove("is-unread");
    item.querySelector(".notification-dot")?.remove();
    button.replaceWith(Object.assign(document.createElement("span"), { className: "read-label", textContent: "Read" }));
    updateUnreadCount(); filterNotifications();
  }));
  document.querySelector("[data-mark-all]")?.addEventListener("click", () => {
    notificationItems.forEach((item) => {
      if (item.dataset.unread !== "true") return;
      item.dataset.unread = "false"; item.classList.remove("is-unread");
      item.querySelector(".notification-dot")?.remove();
      const button = item.querySelector("[data-mark-read]");
      if (button) button.replaceWith(Object.assign(document.createElement("span"), { className: "read-label", textContent: "Read" }));
    });
    updateUnreadCount(); filterNotifications(); announce("All sample notifications are marked as read in this page preview only.");
  });
  updateUnreadCount(); filterQueue(); filterNotifications();
});