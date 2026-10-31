import { createHash, randomUUID } from "node:crypto"
import { emptyState, scenarios } from "./model"
import { responseText } from "./response-text"
import type { Case, State, ScenarioId } from "./model"
import {
  collectMockEvidence,
  MockResponseLost,
  readMockRefund,
  refundKey,
  submitMockRefund,
} from "./mock-systems"

export class DomainError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message)
  }
}
export interface Repository {
  transact<T>(operation: (state: State) => T | Promise<T>): Promise<T>
}
export const operatorActor = (sessionId: string) =>
  `operator:${createHash("sha256").update(sessionId).digest("hex").slice(0, 24)}`
const normalizeActor = (actor: string) =>
  /^operator:[a-f0-9-]{36}$/i.test(actor)
    ? operatorActor(actor.slice(9))
    : actor
export class MemoryRepository implements Repository {
  private state = emptyState()
  private tail: Promise<unknown> = Promise.resolve()
  transact<T>(operation: (state: State) => T | Promise<T>): Promise<T> {
    const run = this.tail.then(async () => {
      const draft = structuredClone(this.state)
      const result = await operation(draft)
      this.state = draft
      return structuredClone(result)
    })
    this.tail = run.catch(() => {})
    return run
  }
}
const fingerprint = (item: Case) =>
  createHash("sha256")
    .update(
      JSON.stringify([
        item.transactionId,
        item.amount,
        item.evidence.map((entry) => [
          entry.source,
          entry.result,
          entry.checkedAt,
        ]),
      ])
    )
    .digest("hex")
export class CaseService {
  constructor(
    public repository: Repository,
    private clock = () => new Date()
  ) {}
  private now() {
    return this.clock().toISOString()
  }
  private normalizeActors(item: Case) {
    if (item.assignedTo) item.assignedTo = normalizeActor(item.assignedTo)
    if (item.proposal?.decidedBy)
      item.proposal.decidedBy = normalizeActor(item.proposal.decidedBy)
    if (item.resolution)
      item.resolution.actor = normalizeActor(item.resolution.actor)
    for (const event of item.audit) event.actor = normalizeActor(event.actor)
    return item
  }
  private audit(
    item: Case,
    type: string,
    description: string,
    actor = "case-service"
  ) {
    item.audit.push({
      id: randomUUID(),
      type,
      description,
      actor,
      at: this.now(),
    })
    item.version++
    item.updatedAt = this.now()
  }
  private message(
    item: Case,
    content: string,
    source: "system" | "simulation" | "support" = "system"
  ) {
    item.messages.push({
      id: randomUUID(),
      role: "assistant",
      content: responseText(content),
      source,
      createdAt: this.now(),
    })
  }
  private owned(state: State, id: string, owner: string) {
    const item = state.cases[id]
    if (!item || item.ownerId !== owner)
      throw new DomainError(404, "Case not found.")
    return this.normalizeActors(item)
  }
  async create(ownerId: string, scenarioId: ScenarioId) {
    return this.repository.transact((state) => {
      const scenario = scenarios.find((item) => item.id === scenarioId)
      if (!scenario) throw new DomainError(400, "Select a valid transaction.")
      const existing = Object.values(state.cases).find(
        (item) => item.ownerId === ownerId && item.scenarioId === scenarioId
      )
      if (existing) return this.normalizeActors(existing)
      const item: Case = {
        ...scenario,
        id: randomUUID(),
        scenarioId,
        ownerId,
        status: "open",
        version: 1,
        createdAt: this.now(),
        updatedAt: this.now(),
        messages: [],
        evidence: [],
        audit: [],
        investigationCount: 0,
        lostResponseRecovered: false,
      }
      this.message(
        item,
        `I can help with the ₹${item.amount} payment to ${item.merchant}. Describe the problem, or select “Investigate payment”. All payment systems and policies in this demo are simulated.`,
        "simulation"
      )
      this.audit(
        item,
        "case_created",
        "Customer selected a transaction from their simulated payment history.",
        ownerId
      )
      state.cases[item.id] = item
      return item
    })
  }
  async list(ownerId?: string) {
    return this.repository.transact((state) =>
      Object.values(state.cases)
        .filter((item) => !ownerId || item.ownerId === ownerId)
        .map((item) => this.normalizeActors(item))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    )
  }
  async get(id: string, ownerId: string) {
    return this.repository.transact((state) => this.owned(state, id, ownerId))
  }
  async operatorGet(id: string) {
    return this.repository.transact((state) => {
      const item = state.cases[id]
      if (!item) throw new DomainError(404, "Case not found.")
      return this.normalizeActors(item)
    })
  }
  private schedule(
    state: State,
    item: Case,
    kind: "refund_check" | "status_check"
  ) {
    const id = `${item.id}:${kind}`
    const dueAt = new Date(this.clock().getTime() + 60_000).toISOString()
    state.jobs[id] = { id, caseId: item.id, dueAt, kind, state: "pending" }
    item.followUpAt = dueAt
  }
  private executeRefund(state: State, item: Case) {
    if (
      item.amount > 3000 &&
      (item.proposal?.state !== "approved" ||
        item.proposal.evidenceFingerprint !== fingerprint(item))
    )
      throw new DomainError(
        409,
        "This refund requires approval of the current evidence and amount."
      )
    const key = refundKey(item)
    let refund = readMockRefund(state, item)
    if (!refund) {
      try {
        refund = submitMockRefund(state, item)
        this.audit(
          item,
          "refund_accepted",
          `Simulated refund accepted: ${refund.id}. Unique action key: ${key}.`
        )
      } catch (error) {
        if (!(error instanceof MockResponseLost)) throw error
        this.audit(
          item,
          "response_lost",
          "Fault injection: mock refund service accepted the request but its response was lost."
        )
        refund = readMockRefund(state, item)
        if (!refund)
          throw new Error("Accepted refund was not found during recovery.")
        item.lostResponseRecovered = true
        this.audit(
          item,
          "refund_recovered",
          `Looked up the original action key. Recovered ${refund.id}; no second refund was created.`
        )
      }
    }
    item.refundId = refund.id
    item.status =
      refund.status === "complete" ? "resolved" : "refund_processing"
    if (item.status === "refund_processing")
      this.schedule(state, item, "refund_check")
    this.message(
      item,
      `The simulated refund of ₹${item.amount} was accepted. Reference: ${refund.id}. It is processing, not complete. I will check again in one minute.`
    )
  }
  async investigate(id: string, ownerId: string) {
    return this.repository.transact((state) => {
      const item = this.owned(state, id, ownerId)
      if (item.status !== "open") return item
      item.investigationCount++
      item.evidence = collectMockEvidence(state, item, this.now())
      for (const evidence of item.evidence)
        this.audit(
          item,
          "evidence_checked",
          `${evidence.source}: ${evidence.result}`
        )
      if (item.scenarioId === "merchant-credited") {
        item.status = "resolved"
        this.audit(
          item,
          "no_refund",
          "Merchant credit verified. A refund is not permitted by the demo policy."
        )
        this.message(
          item,
          "The simulated settlement confirms that the merchant received this payment. No refund was issued. This case is resolved with the payment evidence recorded."
        )
      } else if (item.scenarioId === "status-unavailable") {
        item.status = "pending_check"
        this.schedule(state, item, "status_check")
        this.audit(
          item,
          "status_pending",
          "Payment result is unknown. No refund is permitted until the status is verified."
        )
        this.message(
          item,
          "The debit is confirmed, but the payment status service is unavailable. I cannot confirm failure or promise a refund. I will check again in one minute."
        )
      } else if (item.amount > 3000) {
        item.proposal = {
          id: randomUUID(),
          amount: item.amount,
          transactionId: item.transactionId,
          evidenceFingerprint: fingerprint(item),
          state: "pending",
        }
        item.status = "awaiting_approval"
        this.audit(
          item,
          "approval_requested",
          "Demo rule DEMO-REFUND-01: refunds above ₹3,000 require approval of the exact amount and evidence."
        )
        this.message(
          item,
          `The payment failed, and no completed reversal is recorded. The proposed ₹${item.amount} refund requires human approval under the demo policy. The support team has the evidence.`
        )
      } else {
        this.audit(
          item,
          "policy_passed",
          "DEMO-REFUND-01: failed payment, no merchant credit, no completed reversal, and amount within automatic limit."
        )
        this.executeRefund(state, item)
      }
      return item
    })
  }
  async decide(
    id: string,
    proposalId: string,
    approve: boolean,
    actor: string
  ) {
    return this.repository.transact((state) => {
      const item = state.cases[id]
      if (!item) throw new DomainError(404, "Case not found.")
      const proposal = item.proposal
      if (
        !proposal ||
        proposal.id !== proposalId ||
        item.status !== "awaiting_approval" ||
        proposal.state !== "pending"
      )
        throw new DomainError(
          409,
          "This proposal is no longer awaiting review."
        )
      if (
        proposal.amount !== item.amount ||
        proposal.transactionId !== item.transactionId ||
        proposal.evidenceFingerprint !== fingerprint(item)
      )
        throw new DomainError(
          409,
          "The evidence or amount changed. Request a new proposal."
        )
      proposal.state = approve ? "approved" : "rejected"
      proposal.decidedBy = actor
      this.audit(
        item,
        approve ? "human_approved" : "human_rejected",
        `${approve ? "Approved" : "Rejected"} proposal ${proposalId} for ₹${proposal.amount}.`,
        actor
      )
      if (approve) this.executeRefund(state, item)
      else {
        item.status = "human_owned"
        item.assignedTo = actor
        this.message(
          item,
          "The support officer did not approve the proposed refund. The case remains open with the human support team."
        )
      }
      return item
    })
  }
  private supportCase(state: State, id: string, actor: string) {
    const item = state.cases[id]
    if (!item) throw new DomainError(404, "Case not found.")
    this.normalizeActors(item)
    if (item.status !== "human_owned")
      throw new DomainError(
        409,
        "Take ownership before replying or closing this case."
      )
    if (item.assignedTo && item.assignedTo !== actor)
      throw new DomainError(409, "Another support officer owns this case.")
    item.assignedTo = actor
    return item
  }
  async supportReply(id: string, content: string, actor: string) {
    const text = content.trim()
    if (!text || text.length > 2000)
      throw new DomainError(400, "Enter a reply of up to 2,000 characters.")
    return this.repository.transact((state) => {
      const item = this.supportCase(state, id, actor)
      this.message(item, text, "support")
      this.audit(
        item,
        "support_replied",
        "The support officer sent a customer reply.",
        actor
      )
      return item
    })
  }
  async customerSupportMessage(id: string, ownerId: string, content: string) {
    const text = content.trim()
    if (!text || text.length > 4000)
      throw new DomainError(400, "Enter a message of up to 4,000 characters.")
    return this.repository.transact((state) => {
      const item = this.owned(state, id, ownerId)
      if (item.status !== "human_owned")
        throw new DomainError(
          409,
          "This case is not with support. Reload the case before sending."
        )
      item.messages.push({
        id: randomUUID(),
        role: "user",
        content: text,
        source: "customer",
        createdAt: this.now(),
      })
      item.updatedAt = this.now()
      return item
    })
  }
  async resolveBySupport(id: string, summary: string, actor: string) {
    const text = summary.trim()
    if (!text || text.length > 1000)
      throw new DomainError(
        400,
        "Enter a resolution of up to 1,000 characters."
      )
    return this.repository.transact((state) => {
      const item = this.supportCase(state, id, actor)
      item.status = "resolved"
      item.resolution = { summary: text, actor, at: this.now() }
      this.message(item, `Case closed by support. ${text}`, "support")
      this.audit(item, "support_resolved", text, actor)
      return item
    })
  }
  async runDueJobs(forceCaseId?: string, ownerId?: string) {
    return this.repository.transact((state) => {
      if (forceCaseId && ownerId) this.owned(state, forceCaseId, ownerId)
      let count = 0
      for (const job of Object.values(state.jobs)) {
        if (
          job.state !== "pending" ||
          (forceCaseId ? job.caseId !== forceCaseId : job.dueAt > this.now())
        )
          continue
        const item = state.cases[job.caseId]
        if (!item) continue
        if (
          job.kind === "refund_check" &&
          item.status === "refund_processing"
        ) {
          const refund = readMockRefund(state, item)
          if (!refund) throw new Error("Refund record missing.")
          refund.status = "complete"
          item.status = "resolved"
          delete item.followUpAt
          this.audit(
            item,
            "refund_verified",
            `Mock refund service confirms completion of ${refund.id}.${forceCaseId ? " Demo time advanced explicitly." : ""}`
          )
          this.message(
            item,
            `Your simulated ₹${item.amount} refund is complete. Reference: ${refund.id}. I verified the result and closed the case.`
          )
        } else if (
          job.kind === "status_check" &&
          item.status === "pending_check"
        ) {
          item.evidence.push({
            source: "Mock payment recheck",
            result: "Service recovered: merchant credit confirmed",
            checkedAt: this.now(),
          })
          item.status = "resolved"
          delete item.followUpAt
          this.audit(
            item,
            "payment_verified",
            "Follow-up confirms merchant credit. No refund was created."
          )
          this.message(
            item,
            "The status service recovered. The simulated payment reached the merchant. No refund was needed; this case is now resolved."
          )
        }
        job.state = "done"
        count++
      }
      return { processed: count }
    })
  }
  async recordMessage(
    id: string,
    ownerId: string,
    message: Case["messages"][number]
  ) {
    return this.repository.transact((state) => {
      const item = this.owned(state, id, ownerId)
      if (!item.messages.some((m) => m.id === message.id)) {
        item.messages.push(message)
        item.updatedAt = this.now()
      }
      return item
    })
  }
  async reset(id: string, ownerId: string) {
    return this.repository.transact((state) => {
      const item = this.owned(state, id, ownerId)
      if (
        Object.values(state.runs).some(
          (run) =>
            run.caseId === id &&
            run.status === "running" &&
            Date.parse(run.updatedAt) > this.clock().getTime() - 300_000
        )
      )
        throw new DomainError(
          409,
          "Wait for the active conversation run to finish."
        )
      delete state.cases[id]
      for (const [key, refund] of Object.entries(state.refunds))
        if (refund.caseId === id) delete state.refunds[key]
      for (const [key, job] of Object.entries(state.jobs))
        if (job.caseId === id) delete state.jobs[key]
      for (const [key, run] of Object.entries(state.runs))
        if (run.caseId === id) delete state.runs[key]
      return { deleted: id, scenarioId: item.scenarioId }
    })
  }
}
