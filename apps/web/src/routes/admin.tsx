import { createFileRoute, Outlet } from "@tanstack/react-router"
import { adminSessionOptions } from "@/lib/api"
import { Shell } from "@/features/shell"
import { AdminAccess } from "@/features/admin-access"
export const Route = createFileRoute("/admin")({
  ssr: false,
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(adminSessionOptions),
  component: () => (
    <Shell workspace="admin">
      <AdminAccess>
        <Outlet />
      </AdminAccess>
    </Shell>
  ),
})
