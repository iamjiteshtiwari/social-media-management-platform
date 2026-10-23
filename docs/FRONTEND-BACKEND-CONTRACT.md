# Frontend–Backend Integration Contract (Checkpoint)

Status date: 2026-10-23  
Scope: frontend integration planning only. This document does not enable or change backend routes.

## Safety rules

- The GitHub Pages frontend must not contain secrets, provider tokens, or private session credentials.
- Do not configure `window.SMM_CONFIG.apiUrl` until Apps Script cross-origin transport, authentication, authorization, and response handling have been reviewed.
- Never treat local form validation, staged files, preview rendering, or a browser message as proof that data was saved.
- Do not invent action names or call service functions that are not routed through the approved API.
- Admin actions must require server-side admin authorization. Hiding buttons in the frontend is not authorization.
- Main portfolio repository/site, Apps Script source, Google Sheets/Drive, script properties, OAuth/provider settings, DNS and Pages configuration are outside this frontend PR.

## Latest source checkpoint (2026-10-23)

- `js/api-client.js` now returns `AUTH_TRANSPORT_NOT_CONFIGURED` for every action except `health`, before reading the endpoint or sending a request. This is a fail-closed client-side guard, not a replacement for server-side authorization.
- `js/auth-ui.js` uses neutral account-service availability wording rather than claiming that a secure connection has been established. Its resend-code handler also shows a fallback error if an unexpected exception occurs.
- These changes are on `frontend/app-shell-backend-ready` only. They have not been merged or deployed.
- Source verification confirmed the guard exists. Runtime/browser tests, Apps Script transport checks, and end-to-end authentication tests have not been performed.
- The API URL remains unset. No account data has been sent by this work.

## Confirmed account API action names

The Apps Script API source reviewed for this checkpoint recognizes the following names. Route availability still depends on the server configuration and feature flags.

| Frontend operation | Action name | Request fields currently sent by UI | Confirmed limitation |
|---|---|---|---|
| Health check | `health` | `action` | Health-only GET/POST path; not a substitute for authentication |
| Register | `register` | `full_name`, `username`, `email`, `phone`, `password`, `captchaToken` (when available) | Private `ENABLE_PUBLIC_REGISTRATION=YES` flag required; CAPTCHA must be verified server-side |
| Verify email | `verifyEmail` | `email`, `otp` | Route is gated by registration feature flag |
| Resend email code | `resendEmailCode` | `email`, `captchaToken` (when available) | Route is gated; current UI should only report the server's result |
| Request password reset | `requestPasswordReset` | `email` | Private `ENABLE_PUBLIC_RECOVERY=YES` flag required |
| Reset password | `resetPassword` | Fields depend on recovery form/service contract | Private recovery flag required; confirm exact field names before wiring |
| Login / logout / session / delete own account / admin approval or status changes | Existing names are intentionally blocked with `AUTH_TRANSPORT_NOT_CONFIGURED` | Not applicable | Do not connect until secure session transport and authorization are approved |

The API client currently sends a JSON body using POST and `Content-Type: text/plain;charset=utf-8`. Apps Script cross-origin behavior must be explicitly verified before endpoint configuration.

## Workspace operation matrix

| UI area | Data/schema context | Current frontend state | Required backend readiness before connection |
|---|---|---|---|
| Brands | Per-user `Brands` | Local form validation only; no save | Authenticated list/create/update/archive contract, ownership checks, field constraints and stable response schema |
| Social accounts | `SocialConnections`, `OAuthStates` | Provider options only; no connection action | OAuth initiation/callback, state/CSRF checks, encrypted token storage/refresh and connection status API |
| Content planner | `Posts`, `PostTargets` | Calendar navigation only; no posts loaded | Authenticated post list by date range, pagination/filter contract, timezone rules |
| Post editor | `Posts`, `PostTargets`, `PostMedia`, `MediaLibrary` | Form preview and local file selection only | Draft create/update, target selection, media upload, validation, scheduling contract and idempotency behavior |
| Media library | `MediaLibrary`, Drive media objects | Files staged in browser only | Authenticated upload/list/delete routes, size/type limits, ownership checks, Drive rollback and orphan cleanup behavior |
| Publishing queue | `Posts`, `PostTargets`, `PublishingLogs` | Empty state; no sample records | Authorized queue/status read and approved cancellation/retry/delete semantics; do not equate queued with published |
| Analytics | Publishing/performance records | Empty state; export disabled | Real metric sources, provider availability, time-window/timezone definitions, pagination and export contract |
| Notifications | Notification source/service not yet confirmed | Empty state; read controls disabled | Confirm canonical storage/schema, authenticated list/read APIs, unread-count semantics |
| Account settings | `Users`, `Sessions`, `AuthRecords` | Client-side validation only | Authenticated session lookup, profile update, password/recovery and logout contracts |
| Admin approvals | `Users`, `AuthChallenges`, `AuditLogs` | Empty state; no actions | Separate admin authorization on every request, list/filter contract, approve/reject transitions, audit records and conflict handling |

## Shared response contract to agree before wiring

Use one documented shape consistently, for example:

- Success: `{ "ok": true, "data": { ... }, "requestId": "..." }`
- Failure: `{ "ok": false, "code": "STABLE_MACHINE_CODE", "message": "Safe user-facing message", "requestId": "..." }`

This is a proposed frontend/backend contract, **not a claim about the current Apps Script response format**. Map existing responses explicitly rather than silently assuming this shape.

## Integration order

1. Verify API transport from GitHub Pages to Apps Script without enabling sensitive routes.
2. Approve and test session transport, session expiry, logout, and server-side user/role authorization.
3. Wire account forms to confirmed action payloads and response shapes.
4. Add authenticated read APIs (brands, social connection status, posts, media, queue, notifications).
5. Add mutations only after read contracts and authorization checks are proven.
6. Integrate upload/Drive rollback and publishing operations after focused failure tests pass.
7. Enable analytics/admin workflows only with real data and explicit authorization.

## Current conclusion

The frontend is being made honest and integration-ready, but most workspace APIs are not exposed through the public router. Keep those screens in clear unavailable/empty states until the relevant backend contract is approved and tested.
