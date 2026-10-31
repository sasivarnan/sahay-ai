import { useMutation, useQueryClient } from "@tanstack/react-query"
import type { Case } from "@/domain/model"
import { api } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion"
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog"
export function DemoControls({
  item,
  onReset,
}: {
  item: Case
  onReset: () => void
}) {
  const client = useQueryClient()
  const action = useMutation({
    mutationFn: (name: "advance" | "reset") =>
      api(`admin/cases/${item.id}/${name}`, {}),
    onSuccess: (_, name) => {
      void client.invalidateQueries({ queryKey: ["team-cases"] })
      void client.invalidateQueries({ queryKey: ["chats"] })
      void client.invalidateQueries({ queryKey: ["case", item.id] })
      if (name === "advance")
        void client.invalidateQueries({ queryKey: ["admin-case", item.id] })
      else client.removeQueries({ queryKey: ["admin-case", item.id] })
      if (name === "reset") onReset()
    },
  })
  return (
    <Accordion>
      <AccordionItem value="demo">
        <AccordionTrigger className="min-h-11">Demo controls</AccordionTrigger>
        <AccordionContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Only this simulated case is affected.
          </p>
          <div className="flex flex-wrap gap-2">
            {item.followUpAt && (
              <Button
                className="h-11"
                variant="outline"
                disabled={action.isPending}
                onClick={() => action.mutate("advance")}
              >
                Advance simulation
              </Button>
            )}
            <AlertDialog>
              <AlertDialogTrigger
                render={
                  <Button
                    className="h-11"
                    variant="outline"
                    disabled={action.isPending}
                  />
                }
              >
                Reset case
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Reset this demo case?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This removes the case from the customer history and deletes
                    its simulated actions. Other cases remain saved.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Keep case</AlertDialogCancel>
                  <AlertDialogAction onClick={() => action.mutate("reset")}>
                    Reset this case
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
          {action.error && (
            <Alert variant="destructive">
              <AlertDescription>{action.error.message}</AlertDescription>
            </Alert>
          )}
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  )
}
