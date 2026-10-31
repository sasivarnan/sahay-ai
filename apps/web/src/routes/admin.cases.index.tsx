import { createFileRoute } from "@tanstack/react-router"
import { TeamInbox } from "@/features/team"

export const Route = createFileRoute("/admin/cases/")({ component: TeamInbox })
