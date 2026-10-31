# Managed voice testing tunnel

The tunnel exposes only POST /api/voice-tools/context and POST /api/voice-tools/investigate. All other paths, methods, and query variants are denied. Requests require Bearer authentication, JSON content, and a valid caseId. The proxy limits request size and upstream time.

## Current test URL

https://sahay-tools.sasivarnan.com

This fixed hostname uses the installed named Cloudflare Tunnel service. Its service URL is http://127.0.0.1:8788. Opening the base URL in a browser returns 404 by design.

## Sarvam tool setup

- get_case_context: POST https://sahay-tools.sasivarnan.com/api/voice-tools/context
- investigate_case: POST https://sahay-tools.sasivarnan.com/api/voice-tools/investigate
- Content-Type: application/json
- Body: {"caseId":"<case_reference_number call-start variable>"}. Select case_reference_number with Sarvam's variable picker. Keep the backend body field named caseId.
- Authentication: Bearer. Copy VOICE_TOOL_SECRET from the local root .env into Sarvam's masked secret field. Do not paste the value into chat or agent instructions.

Select a case in the local customer app. Its ID is the last segment of the customer conversation URL. The managed browser integration supplies this ID as the case_reference_number call-start variable when the voice session starts. Define this string input variable in Sarvam and use it in both tools and the agent instructions.

## Required response template

The API response must reach the voice model. A successful HTTP request alone does not provide its fields to the model.

In each tool, test the endpoint to load its response fields. In the response template, type @ and insert the returned spokenSummary field. Also insert caseId, transactionId, amount, currency, merchant, status, refundAmount, refundReference, and evidence if separate response fields are needed by the agent. Use response field tokens, not fixed example values or agent input variables.

The minimum response template is the spokenSummary response token. Do not leave the template as "Request completed successfully." Do not put a sample transaction, amount, refund timeline, or status in the template. Keep mock responses disabled. Enable both tools and commit the updated agent version before starting a new call.

Suggested instruction addition:

```text
Use only the facts returned by the case tools. Verify that the returned caseId equals case_reference_number before describing a payment. If the tool returns only a success acknowledgment without payment facts, say that the case details could not be loaded. Do not invent an amount, transaction ID, refund, approval, or timeline. A successful tool call does not mean a case is resolved. A null refundAmount means there is no recorded refund; never describe the payment amount as an initiated refund in that case.
```

## Voice verification on 2026-10-31

The affected call used the correct case UUID. Its tool trace exposed only "Request completed successfully." to the model. The agent then stated 500 rupees, while the backend returned 4800 INR and TXN-DEMO-1042 for that case. Correct the response template in the Sarvam portal; changing the prompt alone does not expose missing response facts.

The backend now includes merchant, currency, refundAmount, refundReference, and a deterministic spokenSummary. latestUpdate uses the last assistant update, never the last customer statement. Automated tests check all four scenarios and reject attempts to override the amount or transaction ID in a voice request.

## Start

Keep the application running with pnpm dev. In another terminal, run from the repository root:

```sh
pnpm tunnel:proxy
```

The installed named tunnel service supplies the public connection. The pnpm tunnel command is an optional Quick Tunnel fallback with a temporary URL. Stop the proxy terminal with Ctrl+C to stop tool access. Do not expose port 3000 directly.

## Verify

```sh
node apps/web/scripts/voice-tunnel-proxy.test.mjs
node apps/web/scripts/check-voice-tunnel.mjs https://sahay-tools.sasivarnan.com
```

The live check creates and removes its own simulated case. It checks both authenticated tools, unauthenticated denial, and denial of admin/app routes. It does not display secrets.

## Verified

The fixed hostname was verified on 2026-10-31. Both public tools returned HTTP 200 with the correct case ID. Missing authentication returned 403. Admin and app paths returned 404. The disposable simulated test case was removed. All three proxy boundary tests passed in the earlier proxy check.

This tunnel is for backend tool calls only. Customer/admin screens and SSE text chat stay on the local app. Keep the machine awake and the app, proxy, and tunnel running during testing.
