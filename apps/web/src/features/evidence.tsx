import type { Case } from "@/domain/model"
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion"
export function EvidencePanel({ item }: { item: Case }) {
  return (
    <div className="space-y-4 text-sm">
      <dl className="space-y-3">
        <div>
          <dt className="text-xs text-muted-foreground">Transaction</dt>
          <dd className="mt-1 font-medium">{item.transactionId}</dd>
        </div>
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
            <div className="space-y-4 py-2">
              {item.evidence.length ? (
                item.evidence.map((evidence, index) => (
                  <div key={`${evidence.source}-${index}`}>
                    <p className="font-medium capitalize">
                      {evidence.source.replace("Mock ", "")}
                    </p>
                    <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                      {evidence.result}
                    </p>
                  </div>
                ))
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
