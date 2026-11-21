# Repository Branch Strategy

Status checked: 21 November 2026  
Repository: [iamjiteshtiwari/social-media-management-platform](https://github.com/iamjiteshtiwari/social-media-management-platform)

## Source-of-truth rules

1. GitHub is the source of truth for repository code.
2. `JTCodes` is the default/live GitHub Pages branch. Treat it as protected: no direct feature/backend changes and no merge/deployment without explicit user approval.
3. Work only on the branch assigned to the relevant task. Frontend and backend work remain isolated until their contracts are ready.
4. Google Apps Script is not automatically synchronized with GitHub. A GitHub commit is not evidence that the TEST editor contains that source.
5. Never infer that a branch is safe to merge merely because it is ahead or marked mergeable. Review its base, changed files, tests, and runtime evidence.

## Active branch registry

| Branch | Purpose | Current state | Correct use |
|---|---|---|---|
| [`JTCodes`](https://github.com/iamjiteshtiwari/social-media-management-platform/tree/JTCodes) | Default/live frontend | Current GitHub Pages source; latest checked commit `a6c6db4` | Read-only baseline unless the user explicitly approves a release |
| [`frontend/app-shell-backend-ready`](https://github.com/iamjiteshtiwari/social-media-management-platform/tree/frontend/app-shell-backend-ready) | Isolated frontend integration line | ahead of JTCodes and not behind it at this audit; not merged/deployed | Continue frontend integration and browser QA here |
| [`s4-backend-foundation`](https://github.com/iamjiteshtiwari/social-media-management-platform/tree/s4-backend-foundation) | Backend development line | 211 commits ahead and 35 behind JTCodes at this audit; deliberately divergent | Backend baseline; do not merge wholesale into JTCodes |
| [`reconcile/latest-test-export-2026-11-21`](https://github.com/iamjiteshtiwari/social-media-management-platform/tree/reconcile/latest-test-export-2026-11-21) | Latest Apps Script TEST-export reconciliation | ahead of s4-backend-foundation and not behind it; 41 export entries reconciled, one test expectation intentionally corrected | Review draft PR #4; manual TEST runtime verification is still required |

## Draft pull request

[PR #4 — Reconcile Apps Script backend with latest TEST export](https://github.com/iamjiteshtiwari/social-media-management-platform/pull/4)

- Head: `reconcile/latest-test-export-2026-11-21`
- Base: `s4-backend-foundation`
- State: open, draft, unmerged.
- Purpose: reconcile Apps Script source and supporting backend documentation, not deploy the backend.
- Do not retarget this PR to `JTCodes`. Do not merge until the exact TEST source has been checked, the corrected media failure test has been run in the isolated TEST project, and the diff is reviewed.

## Historical / superseded branches

| Branch | Verified relation to JTCodes | Disposition |
|---|---|---|
| [`spa-navigation-poc`](https://github.com/iamjiteshtiwari/social-media-management-platform/tree/spa-navigation-poc) | 3 commits behind; its SPA work was merged via `7c9f5fe` | Historical reference only; do not continue work here |
| [`fix/post-editor-media-feedback`](https://github.com/iamjiteshtiwari/social-media-management-platform/tree/fix/post-editor-media-feedback) | 1 commit behind; no unique commits ahead | Superseded; do not continue work here |
| [`test/media-delete-drive-trash-failure`](https://github.com/iamjiteshtiwari/social-media-management-platform/tree/test/media-delete-drive-trash-failure) | One test-only commit ahead of s4-backend-foundation; older version of the regression test | Superseded by the corrected test on the reconciliation branch and PR #4; retain as history |

These historical branches are intentionally not deleted. No branch deletion or force-push is authorized by this document.

## Canonical file paths

- Root project overview: `README.md`
- Branch policy: `docs/BRANCH-STRATEGY.md`
- Architecture: `docs/architecture.md`
- Auth design: `docs/authentication-backend-contract.md`
- Backend runtime/API contract: `docs/backend-runtime-and-internal-api-contract.md`
- Apps Script source and setup: `backend/apps-script/`
- Apps Script guide: `backend/apps-script/README.md`
- TEST setup checklist: `backend/apps-script/GOOGLE-ONLY-SETUP-CHECKLIST.md`
- Frontend integration contract: `docs/FRONTEND-BACKEND-CONTRACT.md` on `frontend/app-shell-backend-ready`.

## Current safe next action

Complete the manual TEST verification of `testMediaDeleteDriveTrashFailure()` using the exact corrected file on the reconciliation branch. Do not merge PR #4, change Script Properties, enable cleanup, run cleanup, deploy, or touch production resources as part of that step.
