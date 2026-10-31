import { createFileRoute } from "@tanstack/react-router"
import { AdminCasePage } from "@/features/admin-case"

export const Route = createFileRoute("/admin/cases/$caseId")({
  component: Page,
})

function Page() {
  const { caseId } = Route.useParams()
  return <AdminCasePage key={caseId} caseId={caseId} />
}
