export type CaseStatus =
  | "open"
  | "awaiting_approval"
  | "refund_processing"
  | "resolved"
  | "human_owned"
  | "pending_check"
export type ScenarioId =
  | "failed-recharge"
  | "merchant-credited"
  | "approval-required"
  | "status-unavailable"
export type Message = {
  id: string
  role: "user" | "assistant"
  content: string
  createdAt: string
  source: "customer" | "sarvam" | "simulation" | "system" | "voice" | "support"
}
export type Evidence = { source: string; result: string; checkedAt: string }
export type AuditEvent = {
  id: string
  type: string
  description: string
  actor: string
  at: string
}
export type Proposal = {
  id: string
  amount: number
  transactionId: string
  evidenceFingerprint: string
  state: "pending" | "approved" | "rejected"
  decidedBy?: string
}
export type Refund = {
  id: string
  key: string
  caseId: string
  amount: number
  status: "processing" | "complete"
}
export type Case = {
  id: string
  ownerId: string
  title: string
  scenarioId: ScenarioId
  transactionId: string
  merchant: string
  amount: number
  status: CaseStatus
  version: number
  createdAt: string
  updatedAt: string
  messages: Message[]
  evidence: Evidence[]
  audit: AuditEvent[]
  proposal?: Proposal
  refundId?: string
  followUpAt?: string
  investigationCount: number
  lostResponseRecovered: boolean
  assignedTo?: string
  resolution?: { summary: string; actor: string; at: string }
}
export type Job = {
  id: string
  caseId: string
  dueAt: string
  state: "pending" | "done"
  kind: "refund_check" | "status_check"
}
export type State = {
  cases: Record<string, Case>
  refunds: Record<string, Refund>
  jobs: Record<string, Job>
  sessions: Record<
    string,
    {
      role: "customer" | "operator"
      scope?: "customer" | "admin"
      createdAt: string
    }
  >
  runs: Record<
    string,
    {
      caseId: string
      status: "running" | "complete" | "failed"
      updatedAt: string
    }
  >
}
export const emptyState = (): State => ({
  cases: {},
  refunds: {},
  jobs: {},
  sessions: {},
  runs: {},
})
export const scenarios: {
  id: ScenarioId
  title: string
  amount: number
  transactionId: string
  merchant: string
  description: string
}[] = [
  {
    id: "failed-recharge",
    title: "Failed recharge",
    amount: 650,
    transactionId: "TXN-DEMO-0650",
    merchant: "Apex Mobile",
    description:
      "Failed recharge · automatic resolution · lost-response recovery",
  },
  {
    id: "merchant-credited",
    title: "Merchant payment",
    amount: 1200,
    transactionId: "TXN-DEMO-1200",
    merchant: "Apex Groceries",
    description: "Payment credited · no refund required",
  },
  {
    id: "approval-required",
    title: "Merchant dispute",
    amount: 4800,
    transactionId: "TXN-DEMO-1042",
    merchant: "Apex Electronics",
    description: "Failed payment · human approval required",
  },
  {
    id: "status-unavailable",
    title: "Uncertain payment",
    amount: 900,
    transactionId: "TXN-DEMO-0900",
    merchant: "Apex Cafe",
    description: "Status unavailable · wait and check again",
  },
]
