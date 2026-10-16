"use strict";
document.addEventListener("DOMContentLoaded", () => {
  const caption = document.querySelector("#post-caption");
  const captionCount = document.querySelector("#caption-count");
  const previewCaption = document.querySelector("#preview-caption");
  const brand = document.querySelector("#post-brand");
  const platform = document.querySelector("#post-platform");
  const hashtags = document.querySelector("#post-hashtags");
  const feedback = document.querySelector(".post-form .form-feedback");
  const render = () => {
    if (captionCount && caption) captionCount.textContent = String(caption.value.length);
    if (previewCaption && caption) previewCaption.textContent = caption.value.trim() || "Your post caption will appear here as you write.";
    const brandPreview = document.querySelector("#preview-brand");
    if (brandPreview && brand) brandPreview.textContent = brand.value || "Your brand";
    const platformPreview = document.querySelector("#preview-platform");
    if (platformPreview && platform) platformPreview.textContent = platform.value || "Choose a platform";
    const tagsPreview = document.querySelector("#preview-tags");
    if (tagsPreview && hashtags) tagsPreview.textContent = hashtags.value.trim();
  };
  [caption,brand,platform,hashtags].forEach((el) => el?.addEventListener("input", render));
  [brand,platform].forEach((el) => el?.addEventListener("change", render));
  render();
  const form = document.querySelector("[data-post-preview-form]");
  document.querySelectorAll("[data-preview-action]").forEach((button) => {
    button.addEventListener("click", () => {
      if (feedback) {
        feedback.classList.remove("is-error");
        const action = button.dataset.previewAction;
        if (action === "Schedule post") {
          const schedule = document.querySelector("#post-schedule");
          if (!schedule || !schedule.value) {
            feedback.textContent = "Choose a date and time to preview the scheduling step. Nothing has been scheduled.";
            feedback.classList.add("is-error");
            schedule?.focus();
            return;
          }
          const chosen = new Date(schedule.value);
          if (Number.isNaN(chosen.getTime()) || chosen.getTime() <= Date.now()) {
            feedback.textContent = "Choose a future date and time to preview scheduling. Nothing has been scheduled.";
            feedback.classList.add("is-error");
            schedule?.focus();
            return;
          }
          feedback.textContent = "Schedule preview ready for " + chosen.toLocaleString() + ". No post was saved or scheduled.";
        } else if (action === "Save draft") {
          feedback.textContent = "Draft preview updated locally for this page only. No draft was saved.";
        } else {
          feedback.textContent = action + " is a visual prototype. No file was uploaded or connected.";
        }
      }
    });
  });
  if (form) form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (feedback) {
      feedback.classList.remove("is-error");
      feedback.textContent = "Preview updated locally in this page only. No draft was saved or sent to a platform.";
    }
    render();
  });
});
