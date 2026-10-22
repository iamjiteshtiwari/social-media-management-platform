"use strict";
window.SMMPageInitializers = window.SMMPageInitializers || {};
window.SMMPageInitializers.postEditor = function () {
  const caption = document.querySelector("#post-caption");
  const captionCount = document.querySelector("#caption-count");
  const previewCaption = document.querySelector("#preview-caption");
  const brand = document.querySelector("#post-brand");
  const platform = document.querySelector("#post-platform");
  const hashtags = document.querySelector("#post-hashtags");
  const feedback = document.querySelector(".post-form .form-feedback");
  const mediaInput = document.querySelector("#post-media-input");
  const mediaSelection = document.querySelector("#post-media-selection");
  const mediaPreview = document.querySelector(".social-preview-media");
  const mediaButton = document.querySelector("[data-open-media-picker]");
  const scheduleInput = document.querySelector("#post-schedule");
  const requestedDate = new URLSearchParams(window.location.search).get("scheduledAt");
  if (scheduleInput && requestedDate && /^\\d{4}-\\d{2}-\\d{2}$/.test(requestedDate)) {
    const date = new Date(requestedDate + "T09:00:00");
    if (!Number.isNaN(date.getTime())) {
      const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
      scheduleInput.value = local.toISOString().slice(0, 16);
    }
  }
  let selectedFiles = [];
  if (feedback) {
    feedback.textContent = "";
    feedback.classList.remove("is-error");
  }
  const setFeedback = (message, isError = false) => {
    if (!feedback) return;
    feedback.textContent = message;
    feedback.classList.toggle("is-error", isError);
    feedback.setAttribute("role", isError ? "alert" : "status");
  };
  const formatSize = (bytes) => bytes < 1024 * 1024 ? Math.max(1, Math.round(bytes / 1024)) + " KB" : (bytes / (1024 * 1024)).toFixed(1) + " MB";
  const renderMedia = () => {
    if (mediaSelection) {
      mediaSelection.replaceChildren();
      if (!selectedFiles.length) {
        const note = document.createElement("p");
        note.className = "form-help";
        note.textContent = "Files are selected locally only. They are not uploaded or saved.";
        mediaSelection.append(note);
      } else {
        const heading = document.createElement("p");
        heading.className = "form-help";
        heading.textContent = selectedFiles.length + " file(s) selected on this device";
        mediaSelection.append(heading);
        selectedFiles.forEach((file, index) => {
          const row = document.createElement("div");
          row.className = "selected-media-row";
          const details = document.createElement("span");
          details.className = "selected-media-row__details";
          const name = document.createElement("strong");
          name.textContent = file.name;
          const meta = document.createElement("small");
          meta.textContent = (file.type.startsWith("video/") ? "Video" : "Image") + " · " + formatSize(file.size);
          details.append(name, meta);
          const remove = document.createElement("button");
          remove.type = "button";
          remove.className = "button-secondary selected-media-remove";
          remove.textContent = "Remove";
          remove.setAttribute("aria-label", "Remove " + file.name);
          remove.addEventListener("click", () => {
            selectedFiles.splice(index, 1);
            renderMedia();
          });
          row.append(details, remove);
          mediaSelection.append(row);
        });
      }
    }
    if (mediaPreview) {
      mediaPreview.replaceChildren();
      if (selectedFiles.length && selectedFiles[0].type.startsWith("image/")) {
        const img = document.createElement("img");
        img.alt = "Selected local media preview";
        img.className = "social-preview-media__image";
        img.src = URL.createObjectURL(selectedFiles[0]);
        mediaPreview.append(img);
        const label = document.createElement("small");
        label.textContent = selectedFiles.length > 1 ? selectedFiles.length + " files selected locally" : selectedFiles[0].name;
        mediaPreview.append(label);
      } else {
        const mark = document.createElement("span");
        mark.setAttribute("aria-hidden", "true");
        mark.textContent = selectedFiles.length ? "▷" : "▧";
        const title = document.createElement("p");
        title.textContent = selectedFiles.length ? selectedFiles.length + " local video/image file(s)" : "Media preview area";
        const note = document.createElement("small");
        note.textContent = selectedFiles.length ? "Not uploaded" : "No file selected";
        mediaPreview.append(mark, title, note);
      }
    }
  };
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
  [caption, brand, platform, hashtags].forEach((el) => el?.addEventListener("input", render));
  [brand, platform].forEach((el) => el?.addEventListener("change", render));
  mediaButton?.addEventListener("click", () => mediaInput?.click());
  mediaInput?.addEventListener("change", () => {
    const incoming = Array.from(mediaInput.files || []);
    const allowed = incoming.filter((file) => /^(image|video)\//.test(file.type));
    const tooLarge = allowed.filter((file) => file.size > 50 * 1024 * 1024);
    const accepted = allowed.filter((file) => file.size <= 50 * 1024 * 1024);
    const existing = new Set(selectedFiles.map((file) => file.name + ":" + file.size + ":" + file.lastModified));
    const additions = accepted.filter((file) => !existing.has(file.name + ":" + file.size + ":" + file.lastModified));
    selectedFiles = selectedFiles.concat(additions).slice(0, 10);
    if (incoming.length !== accepted.length || tooLarge.length) {
      setFeedback("Only image/video files up to 50 MB each are accepted. Up to 10 files can be staged. Check the selected files.", true);
    } else if (selectedFiles.length === 10 && additions.length < accepted.length) {
      setFeedback("A maximum of 10 media files can be staged.", true);
    } else if (additions.length) {
      setFeedback("Media selected on this device. Nothing has been uploaded or saved.");
    }
    mediaInput.value = "";
    renderMedia();
  });
  render();
  renderMedia();
  const form = document.querySelector("[data-post-preview-form]");
  document.querySelectorAll("[data-preview-action]").forEach((button) => {
    button.addEventListener("click", () => {
      const action = button.dataset.previewAction;
      if (action === "Schedule post") {
        const schedule = document.querySelector("#post-schedule");
        if (!schedule || !schedule.value) {
          setFeedback("Choose a date and time to prepare a scheduling request. Nothing has been scheduled.", true);
          schedule?.focus();
          return;
        }
        const chosen = new Date(schedule.value);
        if (Number.isNaN(chosen.getTime()) || chosen.getTime() <= Date.now()) {
          setFeedback("Choose a future date and time. Nothing has been scheduled.", true);
          schedule?.focus();
          return;
        }
        setFeedback("Post details are ready for backend integration (" + chosen.toLocaleString() + "). Nothing has been saved or scheduled.");
      } else if (action === "Save draft") {
        setFeedback("Draft content is currently in this page only. Connect the approved drafts API to save it.");
      } else if (action === "Media picker") {
        mediaInput?.click();
      } else {
        setFeedback(action + " is not connected to a backend service yet.", true);
      }
    });
  });
  if (form) form.addEventListener("submit", (event) => {
    event.preventDefault();
    render();
    setFeedback("Post preview updated. Your content and selected files remain in this page only; no draft was saved or sent.");
  });
};
document.addEventListener("DOMContentLoaded", window.SMMPageInitializers.postEditor);
