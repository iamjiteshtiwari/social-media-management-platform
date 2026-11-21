# Social Media Management Platform — Frontend Integration Work

A custom, mobile-first social media management platform frontend built with semantic HTML, the project's own CSS design system and vanilla JavaScript. This branch contains isolated frontend integration preparation; it is not the live/default branch.

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

## Current branch status — 21 November 2026

- This branch is 37 commits ahead of JTCodes and has not been merged or deployed.
- The API client permits only the non-sensitive health action. All other actions return AUTH_TRANSPORT_NOT_CONFIGURED before sending a request.
- The API URL remains unset. No credentials, account details or workspace data are sent to an Apps Script endpoint by this branch.
- Forms and workspace actions remain prototype/local-only unless a specific page explicitly reports service unavailability.
- The frontend/backend contract is planning documentation, not an enabled backend API.
- Full browser/device QA and end-to-end tests remain outstanding.

## Safety and implementation rules

- Do not put session credentials, provider tokens, API secrets or trusted user/role IDs in browser code.
- Do not configure an API endpoint or connect protected actions until secure session transport, cross-origin behavior, authorization and response contracts are verified.
- Admin authorization must be enforced server-side; hiding controls is not security.
- Do not claim that local validation, staged media or preview rendering saved data.
- Keep the existing custom CSS and shared components. Do not add Bootstrap or duplicate pages.
- The backend source lives on a separate development branch. Do not merge or deploy this branch without reviewing both frontend and backend contracts.
- The personal portfolio repository remains completely separate.

## Quality assurance

Use docs/visual-prototype-checklist.md for navigation, route refresh, mobile/tablet/desktop, keyboard/accessibility, theme and interaction checks. Use docs/FRONTEND-BACKEND-CONTRACT.md before any API wiring.
