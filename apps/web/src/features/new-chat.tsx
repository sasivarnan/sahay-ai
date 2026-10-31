import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import { api, bootstrapOptions } from "@/lib/api"
import type { Case, ScenarioId } from "@/domain/model"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Skeleton } from "@/components/ui/skeleton"
import { RiArrowRightLine } from "@remixicon/react"
export function NewChat() {
  const bootstrap = useQuery(bootstrapOptions)
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const create = useMutation({
    mutationFn: (scenarioId: ScenarioId) => api<Case>("chats", { scenarioId }),
    onSuccess: async (item) => {
      await queryClient.invalidateQueries({ queryKey: ["chats"] })
      await navigate({
        to: "/customer/chats/$chatId",
        params: { chatId: item.id },
      })
    },
  })
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-5 py-12 md:py-20">
      <section className="space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight">
          Which payment needs help?
        </h1>
        <p className="text-muted-foreground">
          Choose a payment to start a conversation.
        </p>
      </section>
      {bootstrap.isPending && (
        <Skeleton className="h-64 w-full" aria-label="Loading payments" />
      )}
      {bootstrap.isError && (
        <Alert variant="destructive">
          <AlertDescription>
            Unable to load payments. Refresh to retry.
          </AlertDescription>
        </Alert>
      )}
      {bootstrap.data && (
        <Card className="gap-0 py-2 shadow-none">
          <CardContent className="divide-y px-2">
            {bootstrap.data.scenarios.map((item) => (
              <Button
                key={item.id}
                variant="ghost"
                className="h-auto min-h-20 w-full justify-between gap-4 rounded-none px-4 py-4 text-left whitespace-normal"
                disabled={create.isPending}
                onClick={() => create.mutate(item.id)}
                aria-label={`Get help with ${item.merchant}, ₹${item.amount.toLocaleString("en-IN")}`}
              >
                <span className="flex min-w-0 flex-col gap-1">
                  <span className="font-medium">{item.merchant}</span>
                  <span className="text-xs font-normal text-muted-foreground">
                    {item.transactionId}
                  </span>
                </span>
                <span className="ml-auto shrink-0 font-semibold">
                  ₹{item.amount.toLocaleString("en-IN")}
                </span>
                <RiArrowRightLine className="shrink-0 text-muted-foreground" />
              </Button>
            ))}
          </CardContent>
        </Card>
      )}
      {create.error && (
        <Alert variant="destructive">
          <AlertDescription>{create.error.message}</AlertDescription>
        </Alert>
      )}
    </main>
  )
}
