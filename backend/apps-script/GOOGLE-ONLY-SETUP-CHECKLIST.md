# Google-only backend TEST setup checklist

This checklist applies only to the isolated development/test environment. Do not use real user, client, media or social-account data.

## Decision

The approved first architecture is Google Apps Script + Google Sheets + Google Drive using the existing personal and work Google accounts. Do not create a Cloudflare/Supabase production dependency. The optional worker benchmark is an isolated experiment and must not be deployed without a separate decision.

## Existing TEST resources

- Personal-owned master test workbook: SMM Master TEST.
- Work-owned operational test workbook: SMM Operations TEST.
- Isolated Apps Script TEST project: verify its owner/account and Script Properties before copying code or running a function.
- Test Drive folders: use only dedicated TEST folders and synthetic files.

Never infer that the Apps Script editor contains the latest GitHub code. GitHub and Apps Script do not auto-sync.

## Source synchronization

1. Use the reviewed source branch and exact commit, not a random branch or the live/default JTCodes branch.
2. Copy the complete contents of each required .gs file into the matching file in the isolated TEST Apps Script project.
3. Confirm the target project is the TEST project and its private Script Properties point only to SMM Master TEST and SMM Operations TEST.
4. Do not paste Script Property values, IDs or secrets into GitHub, Notion or chat.
5. Record the source commit and the date of the manual copy. Re-check the Apps Script editor after any later source update.

## Apps Script source inventory

Core services:
- Api.gs, Config.gs, HealthService.gs, CaptchaService.gs
- AccountService.gs, AccountAdminService.gs, RegistrationService.gs, OtpService.gs
- LoginService.gs, PasswordService.gs, PasswordRecoveryService.gs, SessionService.gs
- Schema.gs, SheetRepository.gs, OperationalSetup.gs, OperationalService.gs
- MediaService.gs, MaintenanceService.gs
- PublishingQueueService.gs, PublishingClaimService.gs, PublishingService.gs, PublishingWorkerService.gs
- MetaOAuthStateService.gs, PublishingProviderAdapter.gs

Focused TEST files:
- Tests.gs, SessionLifecycleTest.gs, PostDeletionSafetyTest.gs, PostAggregateStatusTest.gs
- CancellationSafetyTest.gs, CancellationSafetyIntegrationTest.gs
- PublishingEndToEndTest.gs
- MediaFailureInjectionTest.gs, PostMediaReplacementFailureTest.gs, PostMediaOldLinkFailureTest.gs
- MediaDeleteSheetWriteFailureTest.gs, MediaCleanupSheetWriteFailureTest.gs, MediaTrashReconciliationTest.gs
- MetaOAuthStateTest.gs, MetaOAuthStateLifecycleTest.gs, MediaDeleteDriveTrashFailureTest.gs

The Apps Script manifest is appsscript.json. Include it only when managing the project with a source-control workflow that supports the manifest; do not paste JSON into a .gs editor file.

## Safe verification order

1. Confirm the active Google account and exact TEST project.
2. Confirm Master and Operations TEST workbook IDs are different and the workbook names contain TEST.
3. Run read-only schema verification before any initialization.
4. Run pure in-memory tests first.
5. Run focused TEST workbook tests one at a time and inspect the full execution log.
6. Verify every test's ok, passed/total, cleanup result, and any realDriveTouched / realSheetsTouched flags.
7. Confirm synthetic rows are removed or explicitly recorded for manual cleanup.
8. Record which exact source commit is installed in Apps Script.

Do not run all tests blindly. Some tests intentionally require a TEST workbook, create synthetic rows, or require manual confirmation. Read each test's guard and side effects first.

## Important safety flags

- Keep ENABLE_MEDIA_CLEANUP disabled. Never enable it for routine testing.
- Keep ENABLE_PUBLIC_REGISTRATION and ENABLE_PUBLIC_RECOVERY unset.
- Do not enable public login/session/admin routes.
- Do not enable time-driven triggers or provider calls.
- Keep real Meta credentials and social accounts out of TEST.
- Do not run cleanup against real Drive media.

## Current blockers before integration

- Secure browser session transport and cross-origin behavior are not approved.
- The Master-to-Operations signed authorization contract is not implemented or verified.
- Complete Meta OAuth callback and token lifecycle are not implemented.
- Publishing provider is mock-only; no real publishing is available.
- Runtime tests must be repeated against the exact reconciled source in the isolated TEST project before treating this snapshot as verified.

## Stop conditions

Stop and review if a workbook name/ID is unexpected, a property points to a non-TEST resource, a test tries to resolve an unknown Drive file, cleanup is requested without explicit approval, or any real social/provider credential is present.
