# Backend Runtime Evaluation and Internal API Contract

**Status:** Exploratory design note only. No separate authentication/API runtime has been selected or deployed. The approved first architecture remains Google Apps Script + Google Sheets + Google Drive, with the existing personal/work account ownership model. This document does not override that decision.

**Project constraints:** preserve the Google Sheets/Drive data and media layer, prefer no recurring cost, keep public authentication routes disabled until the complete security design and end-to-end tests pass.

## 1. Current decision

Continue with the Google-only backend foundation while measuring actual limitations. The Cloudflare Worker benchmark in backend/worker-benchmark/ is an optional, disposable experiment for password-hash CPU evaluation only. It is not an authentication service, not part of the production architecture, and must not be deployed without explicit approval.

Do not add Cloudflare Workers, Supabase or another backend service as a production dependency unless a measured technical blocker is documented and the user approves an architecture change.

## 2. Why a runtime benchmark was considered

Apps Script remains useful for Google-owned resources, but password hashing, browser session transport, quotas and cross-origin behavior require careful validation. A local Node.js scrypt result is not proof that the same operation fits any hosted runtime's CPU budget.

If the user separately approves a disposable benchmark, measure the exact operation and the actual provider CPU time. Do not weaken password hash parameters merely to fit a free-tier limit. A benchmark result alone does not authorize deployment or movement of authentication out of Apps Script.

## 3. Trust boundaries to preserve

- Browser: public UI only. Never holds Apps Script service secrets, internal API signing keys, provider tokens or trusted user/role identifiers.
- Master authority: owns canonical user identity, account status, permissions, sessions and resource mappings.
- Operations services: act only after securely verifying the requester's authorization against the Master authority.
- Master spreadsheet: canonical user registry, account state, sessions/auth records, audit metadata and resource mapping.
- Operations spreadsheet / Drive: user-owned brands, posts, targets, media metadata and media files according to the approved mapping model.

The two-script ownership split and secure server-to-server authorization contract remain design work; do not assume that moving files into a second Apps Script project creates a secure boundary.

## 4. Requirements for any future internal request contract

Before Operations accepts protected requests, design and test a versioned authenticated contract. It must:

- derive the user and permissions from trusted Master-side session state, never from browser-supplied user_id or role;
- authenticate the calling service, not merely hide the endpoint URL;
- include timestamp expiry and replay protection;
- use strict action allow-lists and per-action authorization;
- fail closed if signature/replay validation is unavailable;
- avoid logging secrets, tokens, full signatures or sensitive payloads;
- include shared byte-for-byte test vectors and concurrency/replay tests.

A signed HMAC request with a timestamp and one-use nonce is one possible design, not an approved implementation. Apps Script Cache alone must not be assumed to provide durable security-critical replay prevention.

## 5. Browser session requirements

Preserve the agreed policy:
- Fixed nine-hour absolute expiry; no sliding extension.
- One active session per user.
- Logout, password reset, account suspension/disable/deletion and session replacement revoke the prior session.
- Store only a verifier for opaque session credentials.
- Never put session credentials in a URL, query string, analytics event or console log.

Still unresolved: a secure, supported browser credential transport for the static frontend and Apps Script/API boundary. Do not assume a JavaScript-readable bearer token or an undocumented cookie/header behavior is secure. Resolve transport and cross-origin behavior before wiring protected frontend actions.

## 6. Approval gates

No separate runtime, Worker, API gateway, DNS change, public authentication route or production deployment is authorized by this document. Any architecture change requires:
1. a specific measured blocker in the current Google-only design;
2. a documented security and cost comparison;
3. an explicit user decision;
4. isolated TEST implementation and end-to-end verification;
5. a reviewed migration and rollback plan.
