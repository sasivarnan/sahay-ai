import { createFileRoute, redirect } from "@tanstack/react-router"
export const Route = createFileRoute("/chats/")({
  beforeLoad: () => {
    throw redirect({ to: "/customer/chats", replace: true })
  },
})
