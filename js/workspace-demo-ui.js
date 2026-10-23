"use strict";
window.SMMPageInitializers = window.SMMPageInitializers || {};
window.SMMPageInitializers.workspaceDemo = function () {
  document.querySelectorAll("[data-current-year]").forEach((node) => {
    node.textContent = String(new Date().getFullYear());
  });

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
    queueTabs.forEach((item) => {
      const active = item === tab;
      item.classList.toggle("is-active", active);
      item.setAttribute("aria-pressed", String(active));
    });
    filterQueue();
  }));
  queueSearch?.addEventListener("input", filterQueue);

  const notificationItems = [...document.querySelectorAll(".notification-item")];
  const notificationTabs = [...document.querySelectorAll("[data-notification-filter]")];
  const notificationEmpty = document.querySelector("#notification-empty");
  const unreadCount = document.querySelector("#unread-count");
  const updateUnreadCount = () => {
    // A dash means no notification data has been loaded; do not turn it into a false zero.
    if (!unreadCount || notificationItems.length === 0) return;
    unreadCount.textContent = String(notificationItems.filter((item) => item.dataset.unread === "true").length);
  };
  const filterNotifications = () => {
    const active = document.querySelector("[data-notification-filter].is-active")?.dataset.notificationFilter || "all";
    let visible = 0;
    notificationItems.forEach((item) => {
      const matches = active === "all" ||
        (active === "unread" && item.dataset.unread === "true") ||
        item.dataset.category === active;
      item.hidden = !matches;
      if (!item.hidden) visible += 1;
    });
    if (notificationEmpty) notificationEmpty.hidden = visible > 0;
  };
  notificationTabs.forEach((tab) => tab.addEventListener("click", () => {
    notificationTabs.forEach((item) => {
      const active = item === tab;
      item.classList.toggle("is-active", active);
      item.setAttribute("aria-pressed", String(active));
    });
    filterNotifications();
  }));

  // Read-state mutations require an authenticated API. Keep controls inert until that route exists.
  document.querySelectorAll("[data-mark-read], [data-mark-all]").forEach((button) => {
    button.disabled = true;
    button.setAttribute("aria-disabled", "true");
    button.title = "Available when the authenticated notification service is connected.";
  });

  const approvalRows = [...document.querySelectorAll("[data-approval-row]")];
  const approvalSearch = document.querySelector("#approval-search");
  const approvalEmpty = document.querySelector("#approval-empty");
  const filterApprovals = () => {
    const term = (approvalSearch?.value || "").trim().toLowerCase();
    let visible = 0;
    approvalRows.forEach((row) => {
      row.hidden = !row.textContent.toLowerCase().includes(term);
      if (!row.hidden) visible += 1;
    });
    if (approvalEmpty) approvalEmpty.hidden = visible > 0;
  };
  approvalSearch?.addEventListener("input", filterApprovals);

  updateUnreadCount();
  filterQueue();
  filterNotifications();
  filterApprovals();
};
document.addEventListener("DOMContentLoaded", window.SMMPageInitializers.workspaceDemo);
