"use strict";
document.addEventListener("DOMContentLoaded", () => {
  const form = document.querySelector("[data-preview-settings]");
  if (!form) return;
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const feedback = form.querySelector(".form-feedback");
    if (feedback) {
      feedback.classList.remove("is-error");
      feedback.textContent = "Preview only: profile changes were not saved because no account is signed in.";
    }
  });
});
