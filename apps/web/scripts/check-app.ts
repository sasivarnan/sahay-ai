import { config } from "dotenv"
import { resolve } from "node:path"
config({ path: resolve(process.cwd(), "../../.env"), quiet: true })
const origin = "http://127.0.0.1:3000"
const bootstrap = await fetch(`${origin}/api/bootstrap`)
const cookie = bootstrap.headers.get("set-cookie")!.split(";")[0]
const adminSession = await fetch(`${origin}/api/admin/session`)
const adminCookie = adminSession.headers.get("set-cookie")!.split(";")[0]
async function call(path: string, data?: unknown) {
  const response = await fetch(`${origin}/api/${path}`, {
    method: data === undefined ? "GET" : "POST",
    headers: {
      cookie: path.startsWith("admin/") ? adminCookie : cookie,
      origin,
      "Content-Type": "application/json",
    },
    body: data === undefined ? undefined : JSON.stringify(data),
  })
  if (!response.ok) throw new Error(`App check failed: ${response.status}`)
  return response
}
const item = await (
  await call("chats", { scenarioId: "merchant-credited" })
).json()
try {
  const response = await call("chat", {
    threadId: item.id,
    runId: crypto.randomUUID(),
    messages: [
      {
        id: crypto.randomUUID(),
        role: "user",
        content:
          "The merchant says they did not receive this payment. Please investigate the transaction now and tell me the verified result.",
      },
    ],
  })
  const events = (await response.text())
    .split("\n\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line.replace(/^data: /, "")))
  const saved = await (await call(`cases/${item.id}`)).json()
  const passed =
    events.at(-1)?.type === "RUN_FINISHED" &&
    saved.status === "resolved" &&
    !saved.refundId &&
    saved.messages.at(-1)?.source === "sarvam"
  console.log(
    JSON.stringify({
      check: "Live app tool loop",
      ok: passed,
      status: saved.status,
      refundCreated: Boolean(saved.refundId),
      toolCalls: events.filter((event) => event.type === "TOOL_CALL_START")
        .length,
      replySource: saved.messages.at(-1)?.source,
    })
  )
  if (!passed) process.exitCode = 1
} finally {
  await call("admin/unlock", {
    code: process.env.TEAM_ACCESS_CODE ?? "sahay-finals",
  })
  await call(`admin/cases/${item.id}/reset`, {})
}
