import { useState } from "react"
import type { ReactNode } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { adminSessionOptions, api } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
export function AdminAccess({ children }: { children: ReactNode }) {
  const session = useQuery(adminSessionOptions)
  const [code, setCode] = useState("")
  const client = useQueryClient()
  const unlock = useMutation({
    mutationFn: () => api<{ role: "operator" }>("admin/unlock", { code }),
    onSuccess: (data) => {
      client.setQueryData(adminSessionOptions.queryKey, data)
      setCode("")
      void client.invalidateQueries({ queryKey: ["team-cases"] })
    },
  })
  if (session.isPending)
    return (
      <p className="p-8" role="status">
        Loading admin workspace…
      </p>
    )
  if (session.data?.role === "operator") return children
  return (
    <main className="mx-auto w-full max-w-lg p-6 py-16">
      <Card>
        <CardHeader>
          <CardTitle>Admin workspace</CardTitle>
          <CardDescription>
            Enter the support team code to review cases. Customer conversations
            use a separate session.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form
            className="flex gap-2"
            onSubmit={(event) => {
              event.preventDefault()
              unlock.mutate()
            }}
          >
            <Input
              className="h-11"
              aria-label="Admin access code"
              type="password"
              autoComplete="off"
              value={code}
              onChange={(event) => setCode(event.target.value)}
            />
            <Button
              className="h-11"
              type="submit"
              disabled={unlock.isPending || !code}
            >
              Unlock
            </Button>
          </form>
          {import.meta.env.DEV && (
            <p className="text-xs text-muted-foreground">
              Local demo code: sahay-finals
            </p>
          )}
          {(unlock.error || session.error) && (
            <Alert variant="destructive">
              <AlertDescription>
                {unlock.error?.message || session.error?.message}
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
    </main>
  )
}
