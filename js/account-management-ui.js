"use strict";
document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll("[data-current-year]").forEach((node) => { node.textContent = String(new Date().getFullYear()); });
  const feedback = document.querySelector("#workspace-feedback");
  const modal = document.querySelector("#action-confirmation");
  const title = document.querySelector("#action-confirmation-title");
  const description = document.querySelector("#action-confirmation-description");
  const confirmButton = document.querySelector("#confirm-member-action");
  let pending = null;
  const states = {
    active: { label: "Active", className: "status-pill--green", confirm: "Reactivate this sample account?", description: "This preview will mark the sample account active. In production, access should only return after server-side authorization checks." },
    suspended: { label: "Suspended", className: "status-pill--red", confirm: "Suspend this sample account?", description: "In production, suspension must block protected access and revoke active sessions." },
    disabled: { label: "Disabled", className: "status-pill--red", confirm: "Disable this sample account?", description: "In production, disabling must block sign-in until an authorized administrator reactivates the account." },
    deletion_pending: { label: "Deletion pending", className: "status-pill--blue", confirm: "Request account closure?", description: "In production, this should start the documented deletion and retention process—not immediately erase data." },
    deleted: { label: "Closed in preview", className: "status-pill--red", confirm: "Confirm account closure?", description: "This preview will mark the sample closed. A live implementation must verify authorization, revoke sessions, anonymize/delete according to policy, and audit the action." }
  };
  const updateCounts = () => {
    const rows = [...document.querySelectorAll("[data-member-row]")];
    const count = (status) => rows.filter((row) => row.dataset.status === status).length;
    document.querySelector("#count-active").textContent = String(count("active"));
    document.querySelector("#count-restricted").textContent = String(count("suspended") + count("disabled"));
    document.querySelector("#count-deletion").textContent = String(count("deletion_pending"));
    document.querySelector("#count-deleted").textContent = String(count("deleted"));
  };
  const closeModal = () => { modal.hidden = true; pending = null; };
  document.querySelectorAll("[data-confirm-cancel]").forEach((button) => button.addEventListener("click", closeModal));
  document.querySelectorAll("[data-member-action]").forEach((button) => button.addEventListener("click", () => {
    const row = button.closest("[data-member-row]");
    const next = states[button.dataset.memberAction];
    if (!row || !next) return;
    pending = { row, status: button.dataset.memberAction, next };
    title.textContent = next.confirm;
    description.textContent = next.description;
    confirmButton.textContent = pending.status === "deleted" ? "Confirm closure (preview)" : "Confirm (preview only)";
    modal.hidden = false;
    modal.querySelector(".action-confirmation__dialog").focus();
  }));
  confirmButton.addEventListener("click", () => {
    if (!pending) return;
    const { row, status, next } = pending;
    row.dataset.status = status;
    const label = row.querySelector("[data-status-label]");
    label.textContent = next.label;
    label.className = "status-pill " + next.className;
    const name = row.querySelector("td strong")?.textContent || "Sample member";
    row.querySelector("td:last-child").innerHTML = status === "deleted"
      ? '<span class="status-pill status-pill--red">Closed in preview</span>'
      : status === "deletion_pending"
        ? '<button type="button" class="button-secondary" data-member-action="active">Cancel request</button><button type="button" class="button-danger" data-member-action="deleted">Confirm closure</button>'
        : status === "active"
          ? '<button type="button" class="button-secondary" data-member-action="suspended">Suspend</button><button type="button" class="button-secondary" data-member-action="disabled">Disable</button><button type="button" class="button-secondary" data-member-action="deletion_pending">Request deletion</button>'
          : '<button type="button" class="button-secondary" data-member-action="active">Reactivate</button><button type="button" class="button-secondary" data-member-action="deletion_pending">Request deletion</button>';
    closeModal();
    feedback.textContent = name + " is now marked " + next.label.toLowerCase() + " in this visual preview only. No backend action occurred.";
    // Rebind controls on the changed row only.
    row.querySelectorAll("[data-member-action]").forEach((actionButton) => actionButton.addEventListener("click", () => {
      const state = states[actionButton.dataset.memberAction];
      if (!state) return;
      pending = { row, status: actionButton.dataset.memberAction, next: state };
      title.textContent = state.confirm;
      description.textContent = state.description;
      confirmButton.textContent = pending.status === "deleted" ? "Confirm closure (preview)" : "Confirm (preview only)";
      modal.hidden = false;
      modal.querySelector(".action-confirmation__dialog").focus();
    }));
    updateCounts();
  });
  document.querySelector("#member-search")?.addEventListener("input", (event) => {
    const term = event.target.value.trim().toLowerCase();
    const rows = [...document.querySelectorAll("[data-member-row]")];
    let visible = 0;
    rows.forEach((row) => { row.hidden = !row.textContent.toLowerCase().includes(term); if (!row.hidden) visible += 1; });
    document.querySelector("#member-empty").hidden = visible > 0;
  });
  updateCounts();
});
