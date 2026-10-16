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
  if (form) form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (feedback) {
      feedback.classList.remove("is-error");
      feedback.textContent = "Preview updated locally in this page only. No draft was saved or sent to a platform.";
    }
    render();
  });
});
