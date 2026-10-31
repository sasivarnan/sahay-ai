import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { api, teamOptions } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { EvidencePanel } from "./evidence"
import { statusLabel } from "@/lib/status"
import { DemoControls } from "./demo-controls"
export function TeamInbox() {
  const [selectedId, setSelectedId] = useState<string>()
  const client = useQueryClient()
  const cases = useQuery(teamOptions)
  const decision = useMutation({
    mutationFn: (data: {
      caseId: string
      proposalId: string
      approve: boolean
    }) => api("admin/decision", data),
    onMutate: (data) => {
      setSelectedId(data.caseId)
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["team-cases"] })
      void client.invalidateQueries({ queryKey: ["case"] })
    },
  })
  const item =
    cases.data?.find((value) => value.id === selectedId) ??
    cases.data?.find((value) => value.status === "awaiting_approval") ??
    cases.data?.[0]
  return (
    <main className="flex flex-col gap-6 p-5 md:p-8">
      {cases.error && (
        <Alert variant="destructive">
          <AlertDescription>{cases.error.message}</AlertDescription>
        </Alert>
      )}
      <section>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">
          Case inbox
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Review cases that need a decision.
        </p>
      </section>
      <div className="grid gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
        <div className="flex flex-col gap-3">
          {cases.data?.map((value) => (
            <Button
              key={value.id}
              variant={item?.id === value.id ? "secondary" : "ghost"}
              className="h-auto min-h-20 w-full flex-col items-start gap-2 px-4 py-4 text-left whitespace-normal"
              onClick={() => setSelectedId(value.id)}
            >
              <span className="flex w-full justify-between gap-3">
                <span>{value.merchant}</span>
                <span>₹{value.amount.toLocaleString("en-IN")}</span>
              </span>
              <span className="text-xs font-normal text-muted-foreground">
                {statusLabel[value.status]}
              </span>
            </Button>
          ))}
          {cases.data?.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No cases yet. Start a customer conversation first.
            </p>
          )}
        </div>
        {item && (
          <div className="flex flex-col gap-4">
            <Card>
              <CardHeader>
                <CardTitle>
                  {item.merchant} · ₹{item.amount.toLocaleString("en-IN")}
                </CardTitle>
                <CardDescription>
                  {item.messages
                    .filter((message) => message.role === "user")
                    .at(-1)?.content ??
                    "The customer selected this simulated transaction for investigation."}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <p className="text-sm">
                  Demo policy: refunds above ₹3,000 need human approval.
                </p>
                {item.proposal && (
                  <>
                    {item.status !== "awaiting_approval" && (
                      <Badge variant="secondary">
                        {statusLabel[item.status]}
                      </Badge>
                    )}
                    {item.status === "awaiting_approval" && (
                      <div className="flex flex-wrap gap-2">
                        <Button
                          className="h-11"
                          disabled={
                            decision.isPending ||
                            item.status !== "awaiting_approval"
                          }
                          onClick={() =>
                            decision.mutate({
                              caseId: item.id,
                              proposalId: item.proposal!.id,
                              approve: true,
                            })
                          }
                        >
                          Approve ₹
                          {item.proposal.amount.toLocaleString("en-IN")} refund
                        </Button>
                        <Button
                          variant="outline"
                          className="h-11"
                          disabled={
                            decision.isPending ||
                            item.status !== "awaiting_approval"
                          }
                          onClick={() =>
                            decision.mutate({
                              caseId: item.id,
                              proposalId: item.proposal!.id,
                              approve: false,
                            })
                          }
                        >
                          Reject and take ownership
                        </Button>
                      </div>
                    )}
                  </>
                )}
                {decision.error && (
                  <Alert variant="destructive">
                    <AlertDescription>
                      {decision.error.message}
                    </AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>
            <DemoControls
              item={item}
              onReset={() => setSelectedId(undefined)}
            />
            <Card className="shadow-none">
              <CardContent>
                <EvidencePanel item={item} />
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </main>
  )
}
