# Social Media Management Platform

A custom, mobile-first social media management platform using the existing HTML, CSS and vanilla JavaScript frontend with a Google Apps Script + Google Sheets + Google Drive backend.

The product goal is to manage brands and social accounts, prepare content, organize media, schedule posts, monitor publishing status and eventually publish to supported social networks. This repository is a development project, not a production-ready service.

## Current project checkpoint — 21 November 2026

- **Default/live branch:** `JTCodes`. It serves the current GitHub Pages frontend. Do not use it for unreviewed work.
- **Frontend integration branch:** `frontend/app-shell-backend-ready`. Isolated frontend improvements and backend-ready UI work; not merged or deployed. API client fails closed for all non-health actions.
- **Backend development branch:** `s4-backend-foundation`. Backend foundation and modular Apps Script source.
- **Backend reconciliation branch:** `reconcile/latest-test-export-2026-11-21`. Contains the latest TEST-export reconciliation. It is ahead of `s4-backend-foundation` and not behind it, and is the source branch of draft PR #4. It is not merged.
- **Draft PR #4:** [Reconcile Apps Script backend with latest TEST export](https://github.com/iamjiteshtiwari/social-media-management-platform/pull/4). Review target is `s4-backend-foundation`; keep draft/unmerged until manual TEST verification and review are complete.
- **Historical branches:** `spa-navigation-poc` was merged into `JTCodes` (merge commit `7c9f5fe`) and is 3 commits behind; `fix/post-editor-media-feedback` is 1 commit behind; `test/media-delete-drive-trash-failure` is a one-commit test-only branch based on the backend line and is superseded by the corrected test in PR #4. Preserve these branches as history; do not continue work on them.
- **Repository branch policy and exact links:** [docs/BRANCH-STRATEGY.md](docs/BRANCH-STRATEGY.md).

## Implementation status

- Frontend: the default branch contains the deployed static workspace prototype and SPA navigation. Screens are not evidence that accounts, uploads, social connections or publishing are live.
- Frontend integration: isolated work remains on `frontend/app-shell-backend-ready`; no merge or deployment has been performed.
- Backend: the reconciled branch contains 41 Apps Script export entries; 40 match the supplied export and one regression test has an intentional correction: Drive-trash failure must leave the media row `trash_pending`, not `available`.
- Static checks: JavaScript syntax parsing passed for all 40 `.gs` files and the Apps Script manifest JSON parsed. These checks are not Apps Script runtime verification.
- Runtime status: manual execution of `testMediaDeleteDriveTrashFailure()` in the isolated `SMM Operations TEST` Apps Script project is still pending. GitHub does not sync Apps Script automatically.
- Production blockers: secure browser session transport and Master-to-Operations authorization are unresolved. Complete Meta OAuth callback/token lifecycle and a live provider adapter are not implemented. Publishing remains mock-only. Public login/session/admin routes and automatic publishing are disabled.

## Approved architecture

- Frontend: static HTML, custom CSS and vanilla JavaScript. No Bootstrap or unnecessary frontend framework.
- Master ownership: personal Google account; intended authority for users, account status, sessions, roles, resource mappings, social-connection metadata and audit metadata.
- Operations ownership: work Google account; intended owner of per-user brands, posts, targets, media metadata and operational records.
- Storage/services: Google Sheets for structured records, Google Drive for media, Apps Script for server-side logic.
- Operations must not trust browser-supplied user IDs or roles. A secure Master-to-Operations authorization contract must be designed and verified before protected operations are exposed.

The two ownership domains are an approved architecture direction, not a completed or runtime-verified inter-script integration. Do not assume two Apps Script projects automatically double quotas.

## Key documentation

- [Branch strategy and branch registry](docs/BRANCH-STRATEGY.md)
- [Architecture](docs/architecture.md)
- [Authentication backend contract](docs/authentication-backend-contract.md)
- [Backend runtime and internal API contract](docs/backend-runtime-and-internal-api-contract.md)
- [Frontend–Backend integration contract](docs/FRONTEND-BACKEND-CONTRACT.md) (on the isolated frontend branch)
- [Apps Script backend guide](backend/apps-script/README.md)
- [Google-only TEST setup checklist](backend/apps-script/GOOGLE-ONLY-SETUP-CHECKLIST.md)

## Safety boundaries

- The personal portfolio website and repository are separate and out of scope.
- Use only TEST workbooks and synthetic records for backend verification.
- Keep `ENABLE_MEDIA_CLEANUP` disabled.
- Do not enable public login/session routes, triggers, provider calls or real publishing.
- Never commit Script Properties, passwords, OTPs, session credentials, CAPTCHA secrets or social tokens.
- Do not merge or deploy to `JTCodes` without explicit user approval.
