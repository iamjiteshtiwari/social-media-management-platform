# Gateway-to-Apps-Script request authentication proof

Status: design only. No Apps Script routes or existing authentication services are changed by this document.

## Goal

Allow a private Node.js gateway to call the TEST Apps Script web app while preventing ordinary browser callers from impersonating the gateway. Apps Script remains the authority for account credentials, approval state, permissions, and session records.

## Trust boundaries

- The browser talks only to the gateway.
- The gateway holds a private HMAC secret in its server-side environment. It never sends that secret to the browser.
- Apps Script holds the matching secret in Script Properties.
- The Apps Script deployment URL is not a secret and must be treated as publicly reachable.
- A valid gateway signature authenticates the gateway request; it does not replace user authentication or session validation.

## Request envelope

The gateway sends an HTTPS POST with a JSON envelope:

```json
{
  "version": "v1",
  "timestamp": "UTC Unix milliseconds as a decimal string",
  "requestId": "random UUID v4",
  "action": "gateway.health",
  "payload": "{\"probe\":\"synthetic\"}",
  "signature": "base64 HMAC-SHA256"
}
```

The `payload` field is a JSON string, not a nested object. This lets both runtimes sign the exact same payload bytes without relying on object-key canonicalization.

Canonical signing string (UTF-8):

```text
v1\n{timestamp}\n{requestId}\n{action}\n{payload}
```

Signature:

```text
Base64(HMAC-SHA256(sharedSecret, canonicalSigningString))
```

Apps Script must verify the signature before parsing or executing the payload action. Compare signatures in constant time.

## Validation rules

1. Require HTTPS at the gateway-to-Apps-Script hop.
2. Accept only version `v1` and an explicit action allowlist.
3. Require a valid UUID v4 request ID.
4. Require a numeric timestamp within a small clock-skew window (initial proposal: 5 minutes).
5. Verify HMAC over the exact canonical string.
6. Atomically reject request IDs already consumed within the accepted time window.
7. Record a request ID before executing the action. If replay-store access fails, reject the request (fail closed).
8. Limit envelope and payload sizes; reject malformed JSON and unexpected fields.
9. Never log passwords, raw session tokens, HMAC secrets, full payloads, or signatures.

## Replay protection storage

Do not use Apps Script CacheService as the sole replay database: Google documents that cached entries can be removed before their requested expiration. A durable store protected by ScriptLock is required for this proof. Script Properties are a candidate for the low-volume synthetic test, but their quotas and storage limits must be measured. If those limits are unsuitable, evaluate a dedicated TEST sheet or another durable store before implementation.

The nonce claim must be atomic: acquire the script lock, check whether the request ID exists, write its consumed marker, then release the lock. Do not perform the protected action before the marker is committed. Expired markers may be pruned under the same lock. If storage is full, unavailable, or ambiguous, fail closed.

## Retry and idempotency

The gateway must not automatically retry a signed state-changing request with the same request ID after an ambiguous network failure. A repeated request ID is rejected. A new request ID is a new operation and must only be issued after the caller can safely decide to retry. A future idempotency-result design would need separate review; do not store raw session tokens in a replay cache.

## Response and redirect handling

Apps Script Content Service may redirect the response to a one-time `googleusercontent.com` URL. The Node gateway proof must record the initial response status/redirect behavior and confirm that the final response body can be read and parsed. Do not assume POST redirect behavior; test it against the actual TEST deployment. Do not log response bodies containing credentials.

## Proof tests

- Valid signature + fresh request ID: accepted.
- Incorrect signature: rejected before action.
- Timestamp outside the accepted window: rejected.
- Reused request ID: rejected.
- Concurrent duplicate request IDs: at most one accepted.
- Missing/invalid secret: fail closed.
- Replay-store unavailable/full: fail closed.
- Unknown action and malformed payload: rejected.
- Node gateway can follow/read the real Apps Script Content Service response redirect.
- No production spreadsheet, Drive, Meta API, OAuth, or live website operations.

## Explicitly out of scope

- Enabling public login/logout/session routes.
- Changing LoginService.gs or SessionService.gs.
- Creating or revoking real user sessions.
- Production deployment, DNS changes, or paid hosting.
- Meta OAuth callback or publishing.
