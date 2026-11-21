# Apps Script backend foundation

**Status: development source; selectively tested in isolated TEST resources; not production-deployed.**

This folder contains the modular Google Apps Script backend for the Social Media Management Platform. It is separate from the public frontend and the personal portfolio repository.

## Repository and branch guidance

- Repository: [iamjiteshtiwari/social-media-management-platform](https://github.com/iamjiteshtiwari/social-media-management-platform)
- Backend development baseline: [`s4-backend-foundation`](https://github.com/iamjiteshtiwari/social-media-management-platform/tree/s4-backend-foundation)
- Latest TEST-export reconciliation: [`reconcile/latest-test-export-2026-11-21`](https://github.com/iamjiteshtiwari/social-media-management-platform/tree/reconcile/latest-test-export-2026-11-21)
- Review: [draft PR #4](https://github.com/iamjiteshtiwari/social-media-management-platform/pull/4), from the reconciliation branch into `s4-backend-foundation`. It is open, draft and unmerged.
- Full branch purposes, historical branches and merge boundaries: [`docs/BRANCH-STRATEGY.md`](../../docs/BRANCH-STRATEGY.md).
- Do not merge backend branches into `JTCodes` or deploy without explicit user approval.

## Latest source checkpoint — 21 November 2026

- The reconciliation branch contains all 41 entries from the user's latest Apps Script TEST export.
- 40 entries match the supplied export exactly. One regression test was intentionally corrected: when Drive trash throws, the MediaLibrary row must remain `trash_pending`, not `available`.
- Static JavaScript syntax parsing passed for all 40 `.gs` files; the Apps Script manifest JSON parsed successfully. This does not replace Apps Script runtime testing.
- The Apps Script editor's exact current source version must be confirmed separately. GitHub does not synchronize Apps Script projects.
- Manual execution of `testMediaDeleteDriveTrashFailure()` in the isolated `SMM Operations TEST` project remains pending.
- Historical focused TEST results apply only to the named source/test run. Re-run relevant tests after copying reconciled source into the isolated TEST project.

## Architecture decision: Google-only first

Use Google Apps Script + Google Sheets + Google Drive with the existing personal and work Google accounts. Do not adopt Cloudflare Workers, Supabase or another backend as the production runtime at this stage. A separate runtime benchmark is an isolated experiment only; it is not an approved deployment or architecture change.

The implementation remains modular: API router, account/authentication, CAPTCHA, session handling, authorization, repositories, media storage, publishing lifecycle and provider adapters remain separate modules.

## Target ownership model

- Personal Google account: owns the Master spreadsheet and Master-side authority for user identity, account status, resource mappings, session/role metadata, social-connection metadata and audit metadata.
- Work Google account: owns operational spreadsheets and dedicated media folders.
- Operations must securely verify authorization from Master before acting for a user. The two-script split and signed inter-script authorization contract are not yet implemented or runtime-verified.
- The browser never chooses spreadsheet IDs or Drive folder IDs. The server resolves resources from trusted mappings.
- Staff should not receive access to the Master workbook or Apps Script editor by default.

## Source modules

- `Api.gs`, `HealthService.gs`: public health response and deliberately restricted request router.
- `Config.gs`: private Script Properties access and CAPTCHA configuration.
- `AccountService.gs`, `RegistrationService.gs`, `OtpService.gs`, `LoginService.gs`, `PasswordRecoveryService.gs`, `PasswordService.gs`, `SessionService.gs`, `AccountAdminService.gs`: account lifecycle, OTP, password and session service modules.
- `CaptchaService.gs`: server-side reCAPTCHA verification.
- `Schema.gs`, `SheetRepository.gs`: versioned sheet contracts, row helpers, targeted updates and audit writes.
- `OperationalSetup.gs`, `OperationalService.gs`: TEST setup and per-user brand, post, target and media-link operations.
- `MediaService.gs`, `MaintenanceService.gs`: upload, guarded deletion, retention preview/cleanup and pending-trash reconciliation.
- `PublishingQueueService.gs`, `PublishingClaimService.gs`, `PublishingService.gs`, `PublishingWorkerService.gs`: queue selection, claims, preflight and outcome lifecycle.
- `MetaOAuthStateService.gs`: short-lived, single-use OAuth state foundation only. It does not build Meta authorization URLs, exchange codes or store provider tokens.
- `PublishingProviderAdapter.gs`: mock provider only; it makes no external provider calls.

## Test modules

The TEST export includes focused tests for schemas/repositories, sessions, post deletion and aggregation, cancellation safety, publishing queue/claims/outcomes, media upload rollback, media replacement rollback, media deletion/cleanup failures, pending-trash reconciliation, and Meta OAuth state validation/lifecycle.

Tests that access Sheets must be run only against the explicitly configured TEST workbooks and synthetic records. Pure helper tests may use in-memory objects only. Review each test's setup, Script Properties and cleanup behavior before running it. Do not assume every test is safe merely because its filename includes Test.

## Critical media deletion state model

User deletion and retention cleanup use a recoverable sequence:

1. Confirm the media is not protected or referenced by a post and belongs to the mapped media folder.
2. Write status: `trash_pending` to the MediaLibrary row before changing Drive.
3. Attempt the Drive trash operation.
4. Only after Drive succeeds, write status: `trashed` and `retention_status: cleaned`.
5. Write the audit event after the state transition.

If the Drive operation fails, the row intentionally remains `trash_pending`; it must not be represented as available. If finalization fails after Drive succeeds, the row also remains pending. `reconcilePendingMediaTrash_()` finalizes only after Drive confirms the file is already trashed, the file belongs to the mapped folder, and no post references it. It does not initiate a new trash operation.

`ENABLE_MEDIA_CLEANUP` remains disabled. Do not run cleanup or enable this flag as part of ordinary verification.

## API and production readiness

- Health reports status: `source_scaffold`; it is not proof of deployment or readiness.
- Registration/email OTP and password recovery are feature-gated and must remain disabled until explicitly approved.
- Login, logout, session, account deletion and admin routes return `AUTH_TRANSPORT_NOT_CONFIGURED`.
- Secure browser session transport, cross-origin behavior, request replay protection and Master-to-Operations authorization remain blockers.
- Meta OAuth state handling is groundwork only. There is no complete callback, token vault/refresh lifecycle or live provider adapter.
- Publishing workflows use a mock provider. There are no live Meta API calls or publishing triggers.

## Required Script Properties

Set private values only in the isolated Apps Script TEST project. Never place secret values in source, GitHub, Notion, ordinary Sheets or chat.

- `APP_ALLOWED_HOSTNAME`
- `MASTER_SPREADSHEET_ID`
- `OPERATIONAL_TEST_SPREADSHEET_ID`
- `OTP_HMAC_SECRET`
- `SESSION_HMAC_SECRET`
- `SESSION_TOKEN_GENERATION_SECRET`
- `BOOTSTRAP_ADMIN_EMAIL` (only for an explicitly approved manual bootstrap)
- `RECAPTCHA_REGISTRATION_SECRET` and, if used, `RECAPTCHA_LOGIN_SECRET`
- Optional CAPTCHA score/action settings
- `ENABLE_FIRST_ADMIN_BOOTSTRAP`, `ENABLE_PUBLIC_REGISTRATION`, `ENABLE_PUBLIC_RECOVERY`, `ENABLE_SCHEMA_INITIALIZATION`, `ENABLE_OPERATIONAL_SCHEMA_INITIALIZATION` and `ENABLE_MEDIA_CLEANUP` only when a specific documented TEST operation requires them; remove temporary flags immediately afterward.

Never enable public routes or cleanup merely to make a test pass. Keep secrets private and rotate any previously exposed CAPTCHA secrets before use.

## Stored time policy

Store event and scheduled timestamps in UTC. Store the user's intended timezone separately for display and schedule interpretation. Do not assume the Apps Script manifest timezone is the user's timezone; verify the actual TEST project setting before relying on time-based behavior.

## Current implementation boundary

This code is a development foundation with selective TEST verification, not a production backend. No real social account connection, public login/session flow, or real publishing is available. The frontend must remain fail-closed until the secure transport and authorization contracts are completed and reviewed.
