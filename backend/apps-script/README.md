# Apps Script backend foundation

**Status: source scaffold only. Not deployed and not connected to real user data.**

This folder is a source-controlled, modular Google Apps Script backend foundation for the Social Media Management Platform. It is deliberately separate from the public frontend and from the personal portfolio repository.

## Architecture decision: Google-only first

**Decision:** Start with Google Apps Script + Google Sheets + Google Drive using the two existing Google accounts. Do not add Cloudflare Workers, Supabase, or another paid/new backend service now. Reconsider only if practical tests show a specific blocker that cannot be resolved safely within this setup. This is a staged decision, not a promise that Apps Script is suitable for every production requirement.

The implementation must stay modular: API router, authentication, CAPTCHA, session handling, authorization, repositories, media storage, scheduling, and provider adapters remain separate modules. New services should be introduced behind interfaces/adapters rather than spreading service-specific code across the application.

## Target ownership model

- **Personal Google account:** owns the master spreadsheet and Apps Script project; controls user registry, resource mapping, sessions, roles, audit metadata, and backend configuration.
- **Work Google account:** owns operational spreadsheets and the dedicated media folder in Drive.
- The personal-owned script should access only specific operational resources explicitly shared with it.
- The browser never chooses spreadsheet IDs or Drive folder IDs. The server resolves them through its trusted mapping.
- Staff use role-limited app functions; they do not receive access to the master spreadsheet or Apps Script editor by default.

## Modules

- `Api.gs`: small request entry point, route guards and safe response contract.
- `Config.gs`: private Script Properties access and CAPTCHA configuration.
- `AccountService.gs`: shared account rules, email normalization and account-authentication eligibility.
- `RegistrationService.gs`: registration, email verification, and OTP resend workflows; public registration remains feature-gated.
- `OtpService.gs`: OTP creation, HMAC verifier generation, latest-challenge lookup and one-time consumption.
- `LoginService.gs`: login, logout, current-session lookup and login-failure throttling.
- `PasswordRecoveryService.gs`: password-reset request and reset workflows; public recovery remains feature-gated.
- `PasswordService.gs`: PBKDF2-HMAC-SHA-256 password hashing and verification.
- `SessionService.gs`: fixed nine-hour absolute expiry, one active session per user, verifier-only session storage, logout and revocation helpers.
- `AccountAdminService.gs`: approval, suspend/disable/reactivate, profile-anonymizing self-deletion, and guarded manual first-admin bootstrap.
- `CaptchaService.gs`: server-side Google reCAPTCHA verification for registration/login.
- `Schema.gs`: versioned master and operational sheet column definitions.
- `SheetRepository.gs`: shared spreadsheet access, row conversion, header validation, targeted updates and audit writes.
- `HealthService.gs`: non-sensitive health information.
- `Tests.gs`: safe self-tests for schema contracts, password hashing, session policy and scaffold readiness.
- `OperationalSetup.gs`: read-only cross-account access check and explicitly gated initialization for a disposable work-owned operational test sheet.
- `MaintenanceService.gs`: manual-only, opt-in 30-day media cleanup preview/execution; protects media referenced by posts and never deletes external social content.
- `OperationalService.gs`: internal business rules for user-owned brands and posts, schedule validation, soft deletion, and cancellation of queued post targets.
- `MediaService.gs`: size-limited uploads to each user's mapped Drive media folder, MediaLibrary registration, and guarded deletion of unreferenced media.
- `OperationalService.gs` also supports ordered media attachments and per-post target records; actual OAuth provider verification and publishing adapters are not implemented by these data-layer helpers.

Keep modules independent so future providers, social networks, queues, and storage adapters can be added without rewriting the request router.

## Required Script Properties

Set these only in the private Apps Script project under the personal account. Never put secret values in this repository, the frontend, Notion, or a normal Sheet.

- `APP_ALLOWED_HOSTNAME` = `social.iamjiteshtiwari.in`
- `MASTER_SPREADSHEET_ID` = ID of the personal-account master spreadsheet
- `OTP_HMAC_SECRET` = long random private value used to protect low-entropy OTP verifiers
- `BOOTSTRAP_ADMIN_EMAIL` = the owner email, entered only when preparing first-admin bootstrap
- `ENABLE_FIRST_ADMIN_BOOTSTRAP` = set to `YES` only while manually running `bootstrapFirstAdminAccount`, then remove it
- `ENABLE_PUBLIC_REGISTRATION` = keep unset until API deployment, CAPTCHA, quota and browser transport are confirmed; set to `YES` only for an explicitly approved registration launch
- `ENABLE_PUBLIC_RECOVERY` = keep unset until password recovery routes and browser transport are approved
- `ENABLE_MEDIA_CLEANUP` = keep unset; set to `YES` only for an explicitly approved manual cleanup run, then remove it
- `SESSION_HMAC_SECRET` = long random private value used to protect session credential verifiers
- `SESSION_TOKEN_GENERATION_SECRET` = separate long random private value used to derive opaque session credentials with HMAC
- `OPERATIONAL_TEST_SPREADSHEET_ID` = ID of the disposable work-owned operational test spreadsheet shared with the personal account
- `RECAPTCHA_REGISTRATION_SECRET` = **rotated replacement secret**, entered directly in Apps Script
- `RECAPTCHA_LOGIN_SECRET` = **rotated replacement secret**, entered directly in Apps Script if login has its own secret
- `RECAPTCHA_MIN_SCORE` = optional; used only for score-based keys, recommended starting value `0.5`
- `RECAPTCHA_REGISTRATION_ACTION` = optional expected action for score-based registration keys, e.g. `register`
- `RECAPTCHA_LOGIN_ACTION` = optional expected action for score-based login keys, e.g. `login`
- `OPERATIONAL_RESOURCE_MAP_VERSION` = optional internal schema/version marker

The public site keys belong in frontend configuration only after the exact key type and allowed hostname are confirmed. They are not secrets. The previously shared CAPTCHA secrets must be rotated before use.

## Canonical schema contract — version 2

The source contract is aligned to the approved Notion S3.12 schema and the selected **custom-authentication** design. The schema definitions themselves do not create resources.

### Master workbook

- `Users`: identity/contact, role, account/registration status, email verification and lifecycle timestamps. No password hash/salt, password parameters, lockout state or session credentials.
- `UserResources`: one mapping per user to the user's operational spreadsheet and private Drive folders, plus provisioning state, retries and safe error codes.
- `SocialConnections`: central social-account metadata and opaque `token_reference` only. Never store raw access/refresh tokens in Sheets.
- `AppConfig`: non-secret global configuration only. Private secrets remain in Apps Script Script Properties.
- `AuthRecords`: one custom-password record per user, containing the password hash/salt/algorithm/iteration count and login-throttling state. Never store plaintext passwords.
- `AuditLogs`: sanitized security/admin events with allow-listed metadata only.
- `Sessions`: verifier-only session records; fixed nine-hour absolute expiry, one active session per user, and explicit revocation.
- `AuthChallenges`: HMAC verifier for email OTP/password reset, expiry, attempt limits, resend timestamp and consumption state. Never store the OTP itself.

### Per-user operational workbook

The approved seven-tab template is:

1. `Brands`
2. `Posts`
3. `PostTargets`
4. `MediaLibrary`
5. `PostMedia`
6. `PublishingLogs`
7. `Settings`

Use UTC for stored event/schedule timestamps and retain the intended timezone where required. A post may have multiple targets and multiple ordered media references. Local edit/delete and 30-day cleanup rules must protect active/scheduled/publishing records and must never delete content from external social platforms.

Schema version 2 intentionally does not auto-migrate legacy tabs (`ResourceMap`, `AuditLog`, `SocialAccounts`, `Content`, `PublishingQueue`, `Notifications`). The guarded test initializers fail if legacy tab names are present; review/migrate manually rather than silently creating a parallel schema.

## Setup order

1. In Apps Script, create a **separate** project under the personal Google account. Confirm the account avatar and project owner before proceeding.
2. Copy each `.gs` module into a matching Apps Script file. Do not paste secrets into source.
3. Create/identify a disposable master test spreadsheet owned by the personal account and a disposable operational test spreadsheet owned by the work account. Use no real user/client data.
4. Share only the operational test spreadsheet with the personal account, at the minimum permission needed.
5. Add the test spreadsheet IDs to private Script Properties. Do not place them in browser code.
6. Run schema preview first. To create master headers, set `ENABLE_SCHEMA_INITIALIZATION` to `YES` in Script Properties and manually run `initializeMasterSchema` against the **disposable test master only**. Remove the flag afterward.
7. Run `testOperationalSheetAccess` to check cross-account access without modifying the work-owned test sheet. Only after confirming the returned sheet name is the disposable test resource, set `ENABLE_OPERATIONAL_SCHEMA_INITIALIZATION=YES` and run `initializeOperationalTestSchema`. Remove the flag afterward.
8. Verify cross-account read/write and permission-revocation behavior before production resources are considered.
9. Rotate CAPTCHA secrets, enter replacements directly into Script Properties, and test valid, missing, invalid, expired and reused tokens.
10. Do not deploy a public web app until the API transport and production session design have been selected and tested.

## Important integration gate

The current website is hosted as a static frontend. Apps Script Content Service does not provide a documented arbitrary `Set-Cookie` response-header API, and cross-origin browser calls can be affected by redirects/CORS. The nine-hour, one-active-session policy is already a project requirement. Therefore this scaffold intentionally does **not** implement a fake production login, store session tokens in localStorage, or pretend the API is ready for public browser integration.

Before connecting registration/login, demonstrate a supported, secure transport for the chosen backend or select a small authentication/API layer that supports it. Do not weaken the nine-hour absolute expiry, one-active-session, revocation, or ownership checks just to make the demo work.

## Current implementation boundary

The source now includes configuration access, CAPTCHA verification, versioned schemas, repository helpers, PBKDF2-HMAC-SHA-256 password hashing, registration/email-OTP workflow code, fixed-lifetime session helpers, account approval/suspension/disable/deletion helpers, operational brand/post/media/target data services, and protected media retention maintenance. These modules are source-only and have not been run in the live Apps Script environment. No Google resources have been created or changed, no email has been sent, and no web app has been deployed. Public registration/OTP routes are gated by `ENABLE_PUBLIC_REGISTRATION=YES`; login/logout/session routes deliberately remain disabled until secure browser transport is resolved. Frontend integration and live runtime verification remain outstanding. The operational data layer supports brands, posts, media links and targets; real social OAuth/provider verification, token lifecycle, and publishing adapters still require provider selection, credentials, and end-to-end tests.
