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
      const feedback = link.closest(".auth-card")?.querySelector(".form-feedback");
      if (feedback) feedback.textContent = "Password recovery preview: no email is sent and no account is checked.";
    });
  });

  document.querySelectorAll("[data-demo-resend]").forEach((button) => {
    button.addEventListener("click", () => {
      const feedback = button.closest(".auth-card")?.querySelector(".form-feedback");
      if (feedback) {
        feedback.textContent = "Preview only: a new code cannot be sent until email integration is connected.";
        feedback.classList.remove("is-error");
      }
    });
  });

  document.querySelectorAll("[data-demo-form]").forEach((form) => {
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const feedback = form.querySelector(".form-feedback");
      if (!feedback) return;
      feedback.classList.remove("is-error");
      const otp = form.querySelector('[name="otp"]');
      if (otp && !/^[0-9]{6}$/.test(otp.value)) {
        feedback.textContent = "Enter the 6-digit code format to preview this step.";
        feedback.classList.add("is-error");
        otp.focus();
        return;
      }
      const password = form.querySelector('[name="password"]');
      const confirm = form.querySelector('[name="confirm_password"]');
      if (password && confirm && password.value !== confirm.value) {
        feedback.textContent = "The passwords do not match. Please check both fields.";
        feedback.classList.add("is-error");
        confirm.focus();
        return;
      }
      const captcha = form.querySelector("[data-captcha-purpose]");
      const captchaResponse = form.querySelector('[name="g-recaptcha-response"]');
      if (captcha && (!captchaResponse || !captchaResponse.value)) {
        feedback.textContent = "Complete the CAPTCHA to continue this preview. Server-side verification is not connected, and no information will be sent or saved.";
        feedback.classList.add("is-error");
        return;
      }
      if (otp) {
        feedback.textContent = "Design preview only: this code was not verified and no account status was changed.";
      } else if (confirm) {
        feedback.textContent = captcha
          ? "Preview only: CAPTCHA was completed in the browser but not verified by the server. No account was created and no information was sent or saved."
          : "Design preview only: no account was created and no information was sent or saved.";
      } else if (form.querySelector("#recovery-email")) {
        feedback.textContent = "Design preview only: no recovery email was sent and no account was checked.";
      } else {
        feedback.textContent = "Design preview only: sign-in is not connected yet. No information was sent or saved.";
      }
    });
  });
});

