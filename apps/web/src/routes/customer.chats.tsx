import { createFileRoute, Outlet } from "@tanstack/react-router"
import { bootstrapOptions, chatListOptions } from "@/lib/api"
import { Shell } from "@/features/shell"
export const Route = createFileRoute("/customer/chats")({
  ssr: false,
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(bootstrapOptions)
    await context.queryClient.ensureQueryData(chatListOptions)
  },
  component: () => (
    <Shell>
      <Outlet />
    </Shell>
  ),
})
