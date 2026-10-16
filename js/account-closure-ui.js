"use strict";
document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll("[data-current-year]").forEach((node) => { node.textContent = String(new Date().getFullYear()); });
  const form = document.querySelector("#account-closure-form");
  const checkbox = document.querySelector("#closure-understood");
  const confirmation = document.querySelector("#closure-confirmation");
  const submit = document.querySelector("#closure-submit");
  const feedback = document.querySelector("#closure-feedback");
  const updateButton = () => { submit.disabled = !(checkbox.checked && confirmation.value.trim() === "DELETE"); };
  checkbox.addEventListener("change", updateButton);
  confirmation.addEventListener("input", updateButton);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!(checkbox.checked && confirmation.value.trim() === "DELETE")) {
      feedback.textContent = "Review the warning, check the confirmation box and type DELETE exactly.";
      feedback.classList.add("is-error");
      return;
    }
    feedback.classList.remove("is-error");
    feedback.textContent = "Preview only: your closure request was not sent. In the live version, the server must re-authenticate you, record the request, explain any retention period, and revoke sessions according to policy.";
  });
});
