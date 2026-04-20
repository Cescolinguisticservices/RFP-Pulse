# Step 7 Test Plan — Tenant + User Management (PR #7)

## What changed
- Admins can provision new companies (tenants) + users from the UI.
- Temp-password invite flow (no email provider required): admin-generated password shown once, user is forced to change it on first login.
- Sidebar reveals an **Admin** section based on role.

## Primary flow (one recording, one pass)

1. **SUPER_ADMIN provisions a new tenant.**
   - Sign in as `super@rfp-pulse.test / password123`.
   - Navigate to `/admin/tenants` via the sidebar.
   - Submit form: name `Globex Corp`, slug `globex`, adminEmail `owner@globex.test`, adminName `Gigi Owner`, defaultProvider `OPENAI`.
   - **Assertion A1**: Yellow/amber callout appears showing `owner@globex.test` + a 14-char temp password (monospace). Pass requires the literal substring `One-time password` to be visible. Record the exact password.
   - **Assertion A2**: After reload (F5), the callout is gone and the new row `globex` is listed in the tenants table with defaultProvider `OPENAI`. Would fail if the API returned stale data or the page cached aggressively.

2. **New ADMIN logs in and is force-redirected.**
   - Sign out (via the sidebar Sign out button).
   - On `/login`, enter `owner@globex.test` + the temp password from A1.
   - **Assertion B1**: URL after login is exactly `/account/change-password`, NOT `/dashboard`. A broken redirect would land on `/dashboard` or the prior session.
   - **Assertion B2**: Page contains the literal text `You must change your temporary password before continuing.` (from `change-password-form.tsx`). A broken must-change flag would display the voluntary-change copy instead.

3. **Change password + session unlock.**
   - Fill currentPassword with the temp password, newPassword `newsecret123`, confirm `newsecret123`, submit.
   - **Assertion C1**: Browser navigates away from `/account/change-password` to `/dashboard` within 3 seconds. Broken session-update would leave the user stuck on the change-password page (because the forced redirect would re-fire).
   - **Assertion C2**: Sidebar shows `owner@globex.test` and role `ADMIN`. Tenant label reads `Tenant: globex`. Admin section contains `Users` and `Settings` (NOT `Tenants`, because `owner@globex.test` is ADMIN, not SUPER_ADMIN).

4. **ADMIN invites a tenant user.**
   - Navigate to `/admin/users`.
   - Submit invite form: email `sme1@globex.test`, name `Sam SME`, role `SME`.
   - **Assertion D1**: Temp-password callout appears with a new 14-char monospace password. The email shown is `sme1@globex.test`. Record it.
   - **Assertion D2**: The users table now has two rows (`owner@globex.test` marked `(you)` with no role editor; `sme1@globex.test` with role `SME` and password column `Must change on next login`).

5. **Cross-tenant / cross-role RBAC.**
   - Sign out. Sign in as `readonly@acme.test / password123`.
   - **Assertion E1**: Sidebar does NOT contain an `Admin` section. Specifically, no nav item with text `Users` or `Settings` or `Tenants` is visible. A broken role check would show them.
   - Manually navigate to `http://localhost:3000/admin/users`.
   - **Assertion E2**: Page renders `Forbidden — only tenant ADMIN users may invite or manage users.` (from `users/page.tsx`). Would fail if RBAC were missing (would render the invite form) or returned a blanket 500.

## What a passing run looks like (sanity checks for myself)
- Each temp password is different between tests A1 and D1.
- The forced-change flag clears — signing out of the new ADMIN and signing back in with `newsecret123` lands directly on `/dashboard` (no change-password detour).
- At no point do I need DevTools or direct API calls to prove the flow.

## What I'm deliberately NOT covering in this recording
- Drag-and-drop uploads + workflow state machine (covered in Step 6 recording).
- All 19 Jest e2e cases (they ran in CI; I'm demonstrating UX end-to-end here).
- Settings page provider change (mentioned in sidebar check only — reserved as one extra click if time permits).
