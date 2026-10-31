import type { ReactNode } from "react"
import { Link, useLocation } from "@tanstack/react-router"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  api,
  bootstrapOptions,
  chatListOptions,
  adminSessionOptions,
} from "@/lib/api"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import {
  RiChat3Line,
  RiAddLine,
  RiInbox2Line,
  RiBarChartBoxLine,
  RiShieldCheckLine,
  RiLockLine,
} from "@remixicon/react"
export function Shell({
  children,
  workspace = "customer",
}: {
  children: ReactNode
  workspace?: "customer" | "admin"
}) {
  const admin = workspace === "admin"
  const bootstrap = useQuery({ ...bootstrapOptions, enabled: !admin })
  const adminSession = useQuery({ ...adminSessionOptions, enabled: admin })
  const chats = useQuery({
    ...chatListOptions,
    enabled: !admin && bootstrap.isSuccess,
  })
  const client = useQueryClient()
  const location = useLocation()
  const caseWorkspace =
    admin && /^\/admin\/cases\/[^/]+\/?$/.test(location.pathname)
  const lock = useMutation({
    mutationFn: () => api("admin/lock", {}),
    onSuccess: () => {
      client.setQueryData(adminSessionOptions.queryKey, { role: "customer" })
      client.removeQueries({ queryKey: ["team-cases"] })
      client.removeQueries({ queryKey: ["admin-case"] })
    },
  })
  return (
    <SidebarProvider
      key={caseWorkspace ? "admin-case" : "workspace"}
      defaultOpen={!caseWorkspace}
    >
      <Sidebar collapsible={admin ? "icon" : "offcanvas"}>
        <SidebarHeader className="gap-4 px-5 py-6 group-data-[collapsible=icon]:p-2">
          <Link
            to={admin ? "/admin/cases" : "/customer/chats"}
            aria-label={
              admin ? "Sahay AI admin workspace" : "Sahay AI customer support"
            }
            className="flex items-center gap-3"
          >
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground group-data-[collapsible=icon]:size-8">
              <RiShieldCheckLine size={22} />
            </span>
            <span className="group-data-[collapsible=icon]:hidden">
              <span className="block text-xl font-semibold tracking-tight">
                Sahay AI
              </span>
              <span className="text-xs text-muted-foreground">
                {admin ? "Admin workspace" : "Customer support"}
              </span>
            </span>
          </Link>
        </SidebarHeader>
        <SidebarContent>
          {admin ? (
            <SidebarGroup>
              <SidebarGroupLabel>Operations</SidebarGroupLabel>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    render={<Link to="/admin/cases" />}
                    tooltip="Case inbox"
                    isActive={location.pathname.startsWith("/admin/cases")}
                  >
                    <RiInbox2Line />
                    <span>Case inbox</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    render={<Link to="/admin/results" />}
                    tooltip="Results"
                    isActive={location.pathname === "/admin/results"}
                  >
                    <RiBarChartBoxLine />
                    <span>Results</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroup>
          ) : (
            <>
              <SidebarGroup>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      render={<Link to="/customer/chats" />}
                      isActive={location.pathname === "/customer/chats"}
                    >
                      <RiAddLine />
                      <span>New chat</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroup>
              <SidebarGroup>
                <SidebarGroupLabel>Conversations</SidebarGroupLabel>
                <SidebarMenu>
                  {chats.data?.map((chat) => (
                    <SidebarMenuItem key={chat.id}>
                      <SidebarMenuButton
                        render={
                          <Link
                            to="/customer/chats/$chatId"
                            params={{ chatId: chat.id }}
                          />
                        }
                        isActive={location.pathname.endsWith(chat.id)}
                      >
                        <RiChat3Line />
                        <span className="truncate">{chat.title}</span>
                        <span className="ml-auto text-xs text-muted-foreground">
                          ₹{chat.amount.toLocaleString("en-IN")}
                        </span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                  {chats.data?.length === 0 && (
                    <p className="px-2 py-3 text-xs text-muted-foreground">
                      Select a transaction to start.
                    </p>
                  )}
                </SidebarMenu>
              </SidebarGroup>
            </>
          )}
        </SidebarContent>
        <SidebarFooter className="gap-3 p-5 group-data-[collapsible=icon]:p-2">
          {admin && adminSession.data?.role === "operator" && (
            <Button
              variant="ghost"
              className="h-11 justify-start group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0"
              aria-label="Lock workspace"
              onClick={() => lock.mutate()}
              disabled={lock.isPending}
            >
              <RiLockLine />
              <span className="group-data-[collapsible=icon]:hidden">
                Lock workspace
              </span>
            </Button>
          )}
          {lock.error && (
            <p role="alert" className="text-xs text-destructive">
              {lock.error.message}
            </p>
          )}
          <p className="text-xs leading-relaxed text-muted-foreground group-data-[collapsible=icon]:hidden">
            Demo · payment data, policies, and actions are simulated.
          </p>
          <span
            className="hidden text-center text-[10px] text-muted-foreground group-data-[collapsible=icon]:block"
            title="Demo: payment data, policies, and actions are simulated."
          >
            Demo
          </span>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
        <header className="sticky top-0 z-30 flex h-12 shrink-0 items-center gap-3 border-b bg-background px-4 md:px-6">
          <SidebarTrigger />
          <Separator orientation="vertical" className="h-4" />
          <span className="text-xs text-muted-foreground">
            {admin ? "Admin workspace" : "Customer support"}
          </span>
          <Badge
            variant={admin ? "default" : "secondary"}
            className="ml-auto shrink-0 px-3 py-1"
          >
            {admin
              ? adminSession.data?.role === "operator"
                ? "Admin"
                : "Admin · locked"
              : "Customer"}
          </Badge>
        </header>
        {children}
      </SidebarInset>
    </SidebarProvider>
  )
}
