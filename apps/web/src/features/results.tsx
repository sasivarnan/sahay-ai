import { useQuery } from "@tanstack/react-query"
import { teamOptions } from "@/lib/api"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion"
import { statusLabel } from "@/lib/status"
export function Results() {
  const team = useQuery(teamOptions)
  const cases = team.data ?? []
  const resolved = cases.filter((item) => item.status === "resolved")
  const automatic = resolved.filter((item) => !item.proposal)
  const recovery = cases.filter((item) => item.lostResponseRecovered)
  const metrics = [
    { label: "Recorded cases", value: cases.length },
    { label: "Verified resolutions", value: resolved.length },
    { label: "Resolved without human approval", value: automatic.length },
    { label: "Lost responses recovered", value: recovery.length },
  ]
  return (
    <main className="flex flex-col gap-7 p-5 md:p-8">
      <section>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight">
          Case results
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Recorded outcomes from simulated cases. All demo sessions.
        </p>
      </section>
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => (
          <Card key={metric.label}>
            <CardHeader>
              <CardDescription>{metric.label}</CardDescription>
            </CardHeader>
            <CardContent className="text-4xl font-semibold">
              {metric.value}
            </CardContent>
          </Card>
        ))}
      </section>
      <Card>
        <CardHeader>
          <CardTitle>Case outcomes</CardTitle>
          <CardDescription>
            A case is resolved only after verified credit or refund completion.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Transaction</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Outcome</TableHead>
                <TableHead>Approval</TableHead>
                <TableHead>Recovery</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {cases.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>{item.transactionId}</TableCell>
                  <TableCell>₹{item.amount.toLocaleString("en-IN")}</TableCell>
                  <TableCell>{statusLabel[item.status]}</TableCell>
                  <TableCell>
                    {item.proposal?.state ?? "Not required"}
                  </TableCell>
                  <TableCell>
                    {item.lostResponseRecovered
                      ? "Original action recovered"
                      : "No fault injected"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {cases.length === 0 && (
            <p className="py-6 text-sm text-muted-foreground">
              Run a case to see results.
            </p>
          )}
        </CardContent>
      </Card>
      <Accordion className="max-w-2xl">
        <AccordionItem value="definitions">
          <AccordionTrigger className="min-h-11">
            How these results are measured
          </AccordionTrigger>
          <AccordionContent className="space-y-2 text-sm text-muted-foreground">
            <p>
              Verified resolutions require confirmed merchant credit or a
              completed simulated refund.
            </p>
            <p>
              Cases resolved without approval have no human approval proposal.
            </p>
            <p>
              Recovery counts accepted refunds found through their original
              action keys.
            </p>
            <p>These results do not measure production savings or accuracy.</p>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </main>
  )
}
