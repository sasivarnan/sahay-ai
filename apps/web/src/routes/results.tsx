import { createFileRoute, redirect } from "@tanstack/react-router"
export const Route = createFileRoute("/results")({
  beforeLoad: () => {
    throw redirect({ to: "/admin/results", replace: true })
  },
})
