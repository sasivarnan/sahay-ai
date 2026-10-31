# Core validation — 31 October 2026

## Passed

- Production frontend/server build and TypeScript checks.
- 29 automated tests: case decisions, concurrent requests, duplicate refunds, stale approvals, rejection, unknown payment status, session isolation, reset protection, database restart, request validation, team authorization, separate workspace cookies, cross-session approval and follow-up, admin locking, protected demo controls, AG-UI stream boundaries, voice payment facts, voice version forwarding, and session cleanup.
- Live Sarvam-105B text generation and tool selection. The complete app tool-loop check confirms merchant credit, creates no refund, and saves the Sarvam response.
- Live Bulbul v4 Flash audio generation.
- Live Saaras v4 transcription of generated test speech.
- Browser: customer history, saved conversation reload, refund recovery, exact human approval, scheduled completion, and recorded result counts.
- Client bundle scan: configured Sarvam API key is absent.
- Managed voice credentials and session URL access verified. The named tunnel exposes only authenticated voice tools; app and admin paths are blocked.
- The latest inspected managed call used committed agent version 6. Both tool outputs included payment fields rather than the earlier generic success acknowledgment. This confirms response data delivery, not every spoken claim.

## Limits

- All payment systems, actions, policies, and bank outcomes are simulated.
- The user has made managed voice test calls. Physical microphone release after the latest cleanup fix still requires a fresh browser call. Cleanup regression tests use simulated sessions.
- External PostgreSQL and Cloudflare runtime integration are not yet tested. Database tests use local embedded PostgreSQL.
- The local development server processes saved follow-up jobs while running. A hosted durable scheduler is part of deployment work.
- The core screens use fixed shadcn components. A general A2UI renderer and a 100-case benchmark are not included.
- Team access uses a demo code, not production identity management. Use only simulated information.
