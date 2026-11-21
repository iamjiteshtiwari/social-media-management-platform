# Social Media Management Platform — Frontend Integration Work

A custom, mobile-first social media management platform frontend built with semantic HTML, the project's own CSS design system and vanilla JavaScript. This branch contains isolated frontend integration preparation; it is not the live/default branch.

## Repository and branch ownership

- Repository: [iamjiteshtiwari/social-media-management-platform](https://github.com/iamjiteshtiwari/social-media-management-platform)
- This branch: [`frontend/app-shell-backend-ready`](https://github.com/iamjiteshtiwari/social-media-management-platform/tree/frontend/app-shell-backend-ready)
- Default/live branch: [`JTCodes`](https://github.com/iamjiteshtiwari/social-media-management-platform/tree/JTCodes). Do not change or deploy without explicit approval.
- Backend development: [`s4-backend-foundation`](https://github.com/iamjiteshtiwari/social-media-management-platform/tree/s4-backend-foundation).
- Latest backend reconciliation: [`reconcile/latest-test-export-2026-11-21`](https://github.com/iamjiteshtiwari/social-media-management-platform/tree/reconcile/latest-test-export-2026-11-21), pending draft [PR #4](https://github.com/iamjiteshtiwari/social-media-management-platform/pull/4).
- At the 21 November 2026 comparison, this frontend branch was 45 commits ahead and 0 behind JTCodes. It remains isolated, not merged and not deployed.
- Canonical repository branch policy: [`docs/BRANCH-STRATEGY.md`](https://github.com/iamjiteshtiwari/social-media-management-platform/blob/reconcile/latest-test-export-2026-11-21/docs/BRANCH-STRATEGY.md).

## Product workspace

- Dashboard and workspace navigation
- Brand management
- Social account connection screen
- Content planner and post editor
- Media library and local media staging
- Publishing queue and status views
- Analytics, notifications and admin approvals
- Account registration, email verification, recovery and settings screens

The screens establish the product workflow. They do not prove that data is persisted or that a social network is connected.

## Current implementation status — 21 November 2026

- The API client permits only the non-sensitive health action. All other actions return `AUTH_TRANSPORT_NOT_CONFIGURED` before sending a request.
- The API URL remains unset. No credentials, account details or workspace data are sent to an Apps Script endpoint by this branch.
- Forms and workspace actions remain prototype/local-only unless a specific page explicitly reports service unavailability.
- The frontend/backend contract is planning documentation, not an enabled backend API.
- The SPA router initializes the Brands, Content Planner and Media Library page modules on in-app navigation and runs page cleanup before replacing content.
- Media staging matches the backend's current JPEG/PNG/WebP/GIF/MP4/WebM allow-list and 8 MB per-file limit; local preview object URLs are released on removal/navigation.
- Static syntax parsing passed for all 11 JavaScript files on this branch. This does not replace browser/device QA or end-to-end testing.

## Safety and implementation rules

- Do not put session credentials, provider tokens, API secrets or trusted user/role IDs in browser code.
- Do not configure an API endpoint or connect protected actions until secure session transport, cross-origin behavior, authorization and response contracts are verified.
- Admin authorization must be enforced server-side; hiding controls is not security.
- Do not claim that local validation, staged media or preview rendering saved data.
- Keep the existing custom CSS and shared components. Do not add Bootstrap or duplicate pages.
- The backend source lives on a separate development branch. Do not merge or deploy this branch without reviewing both frontend and backend contracts.
- The personal portfolio repository remains completely separate.

## Quality assurance

Use [`docs/visual-prototype-checklist.md`](docs/visual-prototype-checklist.md) for navigation, route refresh, mobile/tablet/desktop, keyboard/accessibility, theme and interaction checks. Use [`docs/FRONTEND-BACKEND-CONTRACT.md`](docs/FRONTEND-BACKEND-CONTRACT.md) before any API wiring.
