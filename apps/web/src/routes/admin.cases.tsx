import { createFileRoute, Outlet } from "@tanstack/react-router"

export type CaseInboxSearch = {
  q?: string
  status?: "awaiting_approval" | "human_owned"
}

export const Route = createFileRoute("/admin/cases")({
  validateSearch: (search: Record<string, unknown>): CaseInboxSearch => ({
    q: typeof search.q === "string" ? search.q.slice(0, 200) : undefined,
    status:
      search.status === "awaiting_approval" || search.status === "human_owned"
        ? search.status
        : undefined,
  }),
  component: Outlet,
})
