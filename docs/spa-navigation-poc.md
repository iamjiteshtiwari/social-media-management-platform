# SPA Navigation Proof of Concept

## Scope

This branch adds lightweight, vanilla-JavaScript navigation to the existing workspace pages. It is a proof of concept, not a production release.

The router is loaded by these existing pages:

- Dashboard
- Brand management
- Social accounts
- Content planner
- Media library
- Post editor
- Publishing queue
- Analytics
- Notifications
- Admin approvals

## Behavior

- Intercepts same-origin links between the listed workspace pages.
- Fetches the destination HTML and replaces only the `#main-content` content.
- Updates the document title, body page class, stylesheets, active navigation item, and browser URL.
- Uses the History API so Back and Forward can navigate between workspace pages.
- Loads the relevant page UI script and calls its reusable initializer after content replacement.
- Falls back to ordinary page navigation if a page request or main-content lookup fails.
- Leaves authentication pages and the public landing page on ordinary navigation.
- Does not enable backend, login, uploads, OAuth, scheduling, or publishing.

## Manual browser QA required

Run on a local static server or a preview deployment of this branch; do not test by opening HTML through a `file://` URL.

1. Open `dashboard.html`, then navigate to Social Accounts and Content Planner. Confirm the browser does not perform a full document reload.
2. Check the URL and active navigation state after each transition.
3. Use browser Back and Forward several times.
4. Refresh each destination page directly and confirm it still loads normally.
5. Navigate Dashboard → Social Accounts → Dashboard repeatedly. Confirm menu, theme, account popup, and page-specific controls do not accumulate duplicate behavior.
6. Test Media Library filters and reset; Post Editor preview controls; Publishing Queue and Notifications filters; Analytics range controls; Admin Approval preview actions.
7. Test narrow/mobile and desktop widths, light and dark themes, keyboard navigation, and browser console/network errors.
8. Confirm links to login/register/landing pages use ordinary navigation and that all actions remain clearly preview-only.

## Safety boundaries

- This branch is based on `JTCodes`.
- No merge or deployment is performed by this proof of concept.
- Do not modify the portfolio repository or site.
- Do not connect or change backend Apps Script, Sheets, Drive, credentials, OAuth, or publishing settings.
