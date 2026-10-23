"use strict";
document.addEventListener("DOMContentLoaded", () => {
  const form = document.querySelector("[data-preview-settings]");
  if (!form || form.dataset.bound === "true") return;
  form.dataset.bound = "true";
  const feedback = form.querySelector(".form-feedback");
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const name = form.querySelector("#settings-name");
    const username = form.querySelector("#settings-username");
    const email = form.querySelector("#settings-email");
    const phone = form.querySelector("#settings-phone");
    const value = (name?.value || "").trim();
    const userValue = (username?.value || "").trim();
    const emailValue = (email?.value || "").trim();
    if (!value || !userValue || !emailValue) {
      if (feedback) { feedback.classList.add("is-error"); feedback.textContent = "Enter your full name, username and email address before continuing."; }
      (!value ? name : !userValue ? username : email)?.focus();
      return;
    }
    if (email && !email.checkValidity()) {
      if (feedback) { feedback.classList.add("is-error"); feedback.textContent = "Enter a valid email address."; }
      email.focus();
      return;
    }
    if (feedback) {
      feedback.classList.remove("is-error");
      feedback.textContent = "Profile details pass basic validation. They have not been saved because the authenticated profile API and session transport are not connected.";
    }
  });
});
