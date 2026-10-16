"use strict";
document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll("[data-current-year]").forEach((node) => { node.textContent = String(new Date().getFullYear()); });
  document.querySelectorAll("[data-password-toggle]").forEach((button) => {
    button.addEventListener("click", () => {
      const input = document.getElementById(button.dataset.passwordToggle);
      if (!input) return;
      const show = input.type === "password";
      input.type = show ? "text" : "password";
      button.textContent = show ? "Hide" : "Show";
      button.setAttribute("aria-label", show ? "Hide password" : "Show password");
    });
  });
  document.querySelectorAll("[data-demo-link]").forEach((link) => {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      const form = link.closest("form");
      const feedback = form && form.querySelector(".form-feedback");
      if (feedback) feedback.textContent = "Password recovery will be available after backend integration.";
    });
  });
  document.querySelectorAll("[data-demo-form]").forEach((form) => {
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const feedback = form.querySelector(".form-feedback");
      if (!feedback) return;
      feedback.classList.remove("is-error");
      const password = form.querySelector('[name="password"]');
      const confirm = form.querySelector('[name="confirm_password"]');
      if (password && confirm && password.value !== confirm.value) {
        feedback.textContent = "The passwords do not match. Please check both fields.";
        feedback.classList.add("is-error");
        confirm.focus();
        return;
      }
      feedback.textContent = form.querySelector('[name="confirm_password"]')
        ? "Design preview only: no account was created and no information was sent or saved."
        : "Design preview only: sign-in is not connected yet. No information was sent or saved.";
    });
  });
});
