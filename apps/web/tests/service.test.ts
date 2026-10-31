import { describe, expect, it } from "vitest"
import {
  CaseService,
  MemoryRepository,
  operatorActor,
} from "../src/domain/service"

function setup() {
  let time = new Date("2026-10-31T06:00:00Z")
  const repository = new MemoryRepository()
  const service = new CaseService(repository, () => time)
  return {
    repository,
    service,
    advance: () => {
      time = new Date(time.getTime() + 61_000)
    },
  }
}
describe("case decisions and action safety", () => {
  it("recovers a lost response, creates one refund under concurrency, and verifies closure later", async () => {
    const { service, repository, advance } = setup()
    const item = await service.create("alice", "failed-recharge")
    await Promise.all(
      Array.from({ length: 8 }, () => service.investigate(item.id, "alice"))
    )
    const processing = await service.get(item.id, "alice")
    expect(processing.status).toBe("refund_processing")
    expect(processing.lostResponseRecovered).toBe(true)
    expect(processing.investigationCount).toBe(1)
    expect(
      await repository.transact((state) => Object.values(state.refunds).length)
    ).toBe(1)
    expect((await service.runDueJobs()).processed).toBe(0)
    advance()
    expect((await service.runDueJobs()).processed).toBe(1)
    expect((await service.get(item.id, "alice")).status).toBe("resolved")
    expect((await service.runDueJobs()).processed).toBe(0)
  })
  it("requires exact human approval before executing a high-value refund", async () => {
    const { service, repository } = setup()
    const item = await service.create("alice", "approval-required")
    const pending = await service.investigate(item.id, "alice")
    expect(pending.status).toBe("awaiting_approval")
    expect(
      await repository.transact((state) => Object.values(state.refunds).length)
    ).toBe(0)
    await expect(
      service.decide(item.id, "wrong-proposal", true, "officer")
    ).rejects.toThrow("no longer")
    const approved = await service.decide(
      item.id,
      pending.proposal!.id,
      true,
      "officer"
    )
    expect(approved.status).toBe("refund_processing")
    await expect(
      service.decide(item.id, pending.proposal!.id, true, "officer")
    ).rejects.toThrow("no longer")
    expect(
      await repository.transact((state) => Object.values(state.refunds).length)
    ).toBe(1)
  })
  it("rejects approval after the amount changes", async () => {
    const { service, repository } = setup()
    const item = await service.create("alice", "approval-required")
    const pending = await service.investigate(item.id, "alice")
    await repository.transact((state) => {
      state.cases[item.id].amount = 4900
    })
    await expect(
      service.decide(item.id, pending.proposal!.id, true, "officer")
    ).rejects.toThrow("changed")
    expect(
      await repository.transact((state) => Object.values(state.refunds).length)
    ).toBe(0)
  })
  it("rejects approval after evidence changes", async () => {
    const { service, repository } = setup()
    const item = await service.create("alice", "approval-required")
    const pending = await service.investigate(item.id, "alice")
    await repository.transact((state) => {
      state.cases[item.id].evidence[1].result = "Payment successful"
    })
    await expect(
      service.decide(item.id, pending.proposal!.id, true, "officer")
    ).rejects.toThrow("changed")
  })
  it("keeps rejected cases human-owned without a refund", async () => {
    const { service, repository } = setup()
    const item = await service.create("alice", "approval-required")
    const pending = await service.investigate(item.id, "alice")
    expect(
      (await service.decide(item.id, pending.proposal!.id, false, "officer"))
        .status
    ).toBe("human_owned")
    expect(
      await repository.transact((state) => Object.values(state.refunds).length)
    ).toBe(0)
  })
  it("lets the assigned officer reply and close a support case without creating a refund", async () => {
    const { service, repository } = setup()
    const item = await service.create("alice", "approval-required")
    const pending = await service.investigate(item.id, "alice")
    await expect(
      service.supportReply(item.id, "I will review this case.", "officer")
    ).rejects.toThrow("Take ownership")
    await service.decide(item.id, pending.proposal!.id, false, "officer")
    await expect(
      service.supportReply(item.id, "Wrong officer", "other-officer")
    ).rejects.toThrow("Another support officer")
    await expect(
      service.supportReply(item.id, "   ", "officer")
    ).rejects.toThrow("Enter a reply")
    await service.supportReply(
      item.id,
      "I have taken your case and will review the evidence.",
      "officer"
    )
    const customer = await service.get(item.id, "alice")
    expect(customer.assignedTo).toBe("officer")
    expect(customer.messages.at(-1)).toMatchObject({
      source: "support",
      role: "assistant",
      content: "I have taken your case and will review the evidence.",
    })
    await expect(
      service.resolveBySupport(item.id, "Reviewed", "other-officer")
    ).rejects.toThrow("Another support officer")
    const closed = await service.resolveBySupport(
      item.id,
      "Customer agreed to close this support request without a refund.",
      "officer"
    )
    expect(closed.status).toBe("resolved")
    expect(closed.resolution).toMatchObject({
      actor: "officer",
      summary:
        "Customer agreed to close this support request without a refund.",
    })
    expect(closed.messages.at(-1)?.source).toBe("support")
    expect(closed.audit.at(-1)?.type).toBe("support_resolved")
    expect(
      await repository.transact((state) => Object.keys(state.refunds).length)
    ).toBe(0)
    await expect(
      service.supportReply(item.id, "Late reply", "officer")
    ).rejects.toThrow("Take ownership")
    await expect(
      service.resolveBySupport(item.id, "Repeated closure", "officer")
    ).rejects.toThrow("Take ownership")
  })
  it("does not close a processing refund through the support resolution action", async () => {
    const { service } = setup()
    const item = await service.create("alice", "failed-recharge")
    await service.investigate(item.id, "alice")
    await expect(
      service.resolveBySupport(item.id, "Refund is complete", "officer")
    ).rejects.toThrow("Take ownership")
    expect((await service.get(item.id, "alice")).status).toBe(
      "refund_processing"
    )
  })
  it("keeps officer session credentials out of case ownership and audit data", async () => {
    const { service } = setup()
    const sessionId = crypto.randomUUID()
    const item = await service.create("alice", "approval-required")
    const pending = await service.investigate(item.id, "alice")
    await service.decide(
      item.id,
      pending.proposal!.id,
      false,
      `operator:${sessionId}`
    )
    const legacy = await service.get(item.id, "alice")
    expect(legacy.assignedTo).toBe(operatorActor(sessionId))
    expect(JSON.stringify(legacy)).not.toContain(sessionId)
    const reply = await service.supportReply(
      item.id,
      "The assigned officer can still reply.",
      operatorActor(sessionId)
    )
    expect(reply.messages.at(-1)?.source).toBe("support")
  })
  it("does not refund a payment with verified merchant credit", async () => {
    const { service, repository } = setup()
    const item = await service.create("alice", "merchant-credited")
    expect((await service.investigate(item.id, "alice")).status).toBe(
      "resolved"
    )
    expect(
      await repository.transact((state) => Object.values(state.refunds).length)
    ).toBe(0)
  })
  it("waits on an unknown status and verifies it on follow-up without a refund", async () => {
    const { service, repository, advance } = setup()
    const item = await service.create("alice", "status-unavailable")
    expect((await service.investigate(item.id, "alice")).status).toBe(
      "pending_check"
    )
    advance()
    await service.runDueJobs()
    expect((await service.get(item.id, "alice")).status).toBe("resolved")
    expect(
      await repository.transact((state) => Object.values(state.refunds).length)
    ).toBe(0)
  })
  it("isolates customers and their scenario action keys", async () => {
    const { service, repository } = setup()
    const alice = await service.create("alice", "failed-recharge")
    const bob = await service.create("bob", "failed-recharge")
    await expect(service.get(alice.id, "bob")).rejects.toThrow("not found")
    await expect(service.investigate(alice.id, "bob")).rejects.toThrow(
      "not found"
    )
    await expect(service.reset(alice.id, "bob")).rejects.toThrow("not found")
    await Promise.all([
      service.investigate(alice.id, "alice"),
      service.investigate(bob.id, "bob"),
    ])
    const refunds = await repository.transact((state) =>
      Object.values(state.refunds)
    )
    expect(refunds).toHaveLength(2)
    expect(refunds[0].id).not.toBe(refunds[1].id)
  })
  it("returns the existing case when the same transaction is selected again", async () => {
    const { service } = setup()
    const first = await service.create("alice", "failed-recharge")
    const second = await service.create("alice", "failed-recharge")
    expect(first.id).toBe(second.id)
  })
  it("resets only one case and blocks reset during an active run", async () => {
    const { service, repository } = setup()
    const first = await service.create("alice", "failed-recharge")
    const other = await service.create("alice", "merchant-credited")
    await repository.transact((state) => {
      state.runs["run1"] = {
        caseId: first.id,
        status: "running",
        updatedAt: "2026-10-31T06:00:00Z",
      }
    })
    await expect(service.reset(first.id, "alice")).rejects.toThrow("active")
    await repository.transact((state) => {
      state.runs.run1.status = "complete"
    })
    await service.reset(first.id, "alice")
    expect((await service.list("alice")).map((value) => value.id)).toEqual([
      other.id,
    ])
  })
  it("rolls back failed mutations", async () => {
    const { repository } = setup()
    await expect(
      repository.transact((state) => {
        state.sessions.failed = { role: "operator", createdAt: "" }
        throw new Error("rollback")
      })
    ).rejects.toThrow("rollback")
    expect(
      await repository.transact((state) => state.sessions.failed)
    ).toBeUndefined()
  })
})
