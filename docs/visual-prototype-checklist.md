# Visual Prototype Completion Checklist

## Goal

Complete the visual experience and local-only interactions across the planned social media management workflows before beginning service integration.

## Current visual page inventory

- [x] Platform overview and feature entry points
- [x] Registration form layout and client-side field validation
- [x] Sign-in layout and password visibility control
- [x] Password recovery layout
- [x] Email OTP entry layout
- [x] Pending administrator approval state
- [x] Dashboard and summary cards
- [x] Brand management empty state and workflow explanation
- [x] Social account integration catalogue
- [x] Post editor with caption, hashtags, brand/platform selection, schedule input and local preview
- [x] Calendar planner with month navigation
- [x] Publishing queue with sample statuses, filtering and search
- [x] Media library with sample items and type/search filtering
- [x] Analytics and reports with illustrative charts and tables
- [x] Notifications with filters and local read-state interactions
- [x] Account settings preview
- [x] Administrator approval queue concept with local sample review controls
- [x] Shared header, account popup, logo destination popup and footer

## Local-only behavior

The prototype may change its own visible state to demonstrate a workflow, but must never imply that a real account, post, notification, approval, upload, social connection or report was saved or sent. All example users, metrics, posts, connections and notification records are fictitious.

## Remaining visual QA

- Review each page at narrow mobile, large mobile, tablet and desktop widths.
- Check keyboard navigation, focus visibility, escape/outside-click dismissal and accessible names.
- Check each navigation link, empty state, filter, validation message, popup and action feedback.
- Confirm date/time controls, long content, table overflow and responsive chart behavior.
- Check for broken links, missing assets, duplicate IDs, missing labels, console errors and JavaScript syntax errors.
- Inspect the deployed app in a working browser before marking browser QA or deployment verified.

## Integration boundary

No backend, real authentication, email delivery, data persistence, file upload, OAuth, scheduling, analytics API or publishing is active. Start service integration only after the visual pages have been reviewed and approved. Keep the portfolio website and its repository read-only and out of scope.
