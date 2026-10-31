import type { CaseStatus } from "@/domain/model"
export const statusLabel: Record<CaseStatus, string> = {
  open: "Ready to investigate",
  awaiting_approval: "Needs review",
  refund_processing: "Refund in progress",
  resolved: "Resolved",
  human_owned: "With support",
  pending_check: "Checking payment",
}
