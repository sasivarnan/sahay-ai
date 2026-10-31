import { z } from "zod"
import { scenarios } from "../domain/model"
import { DomainError, operatorActor } from "../domain/service"
import { responseText } from "../domain/response-text"
import {
  matchesSecret,
  repository,
  requireOperator,
  safeError,
  service,
  session,
  verifyOrigin,
} from "./context"
import { chatResponse } from "./chat"
import { synthesize, transcribe } from "./sarvam"

export async function handleApi(request: Request): Promise<Response> {
  try {
    const path = new URL(request.url).pathname.replace(/^\/api\/?/, "")
    if (path.startsWith("voice-tools/"))
      return await handleVoiceTool(request, path.split("/")[1])
    verifyOrigin(request)
    if (path.startsWith("admin/"))
      return await handleAdmin(request, path.slice(6))
    if (path.startsWith("team/"))
      throw new DomainError(403, "Use the separate admin workspace.")
    const current = await session(request)
    const json = (data: unknown, status = 200) =>
      Response.json(data, {
        status,
        headers: { "Set-Cookie": current.cookie, "Cache-Control": "no-store" },
      })
    if (path === "bootstrap" && request.method === "GET")
      return json({
        scenarios,
        role: current.role,
        sarvam: Boolean(process.env.SARVAM_API_KEY),
        voice: Boolean(
          process.env.SARVAM_VOICE_APP_ID &&
          process.env.SARVAM_VOICE_ORG_ID &&
          process.env.SARVAM_VOICE_WORKSPACE_ID
        ),
        mode:
          process.env.CHAT_MODE === "simulation" || !process.env.SARVAM_API_KEY
            ? "simulation"
            : "sarvam",
        ttsModel: "bulbul:v4-flash",
        storage: process.env.DATABASE_URL
          ? "PostgreSQL"
          : "Local embedded PostgreSQL",
      })
    if (path === "chats" && request.method === "GET")
      return json(await service.list(current.id))
    if (path === "chats" && request.method === "POST") {
      const { scenarioId } = z
        .object({
          scenarioId: z.enum([
            "failed-recharge",
            "merchant-credited",
            "approval-required",
            "status-unavailable",
          ]),
        })
        .parse(await request.json())
      return json(await service.create(current.id, scenarioId), 201)
    }
    const match = path.match(
      /^cases\/([a-f0-9-]{36})(?:\/(investigate|advance|reset|speech|messages))?$/
    )
    if (match) {
      const [, id, action] = match
      if (request.method === "GET" && !action)
        return json(await service.get(id, current.id))
      if (request.method === "POST" && action === "investigate")
        return json(await service.investigate(id, current.id))
      if (request.method === "POST" && action === "messages") {
        const { content } = z
          .object({ content: z.string().trim().min(1).max(4000) })
          .strict()
          .parse(await request.json())
        return json(
          await service.customerSupportMessage(id, current.id, content)
        )
      }
      if (
        request.method === "POST" &&
        (action === "advance" || action === "reset")
      )
        throw new DomainError(
          403,
          "Demo controls are available only in the admin workspace."
        )
      if (request.method === "POST" && action === "speech") {
        const { messageId, language } = z
          .object({
            messageId: z.string().uuid(),
            language: z.enum(["en-IN", "hi-IN"]).default("en-IN"),
          })
          .parse(await request.json())
        const item = await service.get(id, current.id)
        const message = item.messages.find(
          (value) => value.id === messageId && value.role === "assistant"
        )
        if (!message) throw new DomainError(404, "Message not found.")
        const audio = await synthesize(responseText(message.content), language)
        return new Response(audio, {
          headers: { "Content-Type": "audio/wav", "Cache-Control": "no-store" },
        })
      }
    }
    if (path === "transcribe" && request.method === "POST") {
      const data = await request.formData()
      const caseId = z.string().uuid().parse(data.get("caseId"))
      await service.get(caseId, current.id)
      const file = data.get("audio")
      if (!(file instanceof File))
        throw new DomainError(400, "An audio recording is required.")
      return json(await transcribe(file))
    }
    if (path === "chat" && request.method === "POST")
      return await chatResponse(request, current)
    if (path === "voice/transcript" && request.method === "POST") {
      const data = z
        .object({
          caseId: z.string().uuid(),
          role: z.enum(["user", "assistant"]),
          content: z.string().min(1).max(4000),
        })
        .parse(await request.json())
      return json(
        await service.recordMessage(data.caseId, current.id, {
          id: crypto.randomUUID(),
          role: data.role,
          content: data.content,
          source: "voice",
          createdAt: new Date().toISOString(),
        })
      )
    }
    if (path.startsWith("voice/proxy/") && request.method === "GET") {
      const caseId = z
        .string()
        .uuid()
        .parse(request.headers.get("x-sahay-case"))
      await service.get(caseId, current.id)
      const org = process.env.SARVAM_VOICE_ORG_ID
      const workspace = process.env.SARVAM_VOICE_WORKSPACE_ID
      const app = process.env.SARVAM_VOICE_APP_ID
      const expected = `voice/proxy/orgs/${org}/workspaces/${workspace}/apps/${app}/url`
      if (!org || !workspace || !app || path !== expected)
        throw new DomainError(404, "Voice application is not configured.")
      const key = process.env.SARVAM_VOICE_API_KEY ?? process.env.SARVAM_API_KEY
      if (!key)
        throw new DomainError(503, "Voice credentials are not configured.")
      const upstream = new URL(
        `https://apps.sarvam.ai/api/app-runtime/orgs/${encodeURIComponent(org)}/workspaces/${encodeURIComponent(workspace)}/apps/${encodeURIComponent(app)}/url`
      )
      upstream.searchParams.set("interaction_type", "call")
      const version = z.coerce
        .number()
        .int()
        .positive()
        .max(1000000)
        .optional()
        .parse(new URL(request.url).searchParams.get("version") ?? undefined)
      if (version !== undefined)
        upstream.searchParams.set("version", String(version))
      const response = await fetch(upstream, {
        headers: { "X-API-Key": key },
        cache: "no-store",
        signal: AbortSignal.timeout(15000),
      })
      if (!response.ok)
        throw new DomainError(
          502,
          "Sarvam could not start the voice session. Check workspace access and the committed agent version."
        )
      return json(await response.json())
    }
    if (path === "voice/config" && request.method === "GET") {
      const appId = process.env.SARVAM_VOICE_APP_ID
      const orgId = process.env.SARVAM_VOICE_ORG_ID
      const workspaceId = process.env.SARVAM_VOICE_WORKSPACE_ID
      if (!appId || !orgId || !workspaceId)
        throw new DomainError(
          503,
          "Managed voice workspace is not configured. Text chat and Bulbul playback are available."
        )
      return json({ appId, orgId, workspaceId })
    }
    throw new DomainError(404, "Endpoint not found.")
  } catch (error) {
    return safeError(error)
  }
}

async function handleVoiceTool(request: Request, tool: string) {
  const expected = process.env.VOICE_TOOL_SECRET
  if (
    request.method !== "POST" ||
    !expected ||
    !matchesSecret(
      request.headers.get("authorization") ?? "",
      `Bearer ${expected}`
    )
  )
    throw new DomainError(403, "Voice tool access denied.")
  const { caseId } = z
    .object({ caseId: z.string().uuid() })
    .strict()
    .parse(await request.json())
  const item = await service.operatorGet(caseId)
  const result =
    tool === "investigate"
      ? await service.investigate(caseId, item.ownerId)
      : tool === "context"
        ? item
        : null
  if (!result) throw new DomainError(404, "Voice tool not found.")
  const latestUpdate = responseText(
    result.messages.findLast((message) => message.role === "assistant")
      ?.content ?? ""
  )
  return Response.json({
    caseId: result.id,
    transactionId: result.transactionId,
    merchant: result.merchant,
    currency: "INR",
    amount: result.amount,
    refundAmount: result.refundId ? result.amount : null,
    refundReference: result.refundId ?? null,
    status: result.status,
    evidence: result.evidence,
    latestUpdate,
    spokenSummary: `Payment of ${result.amount} Indian rupees to ${result.merchant}. Transaction ID: ${result.transactionId}. Case status: ${result.status}. ${latestUpdate}`,
    simulated: true,
  })
}

async function handleAdmin(request: Request, path: string): Promise<Response> {
  const current = await session(request, "admin")
  const json = (data: unknown, cookie = current.cookie) =>
    Response.json(data, {
      headers: { "Set-Cookie": cookie, "Cache-Control": "no-store" },
    })
  if (path === "session" && request.method === "GET")
    return json({ role: current.role })
  if (path === "unlock" && request.method === "POST") {
    const { code } = z
      .object({ code: z.string().min(1).max(200) })
      .parse(await request.json())
    const expected =
      process.env.TEAM_ACCESS_CODE ??
      (process.env.NODE_ENV !== "production" ? "sahay-finals" : "")
    if (!expected || !matchesSecret(code, expected))
      throw new DomainError(403, "Incorrect admin access code.")
    await repository.transact((state) => {
      state.sessions[current.id].role = "operator"
    })
    return json({ role: "operator" })
  }
  await requireOperator(request)
  const actor = operatorActor(current.id)
  if (path === "lock" && request.method === "POST") {
    await repository.transact((state) => {
      state.sessions[current.id].role = "customer"
    })
    return json({ role: "customer" })
  }
  if (path === "cases" && request.method === "GET")
    return json(await service.list())
  if (path === "decision" && request.method === "POST") {
    const data = z
      .object({
        caseId: z.string().uuid(),
        proposalId: z.string().uuid(),
        approve: z.boolean(),
      })
      .parse(await request.json())
    return json(
      await service.decide(data.caseId, data.proposalId, data.approve, actor)
    )
  }
  const match = path.match(
    /^cases\/([a-f0-9-]{36})(?:\/(advance|reset|messages|resolve))?$/
  )
  if (match && request.method === "GET" && !match[2])
    return json(await service.operatorGet(match[1]))
  if (match && request.method === "POST") {
    const [, id, action] = match
    if (action === "messages") {
      const { content } = z
        .object({ content: z.string().trim().min(1).max(2000) })
        .strict()
        .parse(await request.json())
      return json(await service.supportReply(id, content, actor))
    }
    if (action === "resolve") {
      const { summary } = z
        .object({ summary: z.string().trim().min(1).max(1000) })
        .strict()
        .parse(await request.json())
      return json(await service.resolveBySupport(id, summary, actor))
    }
    if (action !== "advance" && action !== "reset")
      throw new DomainError(404, "Admin endpoint not found.")
    const item = await service.operatorGet(id)
    if (action === "reset") return json(await service.reset(id, item.ownerId))
    await service.runDueJobs(id, item.ownerId)
    return json(await service.operatorGet(id))
  }
  throw new DomainError(404, "Admin endpoint not found.")
}
