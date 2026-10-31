import { useEffect, useRef, useState } from "react"
import { Link, useNavigate, useSearch } from "@tanstack/react-router"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type { Case } from "@/domain/model"
import { responseText } from "@/domain/response-text"
import { adminCaseOptions, api } from "@/lib/api"
import { statusLabel } from "@/lib/status"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog"
import {
  RiArrowLeftLine,
  RiSendPlaneLine,
  RiChat3Line,
  RiSubtractLine,
} from "@remixicon/react"
import { EvidencePanel } from "./evidence"
import { DemoControls } from "./demo-controls"

type CaseAction =
  | { kind: "decision"; proposalId: string; approve: boolean }
  | { kind: "reply"; content: string }
  | { kind: "resolve"; summary: string }

export function AdminCasePage({ caseId }: { caseId: string }) {
  const query = useQuery(adminCaseOptions(caseId))
  const search = useSearch({ from: "/admin/cases" })
  if (query.isPending)
    return (
      <p role="status" className="p-8">
        Loading case…
      </p>
    )
  if (query.isError)
    return (
      <main className="space-y-4 p-8">
        <Button
          variant="outline"
          render={<Link to="/admin/cases" search={search} />}
        >
          Back to cases
        </Button>
        <Alert variant="destructive">
          <AlertDescription>{query.error.message}</AlertDescription>
        </Alert>
      </main>
    )
  return <CaseWorkspace item={query.data} />
}

function CaseWorkspace({ item }: { item: Case }) {
  const client = useQueryClient()
  const search = useSearch({ from: "/admin/cases" })
  const navigate = useNavigate()
  const [draft, setDraft] = useState("")
  const [summary, setSummary] = useState("")
  const [resolveOpen, setResolveOpen] = useState(false)
  const [chatOpen, setChatOpen] = useState(false)
  const [readCount, setReadCount] = useState(item.messages.length)
  const chatWindow = useRef<HTMLDivElement>(null)
  const chatButton = useRef<HTMLButtonElement>(null)
  const chatWasOpen = useRef(false)
  const messages = useRef<HTMLDivElement>(null)
  const followMessages = useRef(true)
  const action = useMutation({
    mutationFn: (data: CaseAction) => {
      if (data.kind === "decision")
        return api<Case>("admin/decision", {
          caseId: item.id,
          proposalId: data.proposalId,
          approve: data.approve,
        })
      if (data.kind === "reply")
        return api<Case>(`admin/cases/${item.id}/messages`, {
          content: data.content,
        })
      return api<Case>(`admin/cases/${item.id}/resolve`, {
        summary: data.summary,
      })
    },
    onSuccess: (updated, data) => {
      client.setQueryData(adminCaseOptions(item.id).queryKey, updated)
      void client.invalidateQueries({ queryKey: ["team-cases"] })
      void client.invalidateQueries({ queryKey: ["case", item.id] })
      void client.invalidateQueries({ queryKey: ["chats"] })
      if (data.kind === "reply") {
        setDraft("")
        followMessages.current = true
      }
      if (data.kind === "decision" && !data.approve) setChatOpen(true)
      if (data.kind === "resolve") {
        setSummary("")
        setResolveOpen(false)
      }
    },
    onError: () => {
      void client.invalidateQueries({ queryKey: ["admin-case", item.id] })
    },
  })
  useEffect(() => {
    if (chatOpen) setReadCount(item.messages.length)
    if (chatOpen && messages.current && followMessages.current)
      messages.current.scrollTop = messages.current.scrollHeight
  }, [item.messages.length, chatOpen])
  useEffect(() => {
    if (chatOpen) chatWindow.current?.focus()
    else if (chatWasOpen.current) chatButton.current?.focus()
    chatWasOpen.current = chatOpen
  }, [chatOpen])
  useEffect(() => {
    const node = messages.current
    if (!chatOpen || !node) return
    const observer = new ResizeObserver(() => {
      if (followMessages.current) node.scrollTop = node.scrollHeight
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [chatOpen])

  const withSupport = item.status === "human_owned"
  const unread = item.messages
    .slice(readCount)
    .filter((message) => message.role === "user").length
  const context = (
    <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_320px] xl:gap-6">
      <Card className="order-1 shadow-none xl:col-start-2 xl:row-start-1">
        <CardHeader>
          <CardTitle>Case actions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {item.status === "awaiting_approval" && item.proposal ? (
            <>
              <p className="text-sm text-muted-foreground">
                Demo policy: refunds above ₹3,000 need human approval.
              </p>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                <Button
                  className="h-11 w-full"
                  disabled={action.isPending}
                  onClick={() =>
                    action.mutate({
                      kind: "decision",
                      proposalId: item.proposal!.id,
                      approve: true,
                    })
                  }
                >
                  Approve ₹{item.proposal.amount.toLocaleString("en-IN")} refund
                </Button>
                <Button
                  className="h-11 w-full"
                  variant="outline"
                  disabled={action.isPending}
                  onClick={() =>
                    action.mutate({
                      kind: "decision",
                      proposalId: item.proposal!.id,
                      approve: false,
                    })
                  }
                >
                  Reject and take ownership
                </Button>
              </div>
            </>
          ) : withSupport ? (
            <>
              <p className="text-sm text-muted-foreground">
                Support owns this case. Reply to the customer, then record the
                resolution.
              </p>
              <Button
                className="h-11 w-full"
                variant="outline"
                disabled={action.isPending}
                onClick={() => setResolveOpen(true)}
              >
                Resolve case
              </Button>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              {item.status === "refund_processing"
                ? "The refund is processing. Wait for the recorded result before closure."
                : item.resolution
                  ? `Support resolution: ${item.resolution.summary}`
                  : "No officer action is available for this status."}
            </p>
          )}
        </CardContent>
      </Card>
      <Card className="order-2 min-w-0 shadow-none xl:col-start-1 xl:row-span-2 xl:row-start-1">
        <CardHeader>
          <CardTitle>Payment evidence</CardTitle>
        </CardHeader>
        <CardContent>
          <EvidencePanel item={item} layout="grid" />
        </CardContent>
      </Card>
      <div className="order-3 xl:col-start-2">
        <DemoControls
          item={item}
          onReset={() => {
            void navigate({ to: "/admin/cases", search })
          }}
        />
      </div>
    </div>
  )

  return (
    <main className="flex h-[calc(100dvh-3rem)] min-h-0 min-w-0 flex-col">
      <header className="flex shrink-0 flex-wrap items-center gap-3 border-b bg-background px-5 py-4 md:px-8">
        <Button
          variant="ghost"
          className="h-11 shrink-0"
          render={<Link to="/admin/cases" search={search} />}
        >
          <RiArrowLeftLine />
          Back to cases
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="text-base font-semibold break-words sm:text-lg">
            {item.merchant} · ₹{item.amount.toLocaleString("en-IN")}
          </h1>
          <p className="text-xs break-all text-muted-foreground">
            {item.transactionId}
          </p>
        </div>
        <Badge variant="secondary" role="status" aria-live="polite">
          {statusLabel[item.status]}
        </Badge>
      </header>
      <div
        className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 pb-24 sm:p-5 sm:pb-24 xl:p-6 xl:pb-24"
        aria-label="Case details"
      >
        {action.error && action.variables?.kind !== "reply" && (
          <Alert variant="destructive">
            <AlertDescription>{action.error.message}</AlertDescription>
          </Alert>
        )}
        {context}
      </div>
      {!chatOpen && (
        <Button
          ref={chatButton}
          className="fixed right-6 bottom-6 z-40 h-12 gap-2 px-5 shadow-lg"
          aria-haspopup="dialog"
          aria-expanded={false}
          aria-label={
            unread
              ? `Open customer chat, ${unread} new messages`
              : "Open customer chat"
          }
          onClick={() => setChatOpen(true)}
        >
          <RiChat3Line />
          Customer chat
          {unread > 0 && <Badge variant="secondary">{unread} new</Badge>}
        </Button>
      )}
      {chatOpen && (
        <Card
          ref={chatWindow}
          role="dialog"
          aria-modal={false}
          aria-labelledby="customer-chat-title"
          tabIndex={-1}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.stopPropagation()
              setChatOpen(false)
            }
          }}
          className="fixed right-4 bottom-4 z-40 flex h-[min(560px,calc(100dvh-11rem))] w-[440px] max-w-[calc(100vw-2rem)] flex-col gap-0 overflow-hidden py-0 shadow-xl outline-none sm:right-6 sm:bottom-6 portrait:h-[min(480px,48dvh)]"
        >
          <CardHeader className="flex shrink-0 flex-row items-center justify-between gap-3 border-b px-4 py-2">
            <div>
              <CardTitle id="customer-chat-title">
                Customer conversation
              </CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">
                {item.merchant} · {item.transactionId}
              </p>
            </div>
            <Button
              variant="ghost"
              className="size-11 shrink-0"
              aria-label="Minimise customer chat"
              onClick={() => setChatOpen(false)}
            >
              <RiSubtractLine />
            </Button>
          </CardHeader>
          <CardContent
            ref={messages}
            className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5"
            role="log"
            aria-label="Case conversation"
            onScroll={() => {
              const node = messages.current
              if (node)
                followMessages.current =
                  node.scrollHeight - node.scrollTop - node.clientHeight < 100
            }}
          >
            {item.messages.map((message) => (
              <div
                key={message.id}
                className={`flex flex-col gap-1.5 ${message.role === "user" ? "items-start" : "items-end"}`}
              >
                <span className="text-xs font-medium text-muted-foreground">
                  {message.role === "user"
                    ? "Customer"
                    : message.source === "support"
                      ? "Support officer"
                      : "Sahay"}
                </span>
                <Card
                  className={`max-w-[95%] py-0 shadow-none ${message.source === "support" ? "border-primary/20 bg-primary/5" : "bg-muted/40"}`}
                >
                  <CardContent className="px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap">
                    {message.role === "assistant"
                      ? responseText(message.content)
                      : message.content}
                  </CardContent>
                </Card>
              </div>
            ))}
          </CardContent>
          <form
            className="shrink-0 space-y-3 border-t bg-background p-4"
            onSubmit={(event) => {
              event.preventDefault()
              if (withSupport && draft.trim() && !action.isPending)
                action.mutate({ kind: "reply", content: draft.trim() })
            }}
          >
            {action.error && action.variables?.kind === "reply" && (
              <Alert variant="destructive">
                <AlertDescription>{action.error.message}</AlertDescription>
              </Alert>
            )}
            <Textarea
              rows={2}
              maxLength={2000}
              value={draft}
              disabled={!withSupport || action.isPending}
              onChange={(event) => setDraft(event.target.value)}
              aria-label="Reply to customer"
              placeholder={
                withSupport
                  ? "Reply as the support officer…"
                  : item.status === "resolved"
                    ? "This case is closed."
                    : "Take ownership to reply to the customer."
              }
              onKeyDown={(event) => {
                if (
                  event.key === "Enter" &&
                  !event.shiftKey &&
                  !event.nativeEvent.isComposing
                ) {
                  event.preventDefault()
                  event.currentTarget.form?.requestSubmit()
                }
              }}
            />
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">
                {withSupport
                  ? "Replies appear in the customer conversation."
                  : item.status === "resolved"
                    ? "Case closed. Replies are disabled."
                    : "Officer replies become available after takeover."}
              </p>
              <Button
                type="submit"
                className="h-11 shrink-0"
                disabled={!withSupport || !draft.trim() || action.isPending}
              >
                <RiSendPlaneLine />
                {action.isPending && action.variables?.kind === "reply"
                  ? "Sending…"
                  : "Send reply"}
              </Button>
            </div>
          </form>
        </Card>
      )}
      <AlertDialog open={resolveOpen} onOpenChange={setResolveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Resolve this support case?</AlertDialogTitle>
            <AlertDialogDescription>
              Record the outcome for the customer. Closing this case does not
              issue a refund or confirm money movement.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea
            aria-label="Resolution summary"
            placeholder="Explain the outcome and any next step…"
            maxLength={1000}
            value={summary}
            onChange={(event) => setSummary(event.target.value)}
            disabled={action.isPending}
          />
          {action.error && (
            <Alert variant="destructive">
              <AlertDescription>{action.error.message}</AlertDescription>
            </Alert>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={action.isPending}>
              Keep case open
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={!summary.trim() || action.isPending}
              onClick={() =>
                action.mutate({ kind: "resolve", summary: summary.trim() })
              }
            >
              {action.isPending ? "Saving…" : "Resolve case"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  )
}
