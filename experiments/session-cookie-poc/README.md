# SMM Session Cookie Transport Proof

This is an isolated browser transport experiment. It is not production authentication and is not connected to the SMM backend, Google Sheets, Google Drive, Meta, or any real user account.

## What it tests

- A nine-hour cookie named `__Host-smm_session`.
- `HttpOnly; Secure; SameSite=Lax; Path=/`, with no Domain attribute.
- Browser credentialed requests from `http://localhost:4173` to `http://localhost:8787`.
- Exact-origin CORS and Origin checks.
- Session validation, one-active-session behaviour for the synthetic demo identity, CSRF header check, logout and cookie clearing.
- The browser UI checks that JavaScript cannot read the HttpOnly cookie.

## Requirements

- Node.js 20 or newer.
- No npm dependencies.
- Use only a local machine. Never expose either server publicly.

## Run

Terminal 1:

```sh
cd experiments/session-cookie-poc
SMM_DEMO_PASSWORD='use-a-local-only-password-12-chars-minimum' node server.mjs
```

Terminal 2, from the same directory:

```sh
python -m http.server 4173 --bind 127.0.0.1 --directory public
```

Open `http://localhost:4173` and sign in with:

- Email: `demo@example.test`
- Password: the local-only value supplied in Terminal 1.

The API listens on `127.0.0.1:8787`. The browser uses `localhost` for both origins. Modern browsers treat localhost as a potentially trustworthy context for Secure-cookie testing. Do not substitute a public IP or expose the server.

## Expected checks

1. Login succeeds and the session cookie is set.
2. Output reports `cookieReadableByJavaScript: false`.
3. Check session succeeds without JavaScript supplying the session token.
4. Logout succeeds and clears the cookie.
5. Check session after logout returns `SESSION_INVALID`.
6. An unapproved Origin is rejected by the API.

## Deliberate limitations

- HTTP localhost only; this is not proof of production TLS, DNS, browser behaviour across real subdomains, or deployment configuration.
- In-memory sessions disappear when the API process restarts.
- The demo password comparison is not the production password hashing flow.
- No rate limiting, account lifecycle, persistent session store, distributed revocation, secret manager, or production CSRF policy.
- No integration with existing LoginService.gs or SessionService.gs.
- The browser UI is deliberately separate from the live SPA.

A passing local test proves only the local cookie transport mechanics. A later stage must repeat tests over HTTPS on isolated test subdomains and integrate with a trusted backend before production use.
