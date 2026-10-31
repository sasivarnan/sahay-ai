# Core validation — 31 October 2026

## Passed

- Production frontend/server build and TypeScript checks.
- 23 automated tests: case decisions, concurrent requests, duplicate refunds, stale approvals, rejection, unknown payment status, session isolation, reset protection, database restart, request validation, team authorization, separate workspace cookies, cross-session approval and follow-up, admin locking, protected demo controls, and AG-UI stream boundaries.
- Live Sarvam-105B text generation and tool selection. The complete app tool-loop check confirms merchant credit, creates no refund, and saves the Sarvam response.
- Live Bulbul v4 Flash audio generation.
- Live Saaras v4 transcription of generated test speech.
- Browser: customer history, saved conversation reload, refund recovery, exact human approval, scheduled completion, and recorded result counts.
- Client bundle scan: configured Sarvam API key is absent.

## Limits

- All payment systems, actions, policies, and bank outcomes are simulated.
- Managed voice credentials and a committed agent are not configured. Managed backend tools also require a public HTTPS endpoint. Direct short voice recordings and Bulbul playback are available locally.
- A microphone recording from the user's physical device has not been tested. The speech services were tested with synthetic audio.
- External PostgreSQL and Cloudflare runtime integration are not yet tested. Database tests use local embedded PostgreSQL.
- The local development server processes saved follow-up jobs while running. A hosted durable scheduler is part of deployment work.
- The core screens use fixed shadcn components. A general A2UI renderer and a 100-case benchmark are not included.
- Team access uses a demo code, not production identity management. Use only simulated information.
