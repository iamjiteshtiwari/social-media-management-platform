# Visual Prototype Completion Checklist

## Goal

Finish and QA the complete visual prototype before starting backend/service integration. Continue from the current `JTCodes` branch and reuse the existing custom CSS system; do not recreate or duplicate pages.

## Existing page inventory — built, pending QA

- [x] Platform overview and feature entry points
- [x] Registration, sign-in, password recovery, email OTP and pending approval pages
- [x] Dashboard and account settings preview
- [x] Brand management and social account catalogue
- [x] Post editor and calendar/content planner
- [x] Publishing queue, media library, analytics and notifications
- [x] Administrator approval queue concept
- [x] Shared header, account popup, logo destination popup and footer

## QA fixes to address

- [ ] Verify all page navigation is routed to actual HTML pages where appropriate; remove placeholder anchors that do not represent a real destination.
- [ ] Test account popup and logo destination modal on desktop and mobile, including click, outside click, Escape dismissal, keyboard focus and scrolling.
- [ ] Validate the workspace navigation on all page types and screen sizes.
- [ ] Check registration, sign-in, password recovery and OTP client-side validation and feedback, while keeping every action explicitly preview-only.
- [ ] Check date/time validation and calendar month navigation.
- [ ] Check filtering, searching, read state and approval sample actions.
- [ ] Verify mobile, tablet and desktop layouts; horizontal table scrolling; long text; chart and calendar overflow.
- [ ] Check keyboard navigation, focus visibility, accessible names, labels, duplicate IDs, broken links, missing assets, JavaScript syntax errors and console errors.
- [ ] Inspect the deployed app in a working browser before claiming browser QA or deployment verification.

## Local-only behavior boundary

Every action must remain local-only and clearly identified as a prototype. Never imply that a real account, post, notification, approval, upload, social connection or report was saved, sent, verified or published. Sample users, posts, metrics, connections and notifications are fictitious.

## Integration boundary

No backend, real authentication, email delivery, persistence, file upload, OAuth, scheduling, analytics API or publishing is active. Do not begin service integration until all visual pages have been checked and reviewed. Keep the main portfolio website and its repository out of scope and untouched.
