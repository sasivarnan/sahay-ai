import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { api } from "@/lib/api"
import { releaseVoiceSession } from "@/lib/voice-session"
import { RiMicLine, RiMicOffLine, RiStopLine } from "@remixicon/react"
import type { ConversationAgent } from "sarvam-conv-ai-sdk/browser"

const stateLabels: Record<string, string> = {
  idle: "Speak in your language",
  connecting: "Connecting to Aparna…",
  connected: "Aparna is getting ready…",
  listening: "Listening to you",
  speaking: "Aparna is speaking",
  stopping: "Ending call…",
  error: "Voice connection interrupted",
}

export function ManagedVoice({
  caseId,
  disabled,
  onUpdate,
}: {
  caseId: string
  disabled: boolean
  onUpdate: () => void
}) {
  const agent = useRef<ConversationAgent | null>(null)
  const mounted = useRef(false)
  const attempt = useRef(0)
  const starting = useRef(false)
  const [state, setState] = useState("idle")
  const [muted, setMuted] = useState(false)
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [error, setError] = useState("")

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      attempt.current += 1
      const session = agent.current
      agent.current = null
      void session?.stop().catch(() => {})
    }
  }, [])

  useEffect(() => {
    if (startedAt === null) return
    const timer = setInterval(
      () => setElapsed(Math.floor((Date.now() - startedAt) / 1000)),
      1000
    )
    return () => clearInterval(timer)
  }, [startedAt])

  async function stop() {
    attempt.current += 1
    starting.current = false
    const session = agent.current
    agent.current = null
    setState("stopping")
    try {
      await session?.stop()
    } catch {
      if (mounted.current)
        setError(
          "Could not close the voice connection. Please reload this page."
        )
    } finally {
      if (mounted.current) {
        setState("idle")
        setMuted(false)
        setStartedAt(null)
        onUpdate()
      }
    }
  }

  async function start() {
    if (starting.current || agent.current) return
    starting.current = true
    const currentAttempt = ++attempt.current
    const isCurrent = () =>
      mounted.current && attempt.current === currentAttempt
    let session: ConversationAgent | null = null
    setError("")
    setMuted(false)
    setElapsed(0)
    setStartedAt(null)
    setState("connecting")
    try {
      const config = await api<{
        appId: string
        orgId: string
        workspaceId: string
      }>("voice/config")
      const sdk = await import("sarvam-conv-ai-sdk/browser")
      if (!isCurrent()) return
      session = new sdk.ConversationAgent({
        apiKey: "",
        customHeaders: { "X-Sahay-Case": caseId },
        baseUrl: `${window.location.origin}/api/voice/proxy/`,
        config: {
          org_id: config.orgId,
          workspace_id: config.workspaceId,
          app_id: config.appId,
          user_identifier: caseId,
          user_identifier_type: "custom",
          interaction_type: sdk.InteractionType.CALL,
          input_sample_rate: 16000,
          output_sample_rate: 16000,
          agent_variables: { case_reference_number: caseId },
        },
        audioInterface: new sdk.BrowserAudioInterface(),
        stateCallback: (value) => {
          if (!isCurrent()) return
          setState(value)
          if (["connected", "listening", "speaking"].includes(value)) {
            setStartedAt((previous) => previous ?? Date.now())
          }
          if (value === "error") {
            setError(
              "Voice connection interrupted. End this call and try again."
            )
            setStartedAt(null)
            void stop()
          }
        },
        endCallback: async () => {
          if (!session) return
          try {
            if (!(await releaseVoiceSession(agent, session))) return
          } catch {
            if (isCurrent())
              setError(
                "Could not release the microphone. Please reload this page."
              )
          }
          if (!isCurrent()) return
          setState("idle")
          setMuted(false)
          setStartedAt(null)
          onUpdate()
        },
      })
      agent.current = session
      await session.start()
      if (!isCurrent()) {
        await session.stop()
        return
      }
      if (!(await session.waitForConnect(15)))
        throw new Error("Voice connection timed out. Please try again.")
    } catch (cause) {
      if (isCurrent()) {
        agent.current = null
        setState("idle")
        setStartedAt(null)
        setError(
          cause instanceof Error && cause.name === "NotAllowedError"
            ? "Microphone access is blocked. Allow it in your browser and try again."
            : cause instanceof Error
              ? cause.message
              : "Voice failed to start. Please try again."
        )
      }
      await session?.stop().catch(() => {})
    } finally {
      if (isCurrent()) starting.current = false
    }
  }

  const active = state !== "idle" || agent.current !== null
  const connected = ["connected", "listening", "speaking"].includes(state)
  const speaking = state === "speaking"
  const duration = `${Math.floor(elapsed / 60)
    .toString()
    .padStart(2, "0")}:${(elapsed % 60).toString().padStart(2, "0")}`
  const label =
    muted && connected && !speaking
      ? "Microphone muted"
      : (stateLabels[state] ?? "Voice call in progress")

  return (
    <section
      className="flex min-h-[55vh] flex-col items-center justify-center gap-7 px-6 py-12"
      aria-label="Voice conversation"
    >
      <Avatar
        className={`size-40 shadow-xl ring-8 transition-all duration-500 ${speaking ? "ring-primary/30 motion-safe:animate-pulse" : connected && !muted ? "ring-primary/20" : "ring-primary/10"}`}
        aria-hidden="true"
      >
        <AvatarFallback className="bg-radial from-primary/60 to-primary text-primary-foreground">
          {muted ? (
            <RiMicOffLine className="size-12" />
          ) : (
            <RiMicLine className="size-12" />
          )}
        </AvatarFallback>
      </Avatar>
      <div className="space-y-2 text-center">
        <h2 className="text-xl font-semibold">Talk to Aparna</h2>
        <p
          role="status"
          aria-live="polite"
          className="text-sm text-muted-foreground"
        >
          {label}
        </p>
        <p
          className="h-5 text-xs text-muted-foreground tabular-nums"
          aria-label={`Call duration ${duration}`}
        >
          {duration}
        </p>
      </div>
      <div className="flex items-center gap-3">
        <Button
          variant="outline"
          className="h-11 px-4"
          disabled={!connected}
          aria-label={muted ? "Unmute microphone" : "Mute microphone"}
          aria-pressed={muted}
          onClick={() => {
            if (!agent.current) return
            if (muted) agent.current.unmute()
            else agent.current.mute()
            setMuted(!muted)
          }}
        >
          {muted ? <RiMicOffLine /> : <RiMicLine />}
          {muted ? "Unmute" : "Mute"}
        </Button>
        <Button
          className="h-11 px-6"
          variant={active ? "destructive" : "default"}
          disabled={(!active && disabled) || state === "stopping"}
          onClick={() => void (active ? stop() : start())}
        >
          {active ? <RiStopLine /> : <RiMicLine />}
          {state === "connecting"
            ? "Cancel"
            : active
              ? "End call"
              : "Start voice call"}
        </Button>
      </div>
      {error && (
        <Alert variant="destructive" className="max-w-md">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </section>
  )
}
