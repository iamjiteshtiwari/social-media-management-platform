# Password hash runtime benchmark (test only)

This folder contains an isolated Cloudflare Worker benchmark for the project's current scrypt proof-of-concept parameters. It is **not** an authentication service.

## Safety properties

- Uses a fixed, fake benchmark string; never accepts a password or hash parameters from the request.
- Does not call Google services, access project secrets, write data, or return the derived key.
- Only responds to `GET /benchmark`; all other paths/methods return 404.
- Must not be connected to the live website or used for real accounts.

## Before running

This benchmark is intended to be deployed only to a disposable test Worker. It does not change DNS or connect to the existing Apps Script project, but deployment creates a Cloudflare Worker resource. Do not deploy until you choose to create that test resource.

## Commands (from this directory)

```powershell
npx wrangler --version
npx wrangler deploy
```

After deployment, request the test Worker URL with the path `/benchmark` in a browser. Repeat a small number of times and record `elapsedMs`. Also inspect the request's CPU time in Cloudflare's logs/observability; wall-clock duration is not the same as CPU time.

If the result exceeds the Free plan's 10 ms CPU limit, the request may be terminated before returning JSON. Treat repeated Error 1102 / CPU-limit failures as a failed benchmark. Do not lower scrypt cost parameters just to force a pass. Review a native cryptographic alternative or another runtime first.

Delete the disposable Worker after the test if you decide not to keep it. No production Worker, DNS record, secret, or Google resource is configured by these files.
