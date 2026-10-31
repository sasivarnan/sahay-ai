# Deployment plan — deferred

The current app is TypeScript-only and runs through TanStack Start. The earlier Python API plan has been replaced.

Target: Cloudflare Workers for the application, Cloudflare Workflows for saved follow-ups and approval waits, and Neon PostgreSQL for records.

Before deployment:

1. Replace the local embedded database fallback with a Workers-compatible PostgreSQL connection through Hyperdrive or the Neon serverless driver.
2. Add a Cloudflare Workflow implementation that calls the same shared case operations. Keep action keys and approval checks in the case service.
3. Configure server-only secrets and a non-default TEAM_ACCESS_CODE. Add request rate limits and managed identity for use beyond a closed demo.
4. Configure the committed Sarvam managed agent and its authenticated backend tools against the public HTTPS origin.
5. Test the SDKs, streaming, reconnects, deep links, database transactions, and secret exclusion in the Workers build.
6. Run the core scenarios against the deployed environment before judging.

The current local implementation uses Node.js built-ins and the `pg` driver. It has not yet been verified in the Workers runtime. Do not deploy the local job timer as a serverless scheduler.

No cloud resource or public repository has been created by this implementation.
