/*
 * Frontend foundation only.
 * Do not place credentials, session tokens, or provider secrets in this file.
 * Protected operations must be authenticated and authorized by the backend.
 */
"use strict";

document.addEventListener("DOMContentLoaded", () => {
  const status = document.querySelector("#app-status");
  if (status) status.textContent = "Frontend scaffold loaded";

  const menuButton = document.querySelector(".menu-toggle");
  const workspaceNav = document.querySelector("#workspace-navigation");

  if (menuButton && workspaceNav) {
    menuButton.addEventListener("click", () => {
      const isOpen = menuButton.getAttribute("aria-expanded") === "true";
      menuButton.setAttribute("aria-expanded", String(!isOpen));
      menuButton.setAttribute("aria-label", isOpen ? "Open workspace menu" : "Close workspace menu");
      workspaceNav.classList.toggle("is-open", !isOpen);
    });

    workspaceNav.querySelectorAll("a").forEach((link) => {
      link.addEventListener("click", () => {
        menuButton.setAttribute("aria-expanded", "false");
        menuButton.setAttribute("aria-label", "Open workspace menu");
        workspaceNav.classList.remove("is-open");
        workspaceNav.querySelectorAll("a").forEach((item) => {
          if (item === link) item.setAttribute("aria-current", "page");
          else item.removeAttribute("aria-current");
        });
      });
    });

    const closeWorkspaceMenu = () => {
      menuButton.setAttribute("aria-expanded", "false");
      menuButton.setAttribute("aria-label", "Open workspace menu");
      workspaceNav.classList.remove("is-open");
    };

    document.addEventListener("click", (event) => {
      if (!workspaceNav.classList.contains("is-open")) return;
      if (!menuButton.contains(event.target) && !workspaceNav.contains(event.target)) {
        closeWorkspaceMenu();
      }
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && workspaceNav.classList.contains("is-open")) {
        closeWorkspaceMenu();
        menuButton.focus();
      }
    });

    window.addEventListener("resize", () => {
      if (window.matchMedia("(min-width: 761px)").matches) closeWorkspaceMenu();
    });
  }
  const accountButton = document.querySelector(".account-icon-link");
  const accountPopover = document.querySelector("#account-options");

  if (accountButton && accountPopover) {
    const closeAccountPopover = (restoreFocus = false) => {
      accountPopover.hidden = true;
      accountButton.setAttribute("aria-expanded", "false");
      if (restoreFocus) accountButton.focus();
    };

    const openAccountPopover = () => {
      accountPopover.hidden = false;
      accountButton.setAttribute("aria-expanded", "true");
    };

    accountButton.addEventListener("click", (event) => {
      event.preventDefault();
      const shouldOpen = accountPopover.hidden;
      if (shouldOpen) openAccountPopover();
      else closeAccountPopover();
    });

    document.addEventListener("click", (event) => {
      if (accountPopover.hidden) return;
      if (!accountPopover.contains(event.target) && !accountButton.contains(event.target)) {
        closeAccountPopover();
      }
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !accountPopover.hidden) closeAccountPopover(true);
    });

    accountPopover.querySelectorAll("a").forEach((link) => {
      link.addEventListener("click", () => closeAccountPopover());
    });
  }

  const destinationModal = document.querySelector("#destination-choice");
  const brandLink = document.querySelector(".site-brand");

  if (destinationModal && brandLink) {
    const dialog = destinationModal.querySelector('[role="dialog"]');
    const closeButtons = destinationModal.querySelectorAll("[data-destination-close]");
    let previousFocus = null;

    const closeDestinationModal = () => {
      destinationModal.hidden = true;
      destinationModal.setAttribute("aria-hidden", "true");
      document.body.classList.remove("modal-open");
      if (previousFocus && typeof previousFocus.focus === "function") previousFocus.focus();
    };

    const openDestinationModal = (event) => {
      event.preventDefault();
      previousFocus = brandLink;
      destinationModal.hidden = false;
      destinationModal.setAttribute("aria-hidden", "false");
      document.body.classList.add("modal-open");
      if (dialog) dialog.focus();
    };

    destinationModal.hidden = true;
    destinationModal.setAttribute("aria-hidden", "true");
    brandLink.addEventListener("click", openDestinationModal);

    closeButtons.forEach((button) => button.addEventListener("click", closeDestinationModal));

    destinationModal.addEventListener("click", (event) => {
      if (event.target === destinationModal) closeDestinationModal();
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !destinationModal.hidden) closeDestinationModal();
    });
  }

  const year = document.querySelector("#current-year");
  if (year) year.textContent = String(new Date().getFullYear());
});
