# Architecture and Security Boundaries

## Status
This document describes the planning direction, not a deployed system. No production backend, Google Sheets, Google Drive, authentication, or social integration is created by this scaffold.

## Current architecture decision

Start with the existing two Google accounts and a Google-only backend: Google Apps Script for server-side logic, Google Sheets for structured records, and Google Drive for media. Do not add Cloudflare Workers or Supabase at this stage. Reconsider only when a measured test demonstrates a specific technical or operational blocker. Keep the code modular so a future API gateway or different database can be introduced behind adapters without rewriting frontend business logic.

## Proposed components
- **Frontend:** separate static site using semantic HTML, custom CSS, and vanilla JavaScript.
- **Backend candidate:** Google Apps Script web app.
- **Master records candidate:** Google Sheets for user/account metadata and resource mappings.
- **Media candidate:** Google Drive, with per-user ownership and access controls designed before implementation.
- **Source control:** this repository is separate from the personal portfolio repository.

Each service has quotas, operational limits, and platform-specific security behavior. Verify current terms, quotas, permissions, and deployment settings before relying on any component. A free tier is not an unlimited-capacity guarantee.

## Security requirements before real accounts
1. Never treat a browser-supplied user ID as authentication.
2. Authenticate every protected backend request and verify record ownership server-side.
3. Do not store plaintext passwords, one-time codes, raw session credentials, or provider tokens in Sheets or logs.
4. Do not expose backend owner credentials or privileged provider credentials to the browser.
5. Use generic public responses for sensitive account-lookup flows and enforce backend-controlled rate limits.
6. Design session issuance, transport, expiry, revocation, and replay protection before production login. The nine-hour session policy is a planning requirement; secure browser transport is still unresolved.
7. Make resource provisioning idempotent and recoverable from partial failure.
8. Log security-relevant events with sanitized details only.
9. Define backup access, retention, and restore testing before storing important user data.
10. Test cross-user access isolation and failure cases before launch.

## Planned account lifecycle
`pending_email` → `pending_approval` → `active`

Email verification alone does not activate an account. Admin approval is required. All state changes must be enforced by the backend.

## Planned implementation sequence
1. Static frontend foundation.
2. Backend contract and quota/error handling review.
3. Registration and email verification.
4. Admin approval and secure session design.
5. Workspace/brand data ownership.
6. Media library.
7. Social provider eligibility and connection flow.
8. Drafting and publishing only after provider permissions and failure handling are verified.

## Explicitly out of scope for this scaffold
- Production login, registration, or authorization.
- Real user or social account data.
- Real email sending.
- Creating or deploying Google Apps Script projects.
- Creating Sheets or Drive folders.
- OAuth secrets, API credentials, or publishing.
- DNS changes, custom-domain setup, or enabling GitHub Pages.

## Portfolio isolation rule
Do not edit, deploy, or reconfigure the portfolio website or its repository as part of this project. Any reuse of design ideas must be adapted into this separate codebase.
