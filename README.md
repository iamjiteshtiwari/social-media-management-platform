# Social Media Management Platform

A custom, mobile-first social media management platform built with the project's existing HTML, CSS and vanilla JavaScript frontend and a Google Apps Script + Google Sheets + Google Drive backend.

The product goal is to let users manage brands and social accounts, prepare content, organize media, schedule posts, monitor publishing status and eventually publish to supported social networks. The current repository is a development project; source code and prototypes must not be confused with a production-ready service.

## Product direction

1. Keep the frontend custom-coded, mobile-first and framework-light. Do not add Bootstrap or duplicate page implementations.
2. Keep Google Apps Script, Sheets and Drive as the approved first backend architecture, with separate Master and Operations ownership domains.
3. Complete backend reliability, authorization and secure session transport before connecting protected frontend actions.
4. Integrate Facebook Pages and Instagram account connection after the security and OAuth prerequisites are satisfied.
5. Add real publishing only after connection, provider permissions, idempotency and failure recovery are verified.

## Current implementation status — 21 November 2026

- Frontend: the default JTCodes branch contains the deployed static workspace prototype and SPA navigation. The screens are not evidence that accounts, uploads, social connections or publishing are live.
- Frontend integration work: frontend/app-shell-backend-ready contains a separate integration-ready frontend line. Its API client fails closed for non-health actions until secure transport is approved. It is not merged into JTCodes.
- Backend: s4-backend-foundation contains the Apps Script foundation. The reconcile/latest-test-export-2026-11-21 branch aligns its 41 Apps Script export files with the latest user-supplied TEST export; the Drive-trash failure test has one deliberate expectation correction documented in the handover.
- Runtime status: source syntax checks passed for all 40 .gs files; the Apps Script manifest JSON also parsed successfully. This is not an Apps Script runtime test, security audit or production sign-off. Some focused tests have previously passed in isolated TEST workbooks; each latest source change still requires its relevant TEST verification.
- Not ready for production: secure browser session transport and Master-to-Operations authorization are unresolved. The complete Meta OAuth callback/token lifecycle and real provider adapter are not implemented. Publishing is mock-only. Public login/session/admin routes and automatic publishing are disabled.

## Architecture

- Frontend: static HTML, custom CSS and vanilla JavaScript.
- Master ownership: personal Google account; intended authority for users, account status, sessions, roles, resource mappings, social-connection metadata and audit metadata.
- Operations ownership: work Google account; intended owner of per-user brands, posts, targets, media metadata and operational records.
- Storage and services: Google Sheets for structured records, Google Drive for media, Apps Script for server-side logic.
- Authorization rule: Operations must not trust browser-supplied user IDs or roles. A secure Master-to-Operations authorization contract must be designed and verified before protected operations are exposed.

The two ownership domains are an approved architecture direction, not a completed or runtime-verified inter-script integration. Do not assume that two Apps Script projects automatically double quotas.

## Repository branches

- JTCodes — default/live frontend branch. Do not use it for unreviewed backend changes.
- frontend/app-shell-backend-ready — isolated frontend integration work; not merged.
- s4-backend-foundation — backend development line.
- reconcile/latest-test-export-2026-11-21 — isolated branch reconciling Apps Script source against the latest TEST export. Review before merging into the backend development line.

These branches have different histories. Compare them and review a pull request; do not merge them wholesale or assume they are interchangeable.

## Safety boundaries

- The personal portfolio website and repository are separate and out of scope.
- Use TEST workbooks and synthetic records for backend verification.
- Keep ENABLE_MEDIA_CLEANUP unset/disabled.
- Do not enable public login/session routes, triggers, provider calls or real publishing.
- Do not commit Script Properties, passwords, OTPs, session credentials, CAPTCHA secrets or social tokens.
- Do not deploy or merge to the live/default branch without explicit approval.

## Documentation

- Architecture and security boundaries: docs/architecture.md
- Authentication backend contract: docs/authentication-backend-contract.md
- Backend runtime and internal API contract: docs/backend-runtime-and-internal-api-contract.md
- Visual prototype checklist: docs/visual-prototype-checklist.md
- Apps Script backend guide: backend/apps-script/README.md
- Google-only TEST setup checklist: backend/apps-script/GOOGLE-ONLY-SETUP-CHECKLIST.md
