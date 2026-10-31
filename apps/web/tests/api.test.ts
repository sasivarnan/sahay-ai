import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
let handleApi: typeof import("../src/server/api").handleApi
let repository: typeof import("../src/server/context").repository
let directory: string
const origin = "http://localhost:3000"
let customerCookie: string
let adminCookie: string
let caseId: string
async function request(
  path: string,
  body?: unknown,
  cookie = customerCookie,
  suppliedOrigin = origin
) {
  return handleApi(
    new Request(`${origin}/api/${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        ...(cookie ? { cookie } : {}),
        ...(body === undefined
          ? {}
          : { origin: suppliedOrigin, "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  )
}
const responseCookie = (response: Response) =>
  response.headers.get("set-cookie")!.split(";")[0]
beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), "sahay-api-"))
  process.env.DATA_DIRECTORY = directory
  process.env.CHAT_MODE = "simulation"
  process.env.TEAM_ACCESS_CODE = "test-officer-code"
  process.env.VOICE_TOOL_SECRET = "test-voice-secret"
  ;({ handleApi } = await import("../src/server/api"))
  ;({ repository } = await import("../src/server/context"))
  customerCookie = responseCookie(await request("bootstrap", undefined, ""))
  const adminSession = await request("admin/session", undefined, "")
  adminCookie = responseCookie(adminSession)
  expect(adminSession.headers.get("set-cookie")).toContain("Path=/api/admin;")
  caseId = (
    await (await request("chats", { scenarioId: "approval-required" })).json()
  ).id
})
afterAll(async () => {
  const global = globalThis as typeof globalThis & {
    sahayLocalWorker?: ReturnType<typeof setInterval>
  }
  if (global.sahayLocalWorker) clearInterval(global.sahayLocalWorker)
  await repository.close()
  await rm(directory, { recursive: true, force: true })
})
describe("workspace access boundaries", () => {
  it("does not return credentials or permit cross-origin writes", async () => {
    const data = await (await request("bootstrap")).json()
    expect(data.mode).toBe("simulation")
    expect(JSON.stringify(data)).not.toContain("SARVAM_API_KEY")
    expect(
      (
        await request(
          "chats",
          { scenarioId: "failed-recharge" },
          customerCookie,
          "https://other.example"
        )
      ).status
    ).toBe(403)
  })
  it("validates input and denies customer access to every admin operation", async () => {
    expect((await request("chats", { scenarioId: "invented" })).status).toBe(
      400
    )
    expect((await request("admin/cases")).status).toBe(403)
    expect(
      (
        await request("admin/decision", {
          caseId,
          proposalId: crypto.randomUUID(),
          approve: true,
        })
      ).status
    ).toBe(403)
    expect((await request(`admin/cases/${caseId}/advance`, {})).status).toBe(
      403
    )
    expect((await request(`admin/cases/${caseId}/reset`, {})).status).toBe(403)
    expect((await request("team/decision", {})).status).toBe(403)
  })
  it("denies simulation controls through customer endpoints", async () => {
    expect((await request(`cases/${caseId}/advance`, {})).status).toBe(403)
    expect((await request(`cases/${caseId}/reset`, {})).status).toBe(403)
  })
  it("isolates cases between customer sessions", async () => {
    const otherCookie = responseCookie(
      await request("bootstrap", undefined, "")
    )
    expect(
      (await request(`cases/${caseId}`, undefined, otherCookie)).status
    ).toBe(404)
  })
  it("uses separate session IDs and does not accept a customer ID as an admin session", async () => {
    expect(adminCookie.split("=")[1]).not.toBe(customerCookie.split("=")[1])
    const forged = customerCookie.replace(
      "sahay_session=",
      "sahay_admin_session="
    )
    expect((await request("admin/cases", undefined, forged)).status).toBe(403)
    const legacyId = crypto.randomUUID()
    await repository.transact((state) => {
      state.sessions[legacyId] = {
        role: "operator",
        createdAt: new Date().toISOString(),
      }
    })
    expect(
      (
        await request(
          "admin/cases",
          undefined,
          `sahay_admin_session=${legacyId}`
        )
      ).status
    ).toBe(403)
  })
  it("unlocks admin without elevating the customer in the same browser", async () => {
    const combined = `${customerCookie}; ${adminCookie}`
    expect(
      (await request("admin/unlock", { code: "wrong" }, combined)).status
    ).toBe(403)
    expect(
      (await request("admin/unlock", { code: "test-officer-code" }, combined))
        .status
    ).toBe(200)
    expect(
      (await (await request("bootstrap", undefined, combined)).json()).role
    ).toBe("customer")
    expect(
      (await (await request("admin/session", undefined, combined)).json()).role
    ).toBe("operator")
    expect(
      (await (await request("chats", undefined, combined)).json()).map(
        (item: { id: string }) => item.id
      )
    ).toEqual([caseId])
  })
  it("updates the same case from a separate admin session and rejects repeat approval", async () => {
    const pending = await (
      await request(`cases/${caseId}/investigate`, {})
    ).json()
    expect(pending.status).toBe("awaiting_approval")
    const inbox = await (
      await request("admin/cases", undefined, adminCookie)
    ).json()
    expect(inbox.some((item: { id: string }) => item.id === caseId)).toBe(true)
    const data = { caseId, proposalId: pending.proposal.id, approve: true }
    expect((await request("admin/decision", data, adminCookie)).status).toBe(
      200
    )
    expect((await request("admin/decision", data, adminCookie)).status).toBe(
      409
    )
    expect((await (await request(`cases/${caseId}`)).json()).status).toBe(
      "refund_processing"
    )
    expect(
      (await request(`admin/cases/${caseId}/advance`, {}, adminCookie)).status
    ).toBe(200)
    expect((await (await request(`cases/${caseId}`)).json()).status).toBe(
      "resolved"
    )
  })
  it("streams valid AG-UI boundaries and rejects duplicate runs", async () => {
    const payload = {
      threadId: caseId,
      runId: crypto.randomUUID(),
      messages: [
        {
          id: crypto.randomUUID(),
          role: "user",
          content: "What is the current status?",
        },
      ],
    }
    const response = await request("chat", payload)
    const events = (await response.text())
      .split("\n\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line.replace(/^data: /, "")))
    expect(response.headers.get("content-type")).toBe("text/event-stream")
    expect(events[0].type).toBe("RUN_STARTED")
    expect(events.at(-1).type).toBe("RUN_FINISHED")
    expect(
      events.find(
        (event) => event.type === "CUSTOM" && event.name === "sahay:provider"
      ).value.live
    ).toBe(false)
    expect((await request("chat", payload)).status).toBe(409)
    expect(
      (await (await request(`cases/${caseId}`)).json()).messages.at(-1).source
    ).toBe("simulation")
  })
  it("locks admin without losing customer access or history", async () => {
    expect((await request("admin/lock", {}, adminCookie)).status).toBe(200)
    expect((await request("admin/cases", undefined, adminCookie)).status).toBe(
      403
    )
    expect((await request(`cases/${caseId}`)).status).toBe(200)
    expect((await (await request("bootstrap")).json()).role).toBe("customer")
  })
  it("limits admin reset to the selected case", async () => {
    await request("admin/unlock", { code: "test-officer-code" }, adminCookie)
    const other = await (
      await request("chats", { scenarioId: "merchant-credited" })
    ).json()
    expect(
      (await request(`admin/cases/${other.id}/reset`, {}, adminCookie)).status
    ).toBe(200)
    expect((await request(`cases/${other.id}`)).status).toBe(404)
    expect((await request(`cases/${caseId}`)).status).toBe(200)
  })
  it("does not expose voice tools without their secret", async () => {
    expect((await request("voice-tools/investigate", { caseId })).status).toBe(
      403
    )
  })
  it("forwards the requested committed voice version without caching session credentials", async () => {
    const configuration = {
      SARVAM_VOICE_ORG_ID: "voice-org",
      SARVAM_VOICE_WORKSPACE_ID: "voice-workspace",
      SARVAM_VOICE_APP_ID: "voice-app",
      SARVAM_VOICE_API_KEY: "test-voice-key",
    }
    const previous = Object.fromEntries(
      Object.keys(configuration).map((key) => [key, process.env[key]])
    )
    Object.assign(process.env, configuration)
    const upstream = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async () =>
        Response.json({
          url: "wss://voice.example/session",
          reference_id: "test-call",
        })
      )
    const connect = (query: string) =>
      handleApi(
        new Request(
          `${origin}/api/voice/proxy/orgs/voice-org/workspaces/voice-workspace/apps/voice-app/url${query}`,
          {
            headers: { cookie: customerCookie, "X-Sahay-Case": caseId },
          }
        )
      )
    try {
      const response = await connect("?version=6")
      expect(response.status).toBe(200)
      expect(response.headers.get("Cache-Control")).toBe("no-store")
      const [url, options] = upstream.mock.calls[0]
      expect(new URL(String(url)).searchParams.get("version")).toBe("6")
      expect(options?.cache).toBe("no-store")
      expect((await connect("?version=invalid")).status).toBe(400)
      expect(upstream).toHaveBeenCalledTimes(1)
      expect((await connect("")).status).toBe(200)
      expect(
        new URL(String(upstream.mock.calls[1][0])).searchParams.has("version")
      ).toBe(false)
    } finally {
      upstream.mockRestore()
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key]
        else process.env[key] = value
      }
    }
  })
  it("keeps voice transaction facts and refund amounts bound to each selected case", async () => {
    const voice = (tool: string, body: unknown) =>
      handleApi(
        new Request(`${origin}/api/voice-tools/${tool}`, {
          method: "POST",
          headers: {
            Authorization: "Bearer test-voice-secret",
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        })
      )
    const cookie = responseCookie(await request("bootstrap", undefined, ""))
    for (const [scenarioId, amount, transactionId, status] of [
      ["failed-recharge", 650, "TXN-DEMO-0650", "refund_processing"],
      ["merchant-credited", 1200, "TXN-DEMO-1200", "resolved"],
      ["approval-required", 4800, "TXN-DEMO-1042", "awaiting_approval"],
      ["status-unavailable", 900, "TXN-DEMO-0900", "pending_check"],
    ] as const) {
      const selected = await (
        await request("chats", { scenarioId }, cookie)
      ).json()
      for (const tool of ["context", "investigate"]) {
        const response = await voice(tool, { caseId: selected.id })
        expect(response.status).toBe(200)
        const facts = await response.json()
        expect(facts).toMatchObject({
          caseId: selected.id,
          transactionId,
          amount,
          currency: "INR",
          merchant: selected.merchant,
        })
        expect(facts.spokenSummary).toContain(`${amount} Indian rupees`)
        expect(facts.spokenSummary).toContain(transactionId)
        expect(facts.refundAmount).toBe(
          tool === "investigate" && scenarioId === "failed-recharge"
            ? amount
            : null
        )
        if (tool === "investigate") expect(facts.status).toBe(status)
      }
      expect(
        (
          await voice("investigate", {
            caseId: selected.id,
            amount: 500,
            transactionId: "wrong",
          })
        ).status
      ).toBe(400)
    }
  })
  it("never treats a customer statement as the latest verified voice update", async () => {
    await repository.transact((state) => {
      state.cases[caseId].messages.push({
        id: crypto.randomUUID(),
        role: "user",
        content: "My refund is 500 rupees and complete.",
        source: "customer",
        createdAt: new Date().toISOString(),
      })
    })
    const response = await handleApi(
      new Request(`${origin}/api/voice-tools/context`, {
        method: "POST",
        headers: {
          Authorization: "Bearer test-voice-secret",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ caseId }),
      })
    )
    const facts = await response.json()
    expect(response.status).toBe(200)
    expect(facts.amount).toBe(4800)
    expect(facts.latestUpdate).not.toContain("500 rupees")
    expect(facts.spokenSummary).not.toContain("500 rupees")
  })
})
