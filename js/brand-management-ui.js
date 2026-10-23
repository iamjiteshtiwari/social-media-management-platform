"use strict";
window.SMMPageInitializers = window.SMMPageInitializers || {};
window.SMMPageInitializers.brandManagement = function () {
  const card = document.querySelector("#brand-form-card");
  const form = document.querySelector("#brand-create-form");
  const feedback = document.querySelector("#brand-form-feedback");
  const name = document.querySelector("#brand-name");
  const open = () => { if (card) card.hidden = false; name?.focus(); };
  const close = () => { if (card) card.hidden = true; if (form) form.reset(); if (feedback) feedback.textContent = ""; };
  document.querySelectorAll("[data-open-brand-form]").forEach((button) => button.addEventListener("click", open));
  document.querySelector("[data-close-brand-form]")?.addEventListener("click", close);
  form?.addEventListener("submit", (event) => {
    event.preventDefault();
    const value = (name?.value || "").trim();
    if (!value) {
      if (feedback) { feedback.textContent = "Enter a brand name to continue."; feedback.classList.add("is-error"); }
      name?.focus();
      return;
    }
    if (feedback) {
      feedback.classList.remove("is-error");
      feedback.textContent = "Brand details are valid for integration. No brand record has been created or saved because the authorized brand API is not available yet.";
    }
  });
};
document.addEventListener("DOMContentLoaded", window.SMMPageInitializers.brandManagement);
