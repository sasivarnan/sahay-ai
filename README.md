# Sahay AI

A multilingual payment-resolution prototype for TeamApex. All payment systems, transactions, and policies are simulated. Live Sarvam calls are labelled separately.

## Run

Requires Node.js 22.12+ and pnpm. Python and Docker are not required.

```sh
pnpm install
pnpm dev
```

Open the customer view at http://127.0.0.1:3000/customer/chats and the admin view at http://127.0.0.1:3000/admin/cases in separate browser windows. The root `.env` is loaded by the server. Set `SARVAM_API_KEY` for live chat and Bulbul v4 Flash playback. Set `CHAT_MODE=simulation` for an explicit offline AI simulation.

Without `DATABASE_URL`, the app uses an embedded PostgreSQL database in `apps/web/.data/postgres`. It survives app restarts. Use only one development server against this directory. With `DATABASE_URL`, the app uses external PostgreSQL.

## Demo

1. Select the ₹650 recharge. Investigate it. The mock refund service accepts the refund and loses its response; Sahay recovers the original action.
2. In the admin view, select the case and open **Demo controls → Advance simulation** to run this case's saved follow-up immediately, or wait one minute with the development server running.
3. Select the ₹4,800 case and investigate. Open the separate **Admin → Case inbox**, enter the local team code `sahay-finals`, and approve the exact proposal.
4. The ₹1,200 case confirms merchant credit without a refund.
5. The ₹900 case waits for an unavailable status service, then verifies merchant credit on its follow-up.
6. Open **Admin → Results** for counts from saved records. No production savings or accuracy percentages are claimed.

Customer and admin use separate session cookies, so normal windows in the same browser can show both views. Unlocking or locking admin does not change the customer session. Admin pages have no conversation sidebar; customer pages have no admin links. Old `/chats`, `/team`, and `/results` URLs redirect to the new routes.

Only admin can reset a case or advance simulated time.

The team code must be set explicitly for a production deployment. Customer sessions cannot read another customer's cases or approve actions. Reset deletes only the selected demo case and is blocked while a conversation run is active.

## Architecture

- apps/web: TanStack Start, Vite, React, Router, Query, TanStack AI client.
- src/domain: shared case rules, evidence, approvals, idempotent actions, and scheduled jobs.
- src/server: database transactions, AG-UI streaming, Sarvam SDK, authenticated tool routes.
- src/features: application screens composed from official shadcn controls using preset b1YnRHXDE.
- tests: decision, concurrency, isolation, approval, recovery, and database restart tests.

For this prototype, case state is stored in one PostgreSQL JSONB row with transaction locking. This simplifies atomic demo operations but serializes writes. Normalize the schema before scaling.

## Speech input and output

Without a managed voice workspace, **Record voice** records up to 25 seconds and sends it to Saaras v4. Review the transcript in the composer before sending it. Use **Listen** to play a saved assistant message through Bulbul v4 Flash. This fallback is turn-based, not a full-duplex managed call.

The core screens use fixed, approved shadcn compositions. A general A2UI protocol renderer is not included in this core build.

## Managed voice

Configure the four `SARVAM_VOICE_*` workspace/application values and `VOICE_TOOL_SECRET`. Configure your committed agent to receive the `case_reference_number` call-start variable and map it to the `caseId` request body field in these HTTPS tools:

- POST /api/voice-tools/context
- POST /api/voice-tools/investigate

Send `Authorization: Bearer <VOICE_TOOL_SECRET>` and JSON `{ "caseId": "..." }`. Neither voice tool can approve a refund. Use the backend-provided case result as the authority for financial status. Do not invent completion.

Set each Sarvam tool response template to include its `spokenSummary` response field. A generic success acknowledgment does not give the agent payment facts. See [voice tool configuration](docs/VOICE-TUNNEL.md). Each new web call uses the latest committed agent version; draft edits must be committed first. The separate Voice tab provides call status, duration, mute, and call controls without adding voice transcripts to chat.

The browser connects through a constrained signed-URL proxy. Provider keys remain on the server. A local URL is not reachable by Sarvam tools; live managed-tool calls require a public HTTPS URL. Text and direct speech can run locally.

Select Bulbul v4 in the managed workspace and verify whether Flash is available there. Direct text-to-speech requests explicitly select `bulbul:v4-flash`.

## Jobs

In development, the app checks saved jobs every five seconds while its server runs. Missed due jobs remain saved and are processed after restart. This is not a hosted durable scheduler.

With external PostgreSQL, run the standalone job worker:

```sh
pnpm worker
```

Cloudflare Workflows integration is deferred with deployment. Never depend on an in-memory timer in serverless hosting.

## Checks

```sh
pnpm test
pnpm build
```

Deployment has not been performed. See docs/DEPLOYMENT.md.
