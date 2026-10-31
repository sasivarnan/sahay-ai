import { useEffect, useMemo, useRef, useState } from "react"
import { useChat, fetchServerSentEvents } from "@tanstack/ai-react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type { Case } from "@/domain/model"
import { responseText } from "@/domain/response-text"
import { api, bootstrapOptions, caseOptions } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { EvidencePanel } from "./evidence"
import { statusLabel } from "@/lib/status"
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet"
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion"
import { ManagedVoice } from "./voice"
import { VoiceNote } from "./voice-note"
import {
  RiArrowUpLine,
  RiVolumeUpLine,
  RiSearchLine,
  RiInformationLine,
} from "@remixicon/react"

export function ChatPage({ chatId }: { chatId: string }) {
  const data = useQuery(caseOptions(chatId))
  if (data.isPending)
    return (
      <p className="p-8" role="status">
        Loading conversation…
      </p>
    )
  if (data.isError)
    return (
      <Alert className="m-6 w-auto" variant="destructive">
        <AlertDescription>{data.error.message}</AlertDescription>
      </Alert>
    )
  return <Conversation key={chatId} initial={data.data} current={data.data} />
}
function Conversation({ initial, current }: { initial: Case; current: Case }) {
  const client = useQueryClient()
  const bootstrap = useQuery(bootstrapOptions)
  const [draft, setDraft] = useState("")
  const [mode, setMode] = useState("text")
  const [error, setError] = useState("")
  const [provider, setProvider] = useState("")
  const [duration, setDuration] = useState<number>()
  const [speaking, setSpeaking] = useState(false)
  const [language, setLanguage] = useState<"en-IN" | "hi-IN">("en-IN")
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const objectUrl = useRef<string | null>(null)
  const end = useRef<HTMLDivElement>(null)
  const refresh = () => {
    void client.invalidateQueries({ queryKey: ["case", current.id] })
    void client.invalidateQueries({ queryKey: ["chats"] })
  }
  const connection = useMemo(() => fetchServerSentEvents("/api/chat"), [])
  const chat = useChat({
    threadId: current.id,
    connection,
    initialMessages: initial.messages.map((message) => ({
      id: message.id,
      role: message.role,
      parts: [{ type: "text" as const, content: message.content }],
    })),
    onFinish: refresh,
    onCustomEvent: (name, value) => {
      const data = value as Record<string, unknown>
      if (name === "sahay:provider") setProvider(String(data.provider))
      if (name === "sahay:latency") setDuration(Number(data.durationMs))
      if (name === "sahay:case-updated") refresh()
    },
  })
  const action = useMutation({
    mutationFn: (name: "investigate") => api(`cases/${current.id}/${name}`, {}),
    onSuccess: refresh,
  })
  const supportMessage = useMutation({
    mutationFn: (content: string) =>
      api<Case>(`cases/${current.id}/messages`, { content }),
    onSuccess: (item) => {
      client.setQueryData(caseOptions(current.id).queryKey, item)
      setDraft("")
      refresh()
    },
  })
  const savedIds = new Set(current.messages.map((message) => message.id))
  const streamMessages = chat.messages.filter(
    (message) => !savedIds.has(message.id)
  )
  const visible = [
    ...current.messages.map((message) => ({
      id: message.id,
      role: message.role,
      content: message.content,
      source: message.source,
    })),
    ...streamMessages.map((message) => ({
      id: message.id,
      role: message.role,
      content: message.parts
        .filter((part) => part.type === "text")
        .map((part) => part.content)
        .join(""),
      source: message.role === "user" ? "customer" : provider || "generating",
    })),
  ]
  useEffect(() => {
    if (mode === "text")
      end.current?.scrollIntoView({ behavior: "smooth", block: "end" })
  }, [visible.length, chat.isLoading, mode])
  useEffect(
    () => () => {
      audioRef.current?.pause()
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current)
    },
    []
  )
  async function speak(messageId: string) {
    setError("")
    setSpeaking(true)
    try {
      audioRef.current?.pause()
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current)
      const response = await fetch(`/api/cases/${current.id}/speech`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId, language }),
      })
      if (!response.ok) throw new Error((await response.json()).error)
      objectUrl.current = URL.createObjectURL(await response.blob())
      audioRef.current = new Audio(objectUrl.current)
      audioRef.current.onended = () => setSpeaking(false)
      audioRef.current.onerror = () => {
        setSpeaking(false)
        setError("Audio playback failed.")
      }
      await audioRef.current.play()
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Speech request failed."
      )
      setSpeaking(false)
    }
  }
  const busy = chat.isLoading || action.isPending || supportMessage.isPending
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <main className="flex min-w-0 flex-col">
        <section className="mx-auto flex w-full max-w-3xl flex-wrap items-center justify-between gap-4 px-5 py-6 md:px-8">
          <div>
            <h1 className="text-xl font-semibold">{current.merchant}</h1>
            <p className="text-sm text-muted-foreground">
              ₹{current.amount.toLocaleString("en-IN")} ·{" "}
              {current.transactionId}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" role="status" aria-live="polite">
              {statusLabel[current.status]}
            </Badge>
            <Sheet>
              <SheetTrigger
                render={
                  <Button
                    variant="ghost"
                    className="h-11 px-3"
                    aria-label="Case details"
                  />
                }
              >
                <RiInformationLine />
                Details
              </SheetTrigger>
              <SheetContent className="w-full overflow-y-auto sm:max-w-md">
                <SheetHeader>
                  <SheetTitle>Case details</SheetTitle>
                  <SheetDescription>
                    Demo · {current.merchant} · ₹
                    {current.amount.toLocaleString("en-IN")}
                  </SheetDescription>
                </SheetHeader>
                <div className="space-y-6 px-4 pb-6">
                  <EvidencePanel item={current} />
                  <Accordion>
                    <AccordionItem value="settings">
                      <AccordionTrigger>Voice & connection</AccordionTrigger>
                      <AccordionContent className="space-y-3">
                        <p className="text-sm text-muted-foreground">
                          {bootstrap.data?.mode === "sarvam"
                            ? "Sarvam-105B · live text"
                            : "Text · simulation mode"}
                          <br />
                          Saaras v4 · voice input
                          <br />
                          Bulbul v4 Flash · playback
                        </p>
                        <Button
                          variant="outline"
                          className="h-11"
                          onClick={() =>
                            setLanguage((value) =>
                              value === "en-IN" ? "hi-IN" : "en-IN"
                            )
                          }
                        >
                          Playback voice:{" "}
                          {language === "en-IN" ? "English" : "Hindi"}
                        </Button>
                        {duration !== undefined && (
                          <p className="text-xs text-muted-foreground">
                            Last response: {(duration / 1000).toFixed(1)}{" "}
                            seconds
                          </p>
                        )}
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </section>
        <Tabs
          value={mode}
          onValueChange={(value) => {
            setMode(String(value))
            audioRef.current?.pause()
            setSpeaking(false)
          }}
        >
          <TabsList className="mx-auto h-11" aria-label="Conversation mode">
            <TabsTrigger value="text" className="px-6">
              Text
            </TabsTrigger>
            <TabsTrigger value="voice" className="px-6" disabled={busy}>
              Voice
            </TabsTrigger>
          </TabsList>
          <TabsContent value="text">
            <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-5 px-5 py-6 md:px-8">
              {visible.map((message, index) => (
                <div
                  key={message.id}
                  className={`flex flex-col gap-1.5 ${message.role === "user" ? "items-end" : "items-start"}`}
                >
                  {(index === 0 ||
                    visible[index - 1].role !== message.role ||
                    (visible[index - 1].source === "support") !==
                      (message.source === "support")) && (
                    <span className="text-xs font-medium text-muted-foreground">
                      {message.role === "user"
                        ? "You"
                        : message.source === "support"
                          ? "Support officer"
                          : "Sahay"}
                    </span>
                  )}
                  <Card
                    className={`max-w-[95%] py-0 shadow-none ${message.role === "user" ? "bg-secondary" : "border-0 bg-transparent"}`}
                  >
                    <CardContent className="px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap">
                      {(message.role === "assistant"
                        ? responseText(message.content)
                        : message.content) || "Checking the case…"}
                    </CardContent>
                  </Card>
                  {message.role === "assistant" &&
                    savedIds.has(message.id) &&
                    message.id ===
                      current.messages
                        .filter((value) => value.role === "assistant")
                        .at(-1)?.id &&
                    bootstrap.data?.sarvam && (
                      <Button
                        className="h-11 px-3"
                        variant="ghost"
                        disabled={speaking}
                        onClick={() => void speak(message.id)}
                      >
                        <RiVolumeUpLine />
                        Listen
                      </Button>
                    )}
                </div>
              ))}
              {chat.isLoading && (
                <p role="status" className="text-xs text-muted-foreground">
                  Sahay is checking…
                </p>
              )}
              <div ref={end} />
            </div>
            <div className="sticky bottom-0 bg-background px-5 py-4 md:px-8">
              <div className="mx-auto flex max-w-3xl flex-col gap-3">
                {(error ||
                  action.error ||
                  chat.error ||
                  supportMessage.error) && (
                  <Alert variant="destructive">
                    <AlertDescription>
                      {error ||
                        action.error?.message ||
                        chat.error?.message ||
                        supportMessage.error?.message}
                    </AlertDescription>
                  </Alert>
                )}
                {current.status === "open" && (
                  <Button
                    className="h-11 w-fit"
                    disabled={busy}
                    onClick={() => action.mutate("investigate")}
                  >
                    <RiSearchLine />
                    Investigate payment
                  </Button>
                )}
                <form
                  onSubmit={(event) => {
                    event.preventDefault()
                    if (!draft.trim() || busy) return
                    const text = draft.trim()
                    if (current.status === "human_owned") {
                      supportMessage.mutate(text)
                      return
                    }
                    setDraft("")
                    void chat
                      .sendMessage(text)
                      .catch(() => setError("Unable to send message."))
                  }}
                  className="flex items-end gap-2"
                >
                  <Textarea
                    aria-label={
                      current.status === "human_owned"
                        ? "Message support officer"
                        : "Message Sahay"
                    }
                    placeholder={
                      current.status === "human_owned"
                        ? "Message your support officer…"
                        : "Message Sahay in your language…"
                    }
                    value={draft}
                    maxLength={4000}
                    onChange={(event) => setDraft(event.target.value)}
                    rows={2}
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
                    disabled={busy}
                  />
                  <Button
                    aria-label="Send message"
                    className="size-11"
                    type="submit"
                    disabled={busy || !draft.trim()}
                  >
                    <RiArrowUpLine />
                  </Button>
                </form>
                <div className="flex flex-wrap items-center gap-2">
                  {!bootstrap.data?.voice && (
                    <VoiceNote
                      caseId={current.id}
                      disabled={busy}
                      onTranscript={(text) => setDraft(text)}
                    />
                  )}
                  {speaking && (
                    <Button
                      size="xs"
                      variant="outline"
                      onClick={() => {
                        audioRef.current?.pause()
                        setSpeaking(false)
                      }}
                    >
                      Stop audio
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </TabsContent>
          <TabsContent value="voice">
            {mode === "voice" &&
              (bootstrap.data?.voice ? (
                <ManagedVoice
                  caseId={current.id}
                  disabled={busy}
                  onUpdate={refresh}
                />
              ) : (
                <p className="p-8 text-center text-muted-foreground">
                  Voice calls are not configured.
                </p>
              ))}
          </TabsContent>
        </Tabs>
      </main>
    </div>
  )
}
