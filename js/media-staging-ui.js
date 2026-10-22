"use strict";
window.SMMPageInitializers = window.SMMPageInitializers || {};
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
  let staged = [];
  const bytesLabel = (bytes) => bytes < 1024 * 1024 ? Math.max(1, Math.round(bytes / 1024)) + " KB" : (bytes / (1024 * 1024)).toFixed(1) + " MB";
  const kindOf = (file) => file.type.startsWith("image/") ? "image" : file.type.startsWith("video/") ? "video" : file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf") ? "document" : "other";
  const matches = (item) => {
    const q = (search?.value || "").trim().toLowerCase();
    const kind = typeFilter?.value || "All files";
    const name = item.file ? item.file.name : item.name;
    const type = item.file ? kindOf(item.file) : item.type;
    return (!q || name.toLowerCase().includes(q)) && (kind === "All files" || (kind === "Images" && type === "image") || (kind === "Videos" && type === "video") || (kind === "Documents" && type === "document"));
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
        img.src = URL.createObjectURL(item.file);
        img.style.cssText = "width:100%;height:100%;object-fit:cover";
        preview.append(img);
      } else {
        const mark = document.createElement("span");
        mark.textContent = item.type === "video" ? "▷" : "▤";
        preview.append(mark);
      }
      const title = document.createElement("strong");
      title.textContent = item.file.name;
      const meta = document.createElement("small");
      meta.textContent = (item.type === "image" ? "Image" : item.type === "video" ? "Video" : "PDF") + " · " + bytesLabel(item.file.size) + " · Local only";
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "button-secondary";
      remove.textContent = "Remove";
      remove.setAttribute("aria-label", "Remove staged file " + item.file.name);
      remove.addEventListener("click", () => {
        staged = staged.filter((entry) => entry.id !== item.id);
        render();
        announce("Removed " + item.file.name + " from this page.");
      });
      card.append(preview, title, meta, remove);
      grid.append(card);
    });
    const count = staged.length;
    if (count && status) status.textContent = count + " file(s) staged locally. Nothing has been uploaded or saved to Google Drive.";
  };
  const announce = (message, isError = false) => {
    if (!status) return;
    status.textContent = message;
    status.classList.toggle("is-error", isError);
  };
  openButton?.addEventListener("click", () => input.click());
  input.addEventListener("change", () => {
    const files = Array.from(input.files || []);
    const accepted = [];
    const rejected = [];
    files.forEach((file) => {
      const type = kindOf(file);
      if (!["image", "video", "document"].includes(type)) rejected.push(file.name + " (unsupported type)");
      else if (file.size > 50 * 1024 * 1024) rejected.push(file.name + " (over 50 MB)");
      else accepted.push({ id: file.name + ":" + file.size + ":" + file.lastModified, file, type });
    });
    const existing = new Set(staged.map((item) => item.id));
    const additions = accepted.filter((item) => !existing.has(item.id));
    staged = staged.concat(additions).slice(0, 100);
    render();
    if (rejected.length) announce("Some files were skipped: " + rejected.slice(0, 3).join(", ") + ". Supported: images, videos and PDF files up to 50 MB.", true);
    else if (staged.length >= 100 && additions.length < accepted.length) announce("A maximum of 100 local files can be staged.", true);
    else if (additions.length) announce(additions.length + " file(s) selected locally. No upload or cloud save occurred.");
    input.value = "";
  });
  search?.addEventListener("input", render);
  typeFilter?.addEventListener("change", render);
  reset?.addEventListener("click", () => {
    if (search) search.value = "";
    if (typeFilter) typeFilter.value = "All files";
    render();
  });
  render();
};
document.addEventListener("DOMContentLoaded", window.SMMPageInitializers.mediaStaging);
