import { Link, useNavigate, useSearch } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import { teamOptions } from "@/lib/api"
import { statusLabel } from "@/lib/status"
import { responseText } from "@/domain/response-text"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { RiArrowRightLine } from "@remixicon/react"

export function TeamInbox() {
  const cases = useQuery(teamOptions)
  const search = useSearch({ from: "/admin/cases" })
  const navigate = useNavigate({ from: "/admin/cases" })
  const query = search.q?.trim().toLowerCase() ?? ""
  const visible =
    cases.data?.filter(
      (item) =>
        (!search.status || item.status === search.status) &&
        (!query ||
          `${item.merchant} ${item.transactionId} ${item.amount}`
            .toLowerCase()
            .includes(query))
    ) ?? []

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-5 md:p-8">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">Case inbox</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Select a case to review evidence and help the customer.
        </p>
      </header>
      <div className="flex flex-wrap items-center gap-3">
        <Tabs
          value={search.status ?? "all"}
          onValueChange={(value) => {
            void navigate({
              to: "/admin/cases",
              search: {
                ...search,
                status:
                  value === "awaiting_approval" || value === "human_owned"
                    ? value
                    : undefined,
              },
              replace: true,
              resetScroll: false,
            })
          }}
        >
          <TabsList className="h-11" aria-label="Filter cases">
            <TabsTrigger className="px-3" value="all">
              All cases
            </TabsTrigger>
            <TabsTrigger className="px-3" value="awaiting_approval">
              Needs review
            </TabsTrigger>
            <TabsTrigger className="px-3" value="human_owned">
              With support
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <Input
          className="h-11 w-full sm:ml-auto sm:max-w-xs"
          aria-label="Search cases"
          placeholder="Search merchant or transaction…"
          value={search.q ?? ""}
          onChange={(event) => {
            void navigate({
              to: "/admin/cases",
              search: { ...search, q: event.target.value || undefined },
              replace: true,
              resetScroll: false,
            })
          }}
        />
      </div>
      {cases.error && (
        <Alert variant="destructive">
          <AlertDescription>{cases.error.message}</AlertDescription>
        </Alert>
      )}
      {cases.isPending && (
        <p role="status" className="text-sm text-muted-foreground">
          Loading cases…
        </p>
      )}
      {!cases.isPending && !cases.error && visible.length === 0 && (
        <p className="py-8 text-center text-sm text-muted-foreground">
          {cases.data?.length
            ? "No cases match these filters."
            : "No cases yet. Start a customer conversation first."}
        </p>
      )}
      <div className="space-y-3">
        {visible.map((item) => (
          <Card key={item.id} className="py-0 shadow-none">
            <CardContent className="flex items-center gap-4 p-4">
              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="font-semibold">{item.merchant}</span>
                  <span className="text-sm">
                    ₹{item.amount.toLocaleString("en-IN")}
                  </span>
                  <Badge variant="secondary">{statusLabel[item.status]}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {item.transactionId} · Updated{" "}
                  {new Date(item.updatedAt).toLocaleTimeString("en-IN", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
                <p className="line-clamp-1 text-sm text-muted-foreground">
                  {responseText(
                    item.messages.at(-1)?.content ?? "Ready for review."
                  )}
                </p>
              </div>
              <Button
                className="h-11 shrink-0"
                variant="outline"
                render={
                  <Link
                    to="/admin/cases/$caseId"
                    params={{ caseId: item.id }}
                    search={search}
                  />
                }
                aria-label={`Open ${item.merchant} case`}
              >
                Open <RiArrowRightLine />
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </main>
  )
}
