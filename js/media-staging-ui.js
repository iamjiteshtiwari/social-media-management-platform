"use strict";
window.SMMPageInitializers = window.SMMPageInitializers || {};
window.SMMPageCleanups = window.SMMPageCleanups || {};
window.SMMPageInitializers.mediaStaging = function () {
  const input = document.querySelector("#media-upload-input");
  const openButton = document.querySelector("[data-open-media-library-picker]");
  const grid = document.querySelector("#media-library-grid");
  const status = document.querySelector("#media-library-status");
  const search = document.querySelector("#media-search");
  const typeFilter = document.querySelector("#media-type");
  const reset = document.querySelector("[data-reset-media-filters]");
  if (!input || !grid || input.dataset.bound === "true") return;
  input.dataset.bound = "true";

  const MAX_FILE_BYTES = 8 * 1024 * 1024;
  const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
  const VIDEO_TYPES = new Set(["video/mp4", "video/webm"]);
  let staged = [];

  const fileId = (file) => file.name + ":" + file.size + ":" + file.lastModified;
  const kindOf = (file) => IMAGE_TYPES.has(file.type) ? "image" : VIDEO_TYPES.has(file.type) ? "video" : "other";
  const bytesLabel = (bytes) => bytes < 1024 * 1024
    ? Math.max(1, Math.round(bytes / 1024)) + " KB"
    : (bytes / (1024 * 1024)).toFixed(1) + " MB";
  const announce = (message, isError = false) => {
    if (!status) return;
    status.textContent = message;
    status.classList.toggle("is-error", isError);
  };
  const revokePreview = (item) => {
    if (item.previewUrl) {
      URL.revokeObjectURL(item.previewUrl);
      item.previewUrl = "";
    }
  };
  const matches = (item) => {
    const q = (search?.value || "").trim().toLowerCase();
    const kind = typeFilter?.value || "All files";
    return (!q || item.file.name.toLowerCase().includes(q)) &&
      (kind === "All files" || (kind === "Images" && item.type === "image") ||
       (kind === "Videos" && item.type === "video"));
  };
  const render = () => {
    grid.querySelectorAll("[data-staged-media]").forEach((node) => node.remove());
    staged.filter(matches).forEach((item) => {
      const card = document.createElement("article");
      card.className = "media-library-item";
      card.dataset.mediaType = item.type;
      card.dataset.stagedMedia = "true";
      const preview = document.createElement("div");
      preview.className = "media-file-preview";
      if (item.type === "image") {
        const img = document.createElement("img");
        img.alt = "Local preview of " + item.file.name;
        img.loading = "lazy";
        img.src = item.previewUrl;
        img.style.cssText = "width:100%;height:100%;object-fit:cover";
        preview.append(img);
      } else {
        const mark = document.createElement("span");
        mark.textContent = "▷";
        preview.append(mark);
      }
      const title = document.createElement("strong");
      title.textContent = item.file.name;
      const meta = document.createElement("small");
      meta.textContent = (item.type === "image" ? "Image" : "Video") +
        " · " + bytesLabel(item.file.size) + " · Local only";
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "button-secondary";
      remove.textContent = "Remove";
      remove.setAttribute("aria-label", "Remove staged file " + item.file.name);
      remove.addEventListener("click", () => {
        staged = staged.filter((entry) => entry.id !== item.id);
        revokePreview(item);
        render();
        announce("Removed " + item.file.name + " from this page.");
      });
      card.append(preview, title, meta, remove);
      grid.append(card);
    });
    if (staged.length && status) {
      status.textContent = staged.length +
        " file(s) staged locally. Nothing has been uploaded or saved to Google Drive.";
    }
  };

  openButton?.addEventListener("click", () => input.click());
  input.addEventListener("change", () => {
    const files = Array.from(input.files || []);
    const additions = [];
    const rejected = [];
    const known = new Set(staged.map((item) => item.id));

    files.forEach((file) => {
      const type = kindOf(file);
      if (type === "other") rejected.push(file.name + " (unsupported file type)");
      else if (file.size > MAX_FILE_BYTES) rejected.push(file.name + " (over 8 MB)");
      else {
        const id = fileId(file);
        if (!known.has(id)) {
          known.add(id);
          additions.push({ id, file, type });
        }
      }
    });

    const availableSlots = Math.max(0, 100 - staged.length);
    const accepted = additions.slice(0, availableSlots);
    accepted.forEach((item) => {
      item.previewUrl = item.type === "image" ? URL.createObjectURL(item.file) : "";
    });
    staged = staged.concat(accepted);

    if (additions.length > availableSlots) {
      rejected.push((additions.length - availableSlots) + " file(s) (100-file staging limit)");
    }

    render();
    if (rejected.length) {
      announce("Some files were skipped: " + rejected.slice(0, 3).join(", ") +
        ". Supported: JPEG, PNG, WebP, GIF, MP4 and WebM up to 8 MB each.", true);
    } else if (accepted.length) {
      announce(accepted.length + " file(s) selected locally. No upload or cloud save occurred.");
    }
    input.value = "";
  });

  search?.addEventListener("input", render);
  typeFilter?.addEventListener("change", render);
  reset?.addEventListener("click", () => {
    if (search) search.value = "";
    if (typeFilter) typeFilter.value = "All files";
    render();
  });

  window.SMMPageCleanups.mediaStaging = () => {
    staged.forEach(revokePreview);
    staged = [];
  };
  render();
};
document.addEventListener("DOMContentLoaded", window.SMMPageInitializers.mediaStaging);
