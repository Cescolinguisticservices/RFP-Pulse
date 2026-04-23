# Step 8 test plan — public tenant signup via SUPER_ADMIN invite links

PR: https://github.com/Cescolinguisticservices/RFP-Pulse/pull/8
Branch: `devin/1776688365-step-8-tenant-signup-invite`
CI: 2/2 green (Lint/Typecheck/Build, Devin Review)

## Stack
- Postgres 16 + pgvector on `:5432` (docker)
- NestJS API on `:4000` (`node apps/api/dist/main.js`)
- Next.js on `:3000` (`pnpm -C apps/web dev`)
- SUPER_ADMIN: `super@rfp-pulse.test` / `password123` on tenant `platform`
- **Env note**: web loads `apps/web/.env.local` (`NEXTAUTH_SECRET=dev-shared-secret-for-local-testing-only-32b`); API must use the same secret, otherwise JWTs signed by web fail `passport-jwt` verification and every authenticated call 401s. Root `.env` ships with a placeholder secret — load `apps/web/.env.local` into the API process before `node apps/api/dist/main.js`. Not a code regression; local-env mismatch only.

## Primary flow
SUPER_ADMIN generates an invite → copies the one-time `/signup/<token>` URL → pastes it in a **fresh** browser tab → picks company name / slug / email / password → submits → auto-signs-in → lands on `/dashboard` as the new tenant's ADMIN → second redeem of the same URL fails → an expired invite redeem fails.

## Assertions (adversarial; each would fail on a broken impl)

### A — One-time display
- On `/admin/tenants`, fill **Create signup invite** (intended company = "Globex Trading", intended email = `owner@globex.test`) → click **Generate signup link**.
- Callout renders with heading `Signup link generated — share this URL once with the prospect` and the absolute `http://localhost:3000/signup/<token>` URL.
- Hard reload `/admin/tenants` → callout is gone (no endpoint to re-retrieve raw token).

### B — Happy redeem + auto-signin
- Open the generated URL in a fresh tab (no cookies carried via new incognito-equivalent session).
- `/signup/[token]` renders the form; Company pre-filled to `Globex Trading`, email pre-filled to `owner@globex.test`.
- Fill slug = `globex`, name = `Jane Owner`, password = `goodpass!` (≥8 chars) → submit.
- Within ~3s, browser lands on `/dashboard`. Sidebar shows Admin → `Users` + `Settings` (but NOT `Tenants`, since signed in as tenant-scoped ADMIN not SUPER_ADMIN).
- DB check: row in `Tenant` with slug=`globex`; row in `User` with email=`owner@globex.test`, role=`ADMIN`, `passwordMustChange=false`.
- `TenantInvite` row has non-null `usedAt` and `redeemedTenantId` = the new tenant.

### C — Replay same URL → single-use rejection
- In a second fresh tab, paste the same URL.
- `/signup/[token]` fetches status → renders the error banner with literal text `This invite link has already been used.`
- No form is rendered.

### D — Expired invite → error banner
- Generate a **second** invite with TTL=1 day.
- Direct DB update: `UPDATE tenant_invites SET "expiresAt" = NOW() - INTERVAL '1 day' WHERE id = ...`.
- Open the expired URL in a fresh tab.
- `/signup/[token]` renders error banner with literal text `This invite link has expired.`

## Out of scope
- Abuse mitigation (captcha / disposable-email blocklist) — called out in PR description as follow-up.
- Email delivery (no provider wired by design for Step 8).
- Signing out first when redeeming while signed into another tenant (noted in PR as a follow-up).

## Artifacts
- Screen recording (desktop, maximized browser, with annotations per assertion)
- Consolidated single comment on PR #8 with recording + collapsible test report
