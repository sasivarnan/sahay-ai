import type { Case } from "@/domain/model"
import { Card, CardContent } from "@/components/ui/card"
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion"
export function EvidencePanel({
  item,
  layout = "stacked",
}: {
  item: Case
  layout?: "stacked" | "grid"
}) {
  const grid = layout === "grid"
  return (
    <div className="space-y-4 text-sm">
      <dl className={grid ? "grid gap-4 sm:grid-cols-3" : "space-y-3"}>
        <div>
          <dt className="text-xs text-muted-foreground">Transaction</dt>
          <dd className="mt-1 font-medium">{item.transactionId}</dd>
        </div>
        {grid && (
          <>
            <div>
              <dt className="text-xs text-muted-foreground">Payment amount</dt>
              <dd className="mt-1 font-medium">
                ₹{item.amount.toLocaleString("en-IN")} INR
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Merchant</dt>
              <dd className="mt-1 font-medium break-words">{item.merchant}</dd>
            </div>
          </>
        )}
        {item.refundId && (
          <div>
            <dt className="text-xs text-muted-foreground">Refund reference</dt>
            <dd className="mt-1">{item.refundId}</dd>
          </div>
        )}
        {item.followUpAt && (
          <div>
            <dt className="text-xs text-muted-foreground">Next check</dt>
            <dd className="mt-1">
              {new Date(item.followUpAt).toLocaleTimeString("en-IN")}
            </dd>
          </div>
        )}
      </dl>
      <Accordion defaultValue={["evidence"]}>
        <AccordionItem value="evidence">
          <AccordionTrigger className="min-h-11">
            Payment checks{" "}
            {item.evidence.length > 0 && `(${item.evidence.length})`}
          </AccordionTrigger>
          <AccordionContent>
            <div
              className={
                grid ? "grid gap-3 py-2 sm:grid-cols-2" : "space-y-4 py-2"
              }
            >
              {item.evidence.length ? (
                item.evidence.map((evidence, index) =>
                  grid ? (
                    <Card
                      key={`${evidence.source}-${index}`}
                      className="min-w-0 bg-muted/30 py-0 shadow-none"
                    >
                      <CardContent className="p-4">
                        <p className="font-medium capitalize">
                          {evidence.source.replace("Mock ", "")}
                        </p>
                        <p className="mt-2 text-sm leading-relaxed break-words text-muted-foreground">
                          {evidence.result}
                        </p>
                      </CardContent>
                    </Card>
                  ) : (
                    <div key={`${evidence.source}-${index}`}>
                      <p className="font-medium capitalize">
                        {evidence.source.replace("Mock ", "")}
                      </p>
                      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                        {evidence.result}
                      </p>
                    </div>
                  )
                )
              ) : (
                <p className="text-muted-foreground">
                  Checks will appear after investigation.
                </p>
              )}
            </div>
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value="history">
          <AccordionTrigger className="min-h-11">
            Action history ({item.audit.length})
          </AccordionTrigger>
          <AccordionContent>
            <ol className="space-y-4 py-2">
              {item.audit.map((event) => (
                <li key={event.id} className="border-l-2 border-border pl-3">
                  <p className="text-xs font-medium capitalize">
                    {event.type.replaceAll("_", " ")}
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    {event.description}
                  </p>
                </li>
              ))}
            </ol>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  )
}
