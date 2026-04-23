# Step 8 — Invite-link tenant signup: test report

PR: https://github.com/Cescolinguisticservices/RFP-Pulse/pull/8
Branch: `devin/1776688365-step-8-tenant-signup-invite`
Session: https://app.devin.ai/sessions/e9ebfbbad57f4bcebf955721da008f16
Recording: https://app.devin.ai/attachments/8300c0ca-3d32-4af0-b338-44496f9690d9/rec-cedc154c-d4e3-472a-8e88-b793289711cd-edited.mp4

## Summary

All 4 adversarial assertions passed in a single browser walkthrough — invite generation, fresh redeem + auto-signin, replay rejection, expired rejection.

## Escalations

- **Local env gotcha** (not a code bug): `apps/web/.env.local` ships `NEXTAUTH_SECRET=dev-shared-secret-for-local-testing-only-32b`, but root `.env` still has the `replace-me-...` placeholder. If the API boots with root `.env` alone, every JWT issued by web fails `passport-jwt` verification → 401 on all authenticated calls. Fix for local runs: source `apps/web/.env.local` into the API process before `node apps/api/dist/main.js`. Suggest aligning the root `.env` secret in the repo so this can't trip future testers.

## Results

- **A — one-time URL display** — passed. Sky-blue callout reads `Signup link generated — share this URL once with the prospect` + absolute `http://localhost:3000/signup/<token>` URL; hard-reload clears the callout (no endpoint exists to re-retrieve the raw token).
- **B — fresh redeem + auto-signin** — passed. Lands on `/dashboard`; tenant=`globex-trading`; footer shows `owner@globex-trading.test` / `ADMIN`; sidebar Admin section shows Users+Settings but **not** Tenants (correct: new user is ADMIN, not SUPER_ADMIN). DB confirms: Tenant `globex-trading` created, user `ADMIN` with `passwordMustChange=false`, invite `usedAt` set, `redeemedTenantId` matches.
- **C — replay same URL** — passed. Fresh tab on the same URL renders red banner `This invite link has already been used.` — no form rendered.
- **D — expired URL** — passed. Second invite aged past via `UPDATE tenant_invites SET "expiresAt"=NOW()-INTERVAL '1 day'`. Fresh tab renders red banner `This invite link has expired.`

## Evidence

### A — one-time URL display (generate → reload)

| Callout visible once | After F5 reload |
|---|---|
| ![Callout visible](https://app.devin.ai/attachments/cec17427-20c8-45c0-a2b9-634a545ef6c3/screenshot_d160d484e4c14832822159eb9c0958cb.png) | ![Callout cleared](https://app.devin.ai/attachments/7ddeca9b-6f5a-429b-bccc-af1c1ec2281c/screenshot_02c8dc11c0fa4fb590d92cf668358234.png) |

### B — redeem + auto-signin

| `/signup/[token]` form | Landed on `/dashboard` as new tenant's ADMIN |
|---|---|
| ![Signup form](https://app.devin.ai/attachments/fef8dcd9-1c2b-4ebe-a7f4-11a2bc6329a2/screenshot_44cbd12c4a5a44fb91ff30d530de78e5.png) | ![Dashboard](https://app.devin.ai/attachments/daf9c5a0-be38-49fd-8cfc-dcce595f5097/screenshot_50eb82b140864725aab73c83785c9f4c.png) |

DB snapshot:
```json
{
  "tenant": "Globex Trading",
  "slug": "globex-trading",
  "users": [{"email":"owner@globex-trading.test","role":"ADMIN","passwordMustChange":false}],
  "invite": {"usedAt":"2026-04-20T12:54:02.138Z","redeemedTenantId":"MATCH"}
}
```

### C and D — adversarial rejections

| Replay used URL | Expired URL |
|---|---|
| ![Used banner](https://app.devin.ai/attachments/0fedcf25-7d88-4931-99d0-3fad04303399/screenshot_db4fd193899b4d0a8e53d2d93b7c9f19.png) | ![Expired banner](https://app.devin.ai/attachments/09d25eba-e6f3-4532-b066-ba96cf6946e4/screenshot_3edeb856fb354c43a2f43bfd0492e5fc.png) |

## Regression notes (not the thing under test)

- `GET /api/projects` returns 403 for SUPER_ADMIN on tenant `platform` (that tenant has no projects). Pre-existing; not caused by Step 8.
- After redeem auto-signin, the old `/admin/tenants` tab stays mounted showing the *previous* session's page; nav reflects the new (ADMIN) user. Not a functional issue (next click re-auths; no privileged actions issued from stale page).
