import { config } from "dotenv"
import { resolve } from "node:path"
config({ path: resolve(process.cwd(), "../../.env"), quiet: true })
if (!process.env.DATABASE_URL)
  throw new Error(
    "The standalone worker requires DATABASE_URL. Local embedded storage uses the development server worker."
  )
const { service, repository } = await import("../src/server/context")
let stopped = false
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    stopped = true
  })
while (!stopped) {
  try {
    const result = await service.runDueJobs()
    if (result.processed)
      console.log(`Completed ${result.processed} due follow-up jobs.`)
  } catch {
    console.error("Job check failed. Pending jobs will retry.")
  }
  await new Promise((resolve) => setTimeout(resolve, 5000))
}
await repository.close()
