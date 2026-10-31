import { randomUUID, timingSafeEqual } from "node:crypto"
import { CaseService, DomainError } from "../domain/service"
import { DatabaseRepository } from "./repository"

const shared = globalThis as typeof globalThis & {
  sahayRepository?: DatabaseRepository
  sahayService?: CaseService
}
export const repository = (shared.sahayRepository ??= new DatabaseRepository())
export const service = (shared.sahayService = new CaseService(repository))
export function matchesSecret(actual: string, expected: string) {
  const left = Buffer.from(actual)
  const right = Buffer.from(expected)
  return left.length === right.length && timingSafeEqual(left, right)
}
export async function session(
  request: Request,
  scope: "customer" | "admin" = "customer"
) {
  const name = scope === "admin" ? "sahay_admin_session" : "sahay_session"
  const suppliedId = request.headers
    .get("cookie")
    ?.match(new RegExp(`(?:^|;\\s*)${name}=([a-f0-9-]{36})(?:;|$)`))?.[1]
  const record = await repository.transact((state) => {
    const supplied = suppliedId ? state.sessions[suppliedId] : undefined
    const reusable =
      supplied &&
      (supplied.scope === scope || (scope === "customer" && !supplied.scope))
    const id = reusable ? suppliedId! : randomUUID()
    if (!reusable)
      state.sessions[id] = {
        role: "customer",
        scope,
        createdAt: new Date().toISOString(),
      }
    if (scope === "customer") {
      state.sessions[id].scope = "customer"
      state.sessions[id].role = "customer"
    }
    return { id, role: state.sessions[id].role }
  })
  const path = scope === "admin" ? "/api/admin" : "/"
  return {
    ...record,
    cookie: `${name}=${record.id}; HttpOnly; SameSite=Strict; Path=${path}; Max-Age=86400${new URL(request.url).protocol === "https:" ? "; Secure" : ""}`,
  }
}
export function verifyOrigin(request: Request) {
  if (request.method === "GET") return
  const origin = request.headers.get("origin")
  if (!origin || origin !== new URL(request.url).origin)
    throw new DomainError(403, "A same-origin request is required.")
}
export async function requireOperator(request: Request) {
  const current = await session(request, "admin")
  if (current.role !== "operator")
    throw new DomainError(403, "Unlock the admin workspace first.")
  return current
}
export function safeError(error: unknown) {
  if (error instanceof DomainError)
    return Response.json({ error: error.message }, { status: error.status })
  if (
    error instanceof SyntaxError ||
    (error instanceof Error && error.name === "ZodError")
  )
    return Response.json({ error: "Invalid request data." }, { status: 400 })
  console.error(
    "Request failed:",
    error instanceof Error ? error.name : "UnknownError"
  )
  return Response.json(
    { error: "The request could not be completed. Try again." },
    { status: 500 }
  )
}

const workerGlobal = globalThis as typeof globalThis & {
  sahayLocalWorker?: ReturnType<typeof setInterval>
}
if (process.env.NODE_ENV !== "production" && !workerGlobal.sahayLocalWorker) {
  workerGlobal.sahayLocalWorker = setInterval(() => {
    void shared
      .sahayService!.runDueJobs()
      .catch(() =>
        console.error("Follow-up check failed; pending jobs remain saved.")
      )
  }, 5000)
  workerGlobal.sahayLocalWorker.unref()
}
