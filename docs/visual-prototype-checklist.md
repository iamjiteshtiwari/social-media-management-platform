# Visual Prototype Completion Checklist

## Goal

Finish and QA the complete visual prototype before starting backend/service integration. Continue from the current `JTCodes` branch and reuse the existing custom CSS system; do not recreate or duplicate pages.

## Existing page inventory — built

All listed pages were reviewed at source level for their intended preview behavior. Browser rendering and device QA remain separate final checks.

- [x] Platform overview and feature entry points
- [x] Registration, sign-in, password recovery, email OTP and pending approval pages
- [x] Dashboard and account settings preview
- [x] Brand management and social account catalogue
- [x] Post editor and calendar/content planner
- [x] Publishing queue, media library, analytics and notifications
- [x] Administrator approval queue concept
- [x] Shared header, account popup, logo destination popup and footer

## QA fixes to address

- [x] Source-check local HTML links and in-page anchors across all 17 pages; no broken local page links or missing anchor targets found.
- [ ] Test account popup and logo destination modal on desktop and mobile, including click, outside click, Escape dismissal, keyboard focus and scrolling.
- [x] Review workspace menu handlers for both navigation markup variants; add outside-click, Escape, focus restoration and desktop-resize closing to the dashboard variant.
- [x] Review registration, sign-in, password recovery and OTP client-side validation/feedback; actions remain preview-only.
- [x] Review future date/time validation and calendar month navigation; reporting-period selection now updates illustrative chart labels and status feedback.
- [x] Review queue and notification filters/search, read states, media filters and approval sample actions; repaired a syntax error that prevented the shared queue/notification/approval script from running.
- [ ] Verify mobile, tablet and desktop layouts; horizontal table scrolling; long text; chart and calendar overflow.
- [x] Source-check duplicate IDs, local links and anchor targets; add a keyboard focus loop to the logo destination dialog.
- [ ] Run JavaScript syntax checks and browser-console checks in a real browser; source review alone is not a substitute.
- [ ] Inspect the deployed app in a working browser on desktop, tablet and mobile before claiming browser QA or deployment verification.

## Local-only behavior boundary

Every action must remain local-only and clearly identified as a prototype. Never imply that a real account, post, notification, approval, upload, social connection or report was saved, sent, verified or published. Sample users, posts, metrics, connections and notifications are fictitious.

## Integration boundary

No backend, real authentication, email delivery, persistence, file upload, OAuth, scheduling, analytics API or publishing is active. Do not begin service integration until all visual pages have been checked and reviewed. Keep the main portfolio website and its repository out of scope and untouched.
