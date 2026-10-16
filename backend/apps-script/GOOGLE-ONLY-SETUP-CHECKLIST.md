# Google-only backend setup checklist

This checklist is for the **development/test environment only**. Do not use real user, client, or social-account data during setup.

## Decision

Use the existing personal and work Google accounts. Do not create a Cloudflare or Supabase dependency now. If a test exposes a blocker, record the exact failure and review the architecture before switching.

## Phase A — Create the test resources

### A1. Personal Google account
- [ ] Sign in to the personal Google account and confirm the account avatar.
- [ ] Create a new, disposable Google Sheet named `SMM Master TEST`.
- [ ] Create a separate Google Apps Script project named `SMM Backend TEST`.
- [ ] Keep the spreadsheet private; do not share it publicly.
- [ ] Copy the master spreadsheet ID from its URL for private Script Properties only.

### A2. Work Google account
- [ ] Sign in to the work Google account and confirm the account avatar.
- [ ] Create a disposable Google Sheet named `SMM Operations TEST`.
- [ ] Create a disposable Drive folder named `SMM Media TEST`.
- [ ] Share only the test operational sheet and test media folder with the personal account, using the minimum permission needed for the test.
- [ ] Do not share the personal master sheet with staff or family.

## Phase B — Add source code

Copy each file from `backend/apps-script/` into the matching file in the test Apps Script project:
- [ ] `Api.gs`
- [ ] `Config.gs`
- [ ] `CaptchaService.gs`
- [ ] `Schema.gs`
- [ ] `SheetRepository.gs`
- [ ] `HealthService.gs`
- [ ] `Tests.gs)

Do not paste any secret into code, GitHub, Notion, or chat.

## Phase C — Private Script Properties

In Apps Script, open **Project Settings → Script Properties** and add the required values privately:

| Property | Value |
| --- | --- |
| `APP_ALLOWED_HOSTNAME` | `social.iamjiteshtiwari.in` |
| `MASTER_SPREADSHEET_ID` | ID of the disposable personal-owned master test sheet |
| `RECAPTCHA_REGISTRATION_SECRET` | Rotated registration secret, entered directly in Apps Script |
| `RECAPTCHA_LOGIN_SECRET` | Rotated login secret if a separate login key is configured |
| `RECAPTCHA_MIN_SCORE` | `0.5` only if using score-based reCAPTCHA keys |

For score-based keys, set expected action properties to match the frontend's configured action names. Do not guess the CAPTCHA key type: verify the type and allowed hostname in the CAPTCHA provider console first. The public site keys are not secrets; the secret keys are.

The previously shared CAPTCHA secrets must be rotated before testing. Do not send replacement secrets to ChatGPT.

## Phase D — Safe local tests

- [ ] Run `runBackendSelfTests` in the test Apps Script project.
- [ ] Review the execution result and logs for unexpected errors or sensitive data.
- [ ] Run the schema preview function and inspect the returned column definitions.
- [ ] Only after confirming the master spreadsheet ID points to the disposable test sheet, set `ENABLE_SCHEMA_INITIALIZATION=YES` temporarily and run `initializeMasterSchema`.
- [ ] Remove `ENABLE_SCHEMA_INITIALIZATION` after the test.
- [ ] Confirm expected tabs and headers were created in the disposable test master sheet.
- [ ] Test work-owned test-sheet access from the personal-owned script only after the repository supports that explicit test.
- [ ] Revoke the test share and confirm access fails safely.

## Phase E — Before any browser or real-data integration

Do not deploy a public endpoint or connect the real registration/login forms yet. First:
- [ ] Prove a browser can call the test endpoint and handle responses/redirects correctly.
- [ ] Resolve secure session credential transport while preserving the fixed nine-hour expiry, no sliding extension, one active session, and revocation requirements.
- [ ] Verify server-side CAPTCHA with valid, missing, invalid, expired, and replayed tokens.
- [ ] Review authentication, password hashing, OTP delivery, rate limiting, and account lifecycle before implementing live registration.
- [ ] Verify user/brand ownership on every protected operation.
- [ ] Demonstrate backup and restore for test data.

## Stop conditions

Stop and review instead of bypassing a check if:
- the wrong Google account owns a resource;
- a test would touch real user/client data;
- CAPTCHA type/hostname/secret is uncertain;
- an API test would require placing credentials in a URL, localStorage, or logs;
- a browser test fails due to Apps Script redirects/CORS;
- a session design cannot meet the agreed policy securely.

**Current status:** source scaffold only. No Apps Script project, Sheets, Drive folders, CAPTCHA secrets, deployment, or production integration has been created by this repository change.
