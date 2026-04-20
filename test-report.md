# Step 6 Test Report — PR #6

**Summary:** Ran the full UI stack (Next.js web + NestJS API + Postgres/pgvector) locally on `devin/1776639127-step-6-workflow-indexing` and drove every user-visible Step 6 behavior end-to-end. All 5 tests pass. One bug was discovered and fixed mid-test (commit `d44eac4` — mock LLM now emits valid JSON for FOIA prompts); without that fix the FOIA happy path returns 500.

**Session:** https://app.devin.ai/sessions/e9ebfbbad57f4bcebf955721da008f16
**PR:** https://github.com/Cescolinguisticservices/RFP-Pulse/pull/6
**Branch:** `devin/1776639127-step-6-workflow-indexing`
**Last tested commit:** `d44eac4`
**Recording:** attached (browser walkthrough with structured annotations)

## Escalations (read first)

1. **Bug found + fixed mid-test (now included in the PR).** `DeterministicMockChatModel` was returning plaintext for every prompt. `FoiaAnalyzerService.parseAnalysis()` requires strict JSON and threw `FOIA analyzer returned non-JSON output: Draft response (mock openai): …`, surfacing as **HTTP 500** on the `/uploads` FOIA card. The fix makes the mock context-aware: when the prompt contains `pricingModel` + `technicalStrategies` + `winThemes` (the FOIA schema fields), it returns a valid JSON object referencing a real excerpt from the uploaded text. A unit test was added; `pnpm test:e2e` (33/33), `pnpm lint`, `pnpm typecheck` all pass.
2. **Two yellow findings from Devin Review remain unfixed and are not blockers for this session**:
   - TOCTOU race in `POST /api/answers/:id/transition` — two concurrent valid transitions could both succeed against a stale read. Demo is single-operator, not reproducible.
   - Chunker overlap can push a chunk past `maxChars` when the paragraph boundary falls deep into the overlap window. Not reproducible at our 1200/120 defaults on real-world text; still worth tightening. Flagging for a follow-up PR.
3. **Env-config + merge reminders (unchanged from prior steps)**: PRs #1–#6 are still unmerged; `main` is not yet the default branch; the env-config suggestion that boots Postgres/migrates/seeds is still pending approval. None blocked this test pass.

## Test results

- **Test 1 — Auto-index RFP upload writes `KnowledgeBaseEntry` rows with non-null embeddings:** `passed`
- **Test 2 — Workflow state machine DRAFTING → IN_REVIEW → PENDING_APPROVAL → APPROVED (terminal, no buttons):** `passed`
- **Test 3 — READ_ONLY is blocked in both UI and API (403 on direct `POST /api/answers/:id/transition`):** `passed`
- **Test 4 — FOIA upload + `/competitors` viewer renders extracted fields:** `passed` (after fix `d44eac4`; without it: `failed`)
- **Test 5 — Invalid transition (APPROVED → DRAFTING) returns HTTP 400 with `Allowed next states: (none — terminal)`:** `passed`

## DB evidence (queried via Prisma after the run)

```json
{
  "competitorIntel": [
    {
      "id": "cmo6eroip0003y1fvsrgpagu1",
      "competitorName": "Acme Rival Co",
      "pricingModel": "[mock openai] Pricing excerpt: Rival Cloud Platform Competitive Proposal (public FOIA release) Pricing Model: Rival Cloud bills on a per-seat subscription with a $49/user/month base tier plus a 15% usage surchar"
    }
  ],
  "kbWithEmbeddings": 2,
  "documents": 6,
  "answers": [
    { "state": "DRAFTING", "generatedBy": null, "questionId": "cmo56l3w400064s87ek3erpwz" },
    { "state": "DRAFTING", "generatedBy": "OPENAI", "questionId": "cmo6bhvi6000a5g8onc6fk3kz" },
    { "state": "DRAFTING", "generatedBy": "OPENAI", "questionId": "cmo6bhvic000g5g8o4z33pefr" },
    { "state": "APPROVED", "generatedBy": "OPENAI", "questionId": "cmo6bhvi8000c5g8ogkl0tu8y" }
  ]
}
```

Interpretation:

- `kbWithEmbeddings: 2` → Test 1 Assertion B: RFP ingestion wrote real `KnowledgeBaseEntry` rows with non-null 1536-d vectors (baseline was 0).
- `answers[].state === "APPROVED"` on the `zero-downtime database migrations` question → Test 2 drove the full DRAFTING→APPROVED chain and the terminal state persists across reload (DB-backed, not just React state).
- `competitorIntel` row with non-empty `pricingModel` → Tests 4a + 4b: FOIA analyzer invoked, LLM JSON parsed, row persisted, viewer renders it.

## Screenshots — Test 4 (FOIA bug fix)

### Before fix (🔴) — 500 Internal Server Error

![FOIA 500 error before fix](https://app.devin.ai/attachments/2050ae3b-2065-462d-92d2-cfae9b47d102/screenshot_b21bdf5595f842bdb89c25b954e2c693.png)

### After fix (🟢) — extracted pricing/strategies/winThemes

![FOIA upload success](https://app.devin.ai/attachments/12e94015-96f4-49af-873a-7115b647a2da/screenshot_c460e0e118764f34a2504ba6892e3b17.png)

### `/competitors` viewer (🟢) — new Acme Rival Co row

![Competitor Intel viewer](https://app.devin.ai/attachments/f7eccfd7-9ef7-4061-9851-03b66d5d6509/screenshot_d0a9d9de057145849a589b27276a7049.png)

## What was intentionally out of scope

- Regression of Steps 1–5 (auth, RAG factory, ingestion parsers, dashboard, Draft Response) — covered in prior session reports.
- Real LLM provider keys — tenant default is `OPENAI`; with no `OPENAI_API_KEY` set, the factory falls back to `DeterministicMockChatModel` (deterministic stub text) and `mock-embeddings` (deterministic 1536-d vectors). The flow still writes real DB rows with real embeddings; only the text content is stubbed. This is called out in the prior README and is by design for CI.
- S3 upload — `Document.s3Key` is still nullable; not part of Step 6.
- Multi-user concurrency (TOCTOU on transitions) — flagged above.

## Reproduction commands

```bash
cd /home/ubuntu/repos/rfp-pulse
pnpm -C packages/db db:up
pnpm -C packages/db db:migrate
pnpm -C packages/db db:seed
pnpm -C apps/api build && node apps/api/dist/main.js &    # :4000
pnpm -C apps/web dev &                                     # :3000
# sign in at http://localhost:3000 as admin@acme.test / password123
```
