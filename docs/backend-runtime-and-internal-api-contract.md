# Backend Runtime Evaluation and Internal API Contract

**Status:** Design proposal for the `s4-backend-foundation` development branch. Not deployed. No Google resources, secrets, DNS, or live endpoints were changed.

**Project constraints:** ₹0 recurring cost; preserve Google Sheets/Drive as the data and media layer; keep the existing Apps Script project and its data model; keep public authentication routes disabled until end-to-end security tests pass.

## 1. Current decision

Use a separate authentication/API runtime only if its free-tier limits can support the selected password hash and request volume. Keep Apps Script as a private Google-resource adapter for Sheets, Drive, Gmail/OTP delivery, and Google-owned operations. Do not move user data or media to a new database as part of this step.

The local Node.js scrypt proof of concept passed basic hash/verify and per-password salt checks (reported local result: two hashes in about 110 ms). That is a functional POC, not a deployment benchmark.

## 2. Runtime evaluation

### Candidate: Cloudflare Workers Free

Current official plan documentation lists 100,000 requests/day and a 10 ms CPU limit per HTTP request on the Free plan. Workers support Node.js `node:crypto` APIs, including common cryptographic operations. The important risk is that password hashing is CPU work: a local Node.js scrypt result does not prove the same operation will fit the Workers Free CPU budget.

**Decision: candidate only; do not deploy or enable authentication yet.** First build a disposable Worker benchmark for the exact scrypt parameters, repeatable verify operation, and worst-case request path. Record CPU time (not only wall-clock time). If it exceeds the free CPU limit, do not weaken the hash parameters merely to fit; evaluate a native Web Crypto PBKDF2 implementation with an explicitly reviewed work factor, or revisit a runtime whose free tier meets the measured requirement.

Official references:
- [Workers limits](https://developers.cloudflare.com/workers/platform/limits/)
- [Workers Node.js crypto support](https://developers.cloudflare.com/workers/runtime-apis/nodejs/crypto/)
- [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/)

### Existing Google Apps Script

Apps Script remains useful for Google-owned resources, but the current password-hashing implementation needs runtime measurement before any public auth is enabled. Apps Script quotas and service limits are documented by Google and vary by service/account type.

Reference: [Apps Script quotas](https://developers.google.com/apps-script/guides/services/quotas)

### Acceptance gate

No runtime is approved for live authentication until all of these are true:
1. The chosen password hash and verification complete within the actual free-tier execution budget with headroom.
2. Rate limits and lockout behavior are tested under repeated invalid requests.
3. Secrets stay server-side; no passwords, OTPs, session tokens, HMAC keys, or CAPTCHA secrets are logged or committed.
4. The browser session transport and cross-origin behavior are tested against a non-production environment.
5. The internal Apps Script request authenticator has timestamp expiry, replay protection, strict action allow-listing, and safe error responses.
6. All auth routes remain disabled until the complete lifecycle tests pass.

## 3. Proposed trust boundaries

- **Browser:** public UI only. Never holds the Apps Script service secret or internal API signing key. Do not store bearer credentials in URLs or logs.
- **Authentication/API Worker (candidate):** validates browser requests, applies rate limits, verifies password hashes, manages browser sessions, and signs narrowly scoped internal requests.
- **Apps Script adapter:** validates the internal signature before reading/writing Google resources. It remains the only component with the relevant spreadsheet/Drive access.
- **Master spreadsheet:** canonical user registry, account state, sessions/auth records, audit metadata and resource mapping.
- **Operations spreadsheet / Drive:** user-owned brands, posts, media metadata and media files according to the existing mapping model.

Do not expose the internal Apps Script adapter directly to arbitrary browser callers. A hidden URL is not authentication.

## 4. Internal Worker-to-Apps-Script request contract (proposal)

All requests use HTTPS POST with a JSON body. The Worker sends only an allow-listed `action` and its required fields. The Apps Script adapter must reject missing, invalid, stale, replayed, or incorrectly signed requests before performing side effects.

### Signed request headers

| Header | Meaning |
| --- | --- |
| `X-SMM-Key-Id` | Identifier for the active signing key; never the secret itself |
| `X-SMM-Timestamp` | Unix time in seconds |
| `X-SMM-Nonce` | Cryptographically random one-use request identifier |
| `X-SMM-Signature` | HMAC-SHA-256 over the canonical request bytes |

### Canonical signing input

Use a versioned, unambiguous canonical format shared byte-for-byte by both runtimes:

```text
SMM-INTERNAL-V1
POST
<exact-path>
<timestamp>
<nonce>
<lowercase-hex-sha256-of-exact-UTF8-body>
```

The signature is HMAC-SHA-256 of the UTF-8 canonical input using the internal shared secret. Encode the signature as lowercase hexadecimal. The body hash must cover the exact UTF-8 bytes sent, not a re-serialized object.

**Important:** this is a proposed protocol, not implemented or security-reviewed yet. Both sides must share test vectors before the adapter is enabled. Keep the signing secret in Worker secrets and Apps Script Script Properties; never in frontend code, ordinary environment files committed to Git, Sheets, or logs.

### Replay and timestamp policy

- Accept only timestamps within a small configured clock-skew window (initial proposal: ±60 seconds).
- Reject a nonce already accepted for the same key ID during the allowed window.
- Record/claim the nonce atomically before any side effect; concurrent duplicate requests must not both succeed.
- Use a bounded replay store with a documented retention/expiry policy. Do not assume Apps Script Cache alone is durable or perfectly reliable for security-critical replay prevention.
- Fail closed if replay protection cannot be checked.
- Include an internal request ID for correlation, but never log credentials or the full signature input if it contains sensitive data.

### Internal response envelope

Success:
```json
{
  "ok": true,
  "requestId": "opaque-correlation-id",
  "data": {}
}
```

Failure:
```json
{
  "ok": false,
  "requestId": "opaque-correlation-id",
  "code": "SAFE_MACHINE_READABLE_CODE",
  "message": "Safe user-independent message"
}
```

Do not return stack traces, spreadsheet IDs, Drive folder IDs, secret values, OTP values, password hashes, or raw provider responses.

### Initial action allow-list

Start with read-only and diagnostic actions; add each write action only with its own authorization and tests.

| Action | Initial policy |
| --- | --- |
| `health` | Public, minimal non-sensitive status; never proves internal authentication |
| `internal.health` | Signed internal request only |
| `account.register.start` | Disabled until CAPTCHA, OTP, throttling, hashing and duplicate-account recovery are verified |
| `account.register.verify` | Disabled until one-time OTP consumption and replay tests pass |
| `account.login` | Disabled until password-hash runtime and session transport are approved |
| `account.session.get` | Disabled until browser credential transport is approved |
| `account.logout` | Disabled until token validation and revocation tests pass |
| `account.recovery.start` / `account.recovery.complete` | Disabled until full recovery tests pass |
| `account.admin.*` | Admin-only; disabled until authorization and audit tests pass |
| `brands.*`, `posts.*`, `media.*` | Disabled at the public boundary until user ownership is derived from a validated session server-side |

The browser must never supply a trusted `user_id`, spreadsheet ID, Drive folder ID, role, or account status as authorization evidence. Derive those values from the validated server-side session and canonical resource mapping.

## 5. Browser session requirements

Preserve the agreed policy:
- Fixed nine-hour absolute expiry; no sliding extension.
- One active session per user; a new successful login revokes the previous session.
- Logout and account suspension/disable/deletion revoke sessions.
- Store only a verifier for opaque session credentials in the data store.
- Never put session credentials in a URL, query string, analytics event, or console log.

**Still unresolved:** how the browser receives and sends the credential securely when the API runtime and static GitHub Pages frontend may be on different origins. Do not assume a JavaScript-readable bearer token or cookie-free design is secure by itself. Compare a same-origin reverse proxy/custom-domain arrangement with a carefully tested cross-origin cookie design before implementation.

## 6. Next implementation sequence

1. Add a disposable Cloudflare Worker benchmark only; no secrets, Google calls, or production routes.
2. Measure the exact scrypt hash and verify paths against the 10 ms Free CPU budget. Save the result without recording passwords or hash outputs.
3. If the runtime fails the budget, compare supported native cryptographic alternatives without reducing security by guesswork.
4. Implement shared canonical-signature test vectors locally.
5. Implement internal Apps Script signature verification in a separate test copy, including stale timestamp, modified body, wrong key, duplicate nonce, and concurrent replay cases.
6. Test against disposable Google resources only, with explicit approval before creating or initializing any resources.
7. Review browser session transport and end-to-end auth tests.
8. Only then consider enabling a public route, with explicit approval.

## 7. Explicit non-actions

This proposal does not deploy a Worker, create Cloudflare resources, configure DNS, change Google Apps Script deployments, alter Script Properties, initialize or modify any existing spreadsheet/Drive resource, enable public auth flags, or merge into `JTCodes`.
