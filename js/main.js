/*
 * Frontend foundation only.
 * Do not place credentials, session tokens, or provider secrets in this file.
 * Protected operations must be authenticated and authorized by the backend.
 */
"use strict";

document.addEventListener("DOMContentLoaded", () => {
  const status = document.querySelector("#app-status");
  if (status) status.textContent = "Frontend scaffold loaded";
});
