import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { RiMicLine, RiStopLine } from "@remixicon/react"
export function VoiceNote({
  caseId,
  disabled,
  onTranscript,
}: {
  caseId: string
  disabled: boolean
  onTranscript: (text: string) => void
}) {
  const recording = useRef<MediaRecorder | null>(null)
  const input = useRef<MediaStream | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [state, setState] = useState<"idle" | "recording" | "transcribing">(
    "idle"
  )
  const [error, setError] = useState("")
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
      if (recording.current?.state === "recording") {
        recording.current.onstop = null
        recording.current.stop()
      }
      input.current?.getTracks().forEach((track) => track.stop())
    },
    []
  )
  async function start() {
    setError("")
    try {
      input.current = await navigator.mediaDevices.getUserMedia({ audio: true })
      const preferred = [
        "audio/webm;codecs=opus",
        "audio/mp4",
        "audio/webm",
      ].find((type) => MediaRecorder.isTypeSupported(type))
      const recorder = new MediaRecorder(
        input.current,
        preferred ? { mimeType: preferred } : undefined
      )
      recording.current = recorder
      const chunks: Blob[] = []
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data)
      }
      recorder.onstop = () => {
        void (async () => {
          if (timer.current) clearTimeout(timer.current)
          input.current?.getTracks().forEach((track) => track.stop())
          setState("transcribing")
          try {
            const extension = recorder.mimeType.includes("mp4") ? "mp4" : "webm"
            const data = new FormData()
            data.set("caseId", caseId)
            data.set(
              "audio",
              new Blob(chunks, { type: recorder.mimeType }),
              `voice.${extension}`
            )
            const response = await fetch("/api/transcribe", {
              method: "POST",
              body: data,
            })
            const result = await response.json()
            if (!response.ok)
              throw new Error(result.error ?? "Transcription failed.")
            if (!result.text?.trim())
              throw new Error("No speech detected. Try again.")
            onTranscript(result.text)
          } catch (cause) {
            setError(
              cause instanceof Error ? cause.message : "Unable to transcribe."
            )
          } finally {
            setState("idle")
          }
        })()
      }
      recorder.start()
      setState("recording")
      timer.current = setTimeout(() => {
        if (recorder.state === "recording") recorder.stop()
      }, 25000)
    } catch {
      input.current?.getTracks().forEach((track) => track.stop())
      setState("idle")
      setError("Microphone access failed. You can type your message instead.")
    }
  }
  return (
    <>
      <Button
        className="h-11"
        variant="ghost"
        disabled={disabled || state === "transcribing"}
        onClick={() => {
          if (state === "recording") recording.current?.stop()
          else void start()
        }}
      >
        {state === "recording" ? <RiStopLine /> : <RiMicLine />}
        {state === "recording"
          ? "Stop recording"
          : state === "transcribing"
            ? "Transcribing…"
            : "Voice message"}
      </Button>
      {error && (
        <span role="alert" className="text-xs text-destructive">
          {error}
        </span>
      )}
    </>
  )
}
