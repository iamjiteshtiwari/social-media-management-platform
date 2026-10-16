# Social Media Management Platform

A custom, mobile-first social media management platform prototype built with original HTML, CSS and JavaScript. The frontend-first workflow is intentional: finish and review the visual prototype before connecting any backend or third-party services.

## Visual prototype pages

- `index.html` — platform overview
- `login.html` — sign-in
- `register.html` — create account
- `forgot-password.html` — password recovery
- `verify-email.html` — email OTP entry
- `approval-pending.html` — pending administrator approval
- `dashboard.html` — workspace overview
- `brand-management.html` — brands and accounts
- `content-planner.html` — calendar preview
- `media-library.html` — media library
- `post-editor.html` — composer and local-only post preview
- `account-settings.html` — profile and security settings preview
- `social-accounts.html` — social network integration options preview
- `publishing-queue.html` — draft, scheduled, published and attention-needed posts
- `analytics.html` — sample performance and platform reporting
- `notifications.html` — local-only notification filters and read-state interactions
- `admin-approvals.html` — administrator approval queue concept

## Theme support

All pages include a light/dark theme toggle. The first visit follows the device theme; manual selection is stored in browser local storage and is shared across pages in this browser. The matching light/dark favicon and mobile browser theme color are updated with the selected theme. Theme preference is frontend-only and is not synced across browsers or accounts.

## Quality assurance status

The page inventory exists, but full browser and device QA is not yet verified. See [the visual prototype checklist](docs/visual-prototype-checklist.md) for remaining mobile, tablet, desktop, accessibility, navigation and interaction checks.

## Prototype boundary

This is a visual/local-interaction prototype only. It does not create or authenticate real accounts, send verification or recovery emails, persist data, upload media, connect social accounts, schedule posts, publish content, or fetch live analytics. Sample users, posts, metrics and notifications are fictional. Do not imply that any local preview action changed a real account or service.

## Project boundary

Use the existing custom CSS design system and shared components; do not add Bootstrap or duplicate pages. The main portfolio website and its repository are separate and out of scope. Backend integration begins only after the visual prototype is reviewed and approved.
