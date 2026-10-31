import { randomUUID } from "node:crypto"
import { z } from "zod"
import type { SarvamAI } from "sarvamai"
import { DomainError } from "../domain/service"
import { repository, service } from "./context"
import { sarvamClient } from "./sarvam"

const inputSchema = z.object({
  threadId: z.string().uuid(),
  runId: z.string().min(1).max(200),
  messages: z
    .array(
      z
        .object({
          id: z.string().optional(),
          role: z.string(),
          content: z.unknown().optional(),
          parts: z
            .array(
              z
                .object({ type: z.string(), content: z.string().optional() })
                .passthrough()
            )
            .optional(),
        })
        .passthrough()
    )
    .min(1)
    .max(150),
})
export async function chatResponse(
  request: Request,
  current: { id: string; cookie: string }
) {
  const input = inputSchema.parse(await request.json())
  const incoming = [...input.messages]
    .reverse()
    .find((message) => message.role === "user")
  const text =
    typeof incoming?.content === "string"
      ? incoming.content
      : incoming?.parts
          ?.filter((part) => part.type === "text")
          .map((part) => part.content ?? "")
          .join("")
  if (!text || text.length > 4000)
    throw new DomainError(400, "Enter a message of 1 to 4,000 characters.")
  await service.get(input.threadId, current.id)
  await repository.transact((state) => {
    if (state.runs[input.runId])
      throw new DomainError(
        409,
        "This run was already submitted. Reload the saved conversation."
      )
    if (
      Object.values(state.runs).some(
        (run) =>
          run.caseId === input.threadId &&
          run.status === "running" &&
          Date.now() - Date.parse(run.updatedAt) < 300_000
      )
    )
      throw new DomainError(
        409,
        "A response is already being generated for this case."
      )
    state.runs[input.runId] = {
      caseId: input.threadId,
      status: "running",
      updatedAt: new Date().toISOString(),
    }
  })
  await service.recordMessage(input.threadId, current.id, {
    id: incoming?.id ?? randomUUID(),
    role: "user",
    content: text,
    createdAt: new Date().toISOString(),
    source: "customer",
  })
  let connected = true
  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const emit = (event: Record<string, unknown>) => {
        if (connected) {
          try {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify(event)}\n\n`)
            )
          } catch {
            connected = false
          }
        }
      }
      void (async () => {
        let answer = ""
        const messageId = randomUUID()
        const simulated =
          process.env.CHAT_MODE === "simulation" || !process.env.SARVAM_API_KEY
        const started = Date.now()
        emit({
          type: "RUN_STARTED",
          threadId: input.threadId,
          runId: input.runId,
        })
        try {
          if (simulated) {
            emit({
              type: "CUSTOM",
              name: "sahay:provider",
              value: { provider: "simulation", live: false },
            })
            const item = await service.get(input.threadId, current.id)
            answer = `${item.messages.filter((message) => message.role === "assistant").at(-1)?.content ?? "Select Investigate payment to start the case workflow."}`
            emit({ type: "TEXT_MESSAGE_START", messageId, role: "assistant" })
            for (const word of answer.match(/\S+\s*/g) ?? [])
              emit({ type: "TEXT_MESSAGE_CONTENT", messageId, delta: word })
          } else {
            const client = sarvamClient()
            let item = await service.get(input.threadId, current.id)
            const messages: SarvamAI.ChatCompletionRequestMessage[] = [
              {
                role: "system",
                content: `You are Sahay AI, a concise multilingual payment-support teammate. All payment data, policies, refunds, and tickets are simulated. Sarvam model calls are live. The app displays a persistent demo notice. Do not repeat simulation disclaimers or label each payment, refund, or update as simulated in your replies. Never claim live payment access. Use the customer's language. Never claim real Paytm access. Never approve a refund or invent evidence. You cannot change the selected transaction or amount based on a message; ask the customer to select the correct transaction. Use investigate_case when the customer asks to investigate or resolve the selected payment. Use get_case_status for current facts. A refund_processing status is NOT completion. awaiting_approval requires a support officer; never claim approval. Do not reveal internal reasoning. Give short explanations based only on recorded evidence. Case: ${JSON.stringify({ id: item.id, amount: item.amount, merchant: item.merchant, transactionId: item.transactionId, status: item.status, evidence: item.evidence })}`,
              },
              ...item.messages.slice(-20).map((message) => ({
                role: message.role,
                content: message.content,
              })),
            ]
            const tools: SarvamAI.ChatCompletionTool[] = [
              "investigate_case",
              "get_case_status",
            ].map((name) => ({
              type: "function",
              function: {
                name,
                description:
                  name === "investigate_case"
                    ? "Investigate the selected simulated transaction and apply backend policy. The backend alone decides actions or requests human approval."
                    : "Read the selected case and its latest verified status.",
                parameters: {
                  type: "object",
                  properties: {},
                  additionalProperties: false,
                },
              },
            }))
            for (let step = 0; step < 3; step++) {
              const result = await client.chat.completions(
                {
                  model: "sarvam-105b",
                  messages,
                  tools,
                  max_tokens: 1000,
                  reasoning_effort: "low",
                  temperature: 0.1,
                },
                {
                  timeoutInSeconds: 30,
                  maxRetries: 0,
                  abortSignal: AbortSignal.timeout(45000),
                }
              )
              const message = result.choices[0]?.message
              if (!message) throw new Error("Missing model response")
              if (!message.tool_calls?.length) break
              messages.push({
                role: "assistant",
                content: message.content ?? "",
                tool_calls: message.tool_calls,
              })
              for (const call of message.tool_calls) {
                const allowed = [
                  "investigate_case",
                  "get_case_status",
                ].includes(call.function.name)
                let result: unknown = { error: "Tool not permitted." }
                if (allowed) {
                  emit({
                    type: "TOOL_CALL_START",
                    toolCallId: call.id,
                    toolCallName: call.function.name,
                    parentMessageId: messageId,
                  })
                  emit({
                    type: "TOOL_CALL_ARGS",
                    toolCallId: call.id,
                    delta: "{}",
                  })
                  emit({ type: "TOOL_CALL_END", toolCallId: call.id })
                  item =
                    call.function.name === "investigate_case"
                      ? await service.investigate(item.id, current.id)
                      : await service.get(item.id, current.id)
                  result = {
                    amount: item.amount,
                    transactionId: item.transactionId,
                    status: item.status,
                    evidence: item.evidence,
                    latestUpdate: item.messages.at(-1)?.content,
                    simulated: true,
                  }
                  emit({
                    type: "TOOL_CALL_RESULT",
                    messageId: randomUUID(),
                    toolCallId: call.id,
                    content: JSON.stringify(result),
                    role: "tool",
                  })
                  emit({
                    type: "CUSTOM",
                    name: "sahay:case-updated",
                    value: { caseId: item.id },
                  })
                }
                messages.push({
                  role: "tool",
                  tool_call_id: call.id,
                  content: JSON.stringify(result),
                })
              }
            }
            item = await service.get(input.threadId, current.id)
            messages.push({
              role: "system",
              content: `Now answer briefly with no further tools. Verified current case status: ${item.status}. Latest backend update: ${item.messages.filter((message) => message.role === "assistant").at(-1)?.content}. Do not claim any other action.`,
            })
            const reply = await client.chat.completions(
              {
                model: "sarvam-105b",
                messages,
                stream: true,
                tools,
                tool_choice: "none",
                max_tokens: 2000,
                reasoning_effort: "low",
                temperature: 0.1,
              },
              {
                timeoutInSeconds: 30,
                maxRetries: 0,
                abortSignal: AbortSignal.timeout(45000),
              }
            )
            emit({
              type: "CUSTOM",
              name: "sahay:provider",
              value: { provider: "Sarvam-105B", live: true },
            })
            emit({ type: "TEXT_MESSAGE_START", messageId, role: "assistant" })
            for await (const chunk of reply) {
              const delta = chunk.choices[0]?.delta?.content
              if (delta) {
                answer += delta
                emit({ type: "TEXT_MESSAGE_CONTENT", messageId, delta })
              }
            }
          }
          if (!answer.trim()) throw new Error("Empty reply")
          await service.recordMessage(input.threadId, current.id, {
            id: messageId,
            role: "assistant",
            content: answer,
            createdAt: new Date().toISOString(),
            source: simulated ? "simulation" : "sarvam",
          })
          await repository.transact((state) => {
            state.runs[input.runId].status = "complete"
            state.runs[input.runId].updatedAt = new Date().toISOString()
          })
          emit({ type: "TEXT_MESSAGE_END", messageId })
          emit({
            type: "CUSTOM",
            name: "sahay:latency",
            value: { durationMs: Date.now() - started },
          })
          emit({
            type: "RUN_FINISHED",
            threadId: input.threadId,
            runId: input.runId,
          })
        } catch (error) {
          console.error("Chat provider request failed", {
            type: error instanceof Error ? error.name : "unknown",
            status: (error as { statusCode?: number }).statusCode,
            emptyReply:
              error instanceof Error && error.message === "Empty reply",
          })
          await repository.transact((state) => {
            state.runs[input.runId].status = "failed"
            state.runs[input.runId].updatedAt = new Date().toISOString()
          })
          emit({
            type: "RUN_ERROR",
            message:
              "The response failed. Case actions already recorded are preserved. Reload the case and retry.",
            code: "PROVIDER_ERROR",
          })
        } finally {
          if (connected) controller.close()
        }
      })()
    },
    cancel() {
      connected = false
    },
  })
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Set-Cookie": current.cookie,
      "X-Accel-Buffering": "no",
    },
  })
}
