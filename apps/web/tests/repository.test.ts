import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { expect, it } from "vitest"
import { DatabaseRepository } from "../src/server/repository"
import { CaseService } from "../src/domain/service"
it("persists a case across database restart and rolls back a failed transaction", async () => {
  const directory = await mkdtemp(join(tmpdir(), "sahay-test-"))
  let repository = new DatabaseRepository(undefined, directory)
  try {
    const service = new CaseService(repository)
    const item = await service.create("customer", "failed-recharge")
    await service.investigate(item.id, "customer")
    await expect(
      repository.transact((state) => {
        state.cases[item.id].amount = 999
        throw new Error("fail")
      })
    ).rejects.toThrow("fail")
    await repository.close()
    repository = new DatabaseRepository(undefined, directory)
    const saved = await new CaseService(repository).get(item.id, "customer")
    expect(saved.amount).toBe(650)
    expect(saved.status).toBe("refund_processing")
    expect(saved.lostResponseRecovered).toBe(true)
  } finally {
    await repository.close()
    await rm(directory, { recursive: true, force: true })
  }
}, 30000)
