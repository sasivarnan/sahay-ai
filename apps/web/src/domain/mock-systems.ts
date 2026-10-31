import { randomUUID } from "node:crypto"
import type { Case, Evidence, Refund, State } from "./model"

export class MockResponseLost extends Error {}
export class MockStatusUnavailable extends Error {}
export const refundKey = (item: Case) =>
  `refund:${item.ownerId}:${item.transactionId}`

export function readMockLedger(item: Case) {
  return {
    debited: true,
    amount: item.amount,
    transactionId: item.transactionId,
  }
}
export function readMockPaymentStatus(item: Case) {
  if (item.scenarioId === "status-unavailable")
    throw new MockStatusUnavailable("Mock payment status timed out.")
  return {
    status: item.scenarioId === "merchant-credited" ? "success" : "failed",
    reversalComplete: false,
  }
}
export function readMockSettlement(item: Case) {
  return { merchantCredited: item.scenarioId === "merchant-credited" }
}
export function readMockRefund(state: State, item: Case) {
  return state.refunds[refundKey(item)]
}
export function submitMockRefund(state: State, item: Case): Refund {
  const key = refundKey(item)
  if (state.refunds[key]) return state.refunds[key]
  const refund: Refund = {
    id: `RF-${randomUUID().slice(0, 8).toUpperCase()}`,
    key,
    caseId: item.id,
    amount: item.amount,
    status: "processing",
  }
  state.refunds[key] = refund
  if (item.scenarioId === "failed-recharge")
    throw new MockResponseLost(
      "Accepted refund; response lost before the caller received it."
    )
  return refund
}
export function collectMockEvidence(
  state: State,
  item: Case,
  checkedAt: string
): Evidence[] {
  const ledger = readMockLedger(item)
  let paymentResult: string
  try {
    const payment = readMockPaymentStatus(item)
    paymentResult =
      payment.status === "success"
        ? "Payment successful"
        : "Payment failed; reversal not completed"
  } catch (error) {
    if (!(error instanceof MockStatusUnavailable)) throw error
    paymentResult = "Unavailable: upstream timeout. Final result is unknown."
  }
  const settlement = readMockSettlement(item)
  const refund = readMockRefund(state, item)
  return [
    {
      source: "Mock ledger",
      result: `₹${ledger.amount} debit confirmed for ${ledger.transactionId}`,
      checkedAt,
    },
    { source: "Mock payment status", result: paymentResult, checkedAt },
    {
      source: "Mock settlements",
      result: settlement.merchantCredited
        ? "Merchant credit confirmed"
        : "No merchant credit recorded",
      checkedAt,
    },
    {
      source: "Mock refund queue",
      result: refund
        ? "Existing refund found; reuse its action key"
        : "No existing refund",
      checkedAt,
    },
  ]
}
