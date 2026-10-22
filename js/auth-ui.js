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

  const setFeedback = (form, message, isError = false) => {
    const feedback = form?.querySelector(".form-feedback");
    if (!feedback) return;
    feedback.textContent = message;
    feedback.classList.toggle("is-error", isError);
    feedback.setAttribute("role", isError ? "alert" : "status");
  };
  const captchaTokenFor = (form) => {
    const widget = form.querySelector("[data-captcha-purpose]");
    if (!widget) return "";
    const response = form.querySelector('[name="g-recaptcha-response"]');
    return response && response.value ? response.value : "";
  };
  const fieldsToPayload = (form) => {
    const payload = {};
    new FormData(form).forEach((value, key) => {
      if (key !== "confirm_password" && key !== "terms" && key !== "remember" && key !== "g-recaptcha-response") {
        payload[key] = String(value).trim();
      }
    });
    const password = form.querySelector('[name="password"]');
    if (password) payload.password = password.value;
    const captchaToken = captchaTokenFor(form);
    if (captchaToken) payload.captchaToken = captchaToken;
    return payload;
  };

  document.querySelectorAll("[data-auth-action]").forEach((form) => {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!form.reportValidity()) return;
      const action = form.dataset.authAction;
      const feedback = form.querySelector(".form-feedback");
      const submit = form.querySelector('button[type="submit"]');
      const password = form.querySelector('[name="password"]');
      const confirm = form.querySelector('[name="confirm_password"]');
      if (password && confirm && password.value !== confirm.value) {
        setFeedback(form, "The passwords do not match. Please check both fields.", true);
        confirm.focus();
        return;
      }
      if (form.querySelector("[data-captcha-purpose]") && !captchaTokenFor(form)) {
        setFeedback(form, "Complete the security verification to continue.", true);
        return;
      }
      if (!window.SMMApi || typeof window.SMMApi.request !== "function") {
        setFeedback(form, "The account service is not configured. Your information has not been sent.", true);
        return;
      }
      if (submit) {
        submit.disabled = true;
        submit.setAttribute("aria-busy", "true");
        submit.dataset.originalLabel = submit.textContent;
      }
      if (feedback) feedback.textContent = "Connecting securely…";
      try {
        const result = await window.SMMApi.request(action, fieldsToPayload(form));
        if (result && result.ok) {
          setFeedback(form, result.message || "Request completed.");
          if (action === "register") {
            const email = form.querySelector('[name="email"]')?.value || "";
            window.location.assign("verify-email.html" + (email ? "?email=" + encodeURIComponent(email) : ""));
          } else if (action === "verifyEmail") {
            window.location.assign("approval-pending.html");
          } else if (action === "login") {
            window.location.assign("dashboard.html");
          } else if (action === "requestPasswordReset") {
            setFeedback(form, result.message || "If the account is eligible, recovery instructions will be sent.");
          }
        } else {
          setFeedback(form, result?.message || "The request could not be completed. Please try again.", true);
        }
      } catch (_) {
        setFeedback(form, "The request could not be completed. Please try again later.", true);
      } finally {
        if (submit) {
          submit.disabled = false;
          submit.removeAttribute("aria-busy");
        }
        const captcha = form.querySelector("[data-captcha-purpose]");
        if (captcha && window.grecaptcha && typeof window.grecaptcha.reset === "function") {
          try { window.grecaptcha.reset(); } catch (_) {}
        }
      }
    });
  });

  document.querySelectorAll("[data-auth-resend]").forEach((button) => {
    button.addEventListener("click", async () => {
      const form = button.closest(".auth-card")?.querySelector("[data-auth-action]");
      if (!form) return;
      const email = form.querySelector('[name="email"]')?.value?.trim();
      if (!email) {
        setFeedback(form, "Enter the email address for this account first.", true);
        form.querySelector('[name="email"]')?.focus();
        return;
      }
      if (!window.SMMApi) {
        setFeedback(form, "The account service is not configured. No code was requested.", true);
        return;
      }
      button.disabled = true;
      try {
        const result = await window.SMMApi.request("resendEmailCode", { email, captchaToken: captchaTokenFor(form) });
        setFeedback(form, result.message || (result.ok ? "A new verification code was requested." : "A new code could not be requested."), !result.ok);
      } finally {
        button.disabled = false;
      }
    });
  });
});
