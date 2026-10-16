# Authentication Backend Contract and Implementation Status

## Status and boundaries

The account modules now exist as source code on `s4-backend-foundation`, but are not deployed and no real account data is being processed. Registration/OTP and recovery routes are behind private feature flags; login/session/admin routes remain disabled at the API boundary until session-token generation and browser transport are resolved. Do not connect the static forms to a production backend before those gates are closed.

- Frontend: static HTML, custom CSS, vanilla JavaScript.
- Backend candidate: Google Apps Script web app.
- Data candidate: Google Sheets for records; Script Properties only for small configuration values and carefully scoped server-side metadata.
- The main portfolio site and repository are outside scope and must remain untouched.
- Budget target: ₹0/month where feasible. Free quotas are limits, not an unlimited service guarantee.

## Account lifecycle

`pending_email` → `pending_approval` → `active` → (optional) `suspended` / `disabled` → (optional) `deletion_pending` → `deleted`

1. Registration creates a pending record only after server-side validation and uniqueness checks.
2. A single-use email OTP verifies email ownership; it does not activate the account.
3. Verified users remain `pending_approval` until an administrator approves them.
4. Only an active user with a valid server-verified session can access workspace data.
5. Suspension, logout, session replacement, and expiry must invalidate protected access.

## Proposed operations

All operations are logical names, not deployed URLs. Every input is validated on the server. Return structured JSON with a stable `ok`, `code`, and `message` shape. Do not expose stack traces, spreadsheet IDs, internal exceptions, or whether a particular email exists.

| Operation | Authentication | Expected behavior |
| --- | --- | --- |
| `register` | Public, rate-limited | Validate full name, username, email, phone and password; check duplicates; create pending-email state; request OTP delivery |
| `verifyEmail` | Public, rate-limited | Validate OTP; enforce expiry, attempt count and single use; transition only to pending approval |
| `resendEmailCode` | Public, rate-limited | Enforce cooldown and delivery quotas; invalidate the previous code before accepting the new one |
| `login` | Public, rate-limited | Verify password server-side; reject pending or suspended accounts without granting a session |
| `requestPasswordReset` | Public, rate-limited | Return a generic response whether or not an account exists; issue a short-lived, single-use reset challenge only for eligible accounts |
| `resetPassword` | Challenge required | Validate challenge and password policy; invalidate reset challenge and revoke existing sessions |
| `logout` | Valid session required | Revoke current session server-side |
| `getSession` | Valid session required | Return only minimal current-user/session state |
| `adminApproveUser` | Admin authorization required | Approve/reject pending account; log sanitized audit event |
| `adminRevokeSessions` | Admin authorization required | Revoke a user's sessions and log sanitized audit event |

## Registration and OTP rules

- Required registration fields: full name, username, email, phone, password, confirmation.
- Normalize email and username consistently on the server; enforce uniqueness with concurrency protection (for example, a script lock around the check-and-write sequence).
- Never trust client-side validation as a security boundary.
- Passwords must be stored only using a suitable password-hashing approach; never store plaintext passwords or reversible password values. Before selecting an implementation, verify that the chosen runtime provides a vetted, supported password-hashing primitive. Do not invent a custom password hash.
- OTP: six decimal digits, five-minute expiry, maximum five verification attempts, 60-second resend cooldown, new code invalidates old code, single use. The source binds the HMAC verifier to the challenge and user IDs.
- Login throttling in source: five invalid password attempts trigger a 15-minute account lockout. This still needs runtime and concurrency verification.
- Store an OTP verifier using a server-only keyed HMAC or a reviewed equivalent; never store/log the plaintext OTP or a bare fast hash of a six-digit OTP.
- Generic public responses must limit account enumeration. Do not put OTPs, passwords, session tokens, or reset credentials in logs.
- If mail quota is exhausted or delivery fails, fail safely, return a generic retry-later response, and do not mark the email verified.

## Session policy — requirements fixed, transport unresolved

- Absolute lifetime: nine hours.
- No sliding extension.
- One active session per user; replacement, logout, expiry, password reset, or administrative revocation invalidates the prior session.
- A browser return within the nine-hour lifetime may resume only if a valid session credential is securely transported and validated by the server.
- Never trust a browser-supplied user ID, role, approval status, or spreadsheet row number.
- Do not ship a session token in a URL, query string, localStorage, or logs.
- Session credential transport remains an explicit blocker. The source now derives opaque session credentials with HMAC-SHA-256 using a private `SESSION_TOKEN_GENERATION_SECRET`, while storing only a verifier in the session sheet. This is a standards-based design but still requires runtime review; browser transport and cross-origin behavior must be resolved before production use. Apps Script Content Service redirects output to a one-time `googleusercontent.com` URL and its documented `TextOutput` API does not document arbitrary response headers or a `Set-Cookie` method. Do not assume a secure HttpOnly cookie can be set from this endpoint. Do not promote the existing integration POC to production authentication.
- If no secure, supported transport can be demonstrated and tested, stop and choose a different backend architecture rather than weakening the session requirement.

## Quota and reliability checks

Official Apps Script quota documentation currently lists, for consumer accounts, MailApp email recipients at 100/day and Properties read/write operations at 50,000/day; Google Workspace accounts have different limits. Limits can change, and the effective account/service quotas must be checked before launch.

- Check `MailApp.getRemainingDailyQuota()` before sending OTP mail; this is an estimate for the current execution, not a reservation.
- Add server-side per-IP and per-identifier rate limits with a storage design that remains safe under concurrent requests.
- Use locks for operations where duplicate registration, OTP replay, resend races, or session replacement could occur.
- Keep properties values small; Apps Script documentation lists a 9 KB value limit and 500 KB total per property store.
- Treat quota exceptions as expected operational failures. Return safe generic responses and record sanitized diagnostics.
- Add a minimal admin health/diagnostics view before opening registration publicly.
- Test concurrent registration, resend races, OTP brute force, mail quota exhaustion, duplicate requests, partial writes, and recovery from failed provisioning.

Official references (recheck before deployment):
- Apps Script quotas: https://developers.google.com/apps-script/guides/services/quotas
- MailApp: https://developers.google.com/apps-script/reference/mail/mail-app
- Properties Service: https://developers.google.com/apps-script/guides/properties
- Content Service: https://developers.google.com/apps-script/reference/content/content-service
- Apps Script web apps: https://developers.google.com/apps-script/guides/web

## Required acceptance tests before real account launch

- Duplicate email/username races cannot create duplicate users.
- OTP expiry, fifth failed attempt, resend cooldown, replacement and replay all behave as specified.
- Email quota exhaustion never bypasses verification or reveals whether an account exists.
- Pending-approval and suspended users cannot access protected data.
- A client cannot switch users by changing IDs, request payloads, URLs or local state.
- Sessions expire at nine hours, do not slide, and revoke on logout/password reset/admin action/replacement.
- All protected operations enforce authorization and per-user ownership server-side.
- No secrets, passwords, OTPs, session credentials or provider tokens appear in frontend source, Sheets, URLs or logs.
- Backup and restore are demonstrated before user data is accepted.

## Decision gate

Do not create or deploy an Apps Script project, Sheet, Drive folder, OAuth client, API credential, or production deployment as part of this planning step. Those actions require explicit approval. The session transport issue must be resolved before production authentication is implemented.
