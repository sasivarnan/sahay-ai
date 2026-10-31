import { createFileRoute } from "@tanstack/react-router"
import { Results } from "@/features/results"
export const Route = createFileRoute("/admin/results")({ component: Results })
