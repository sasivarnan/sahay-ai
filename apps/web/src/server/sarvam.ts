import { SarvamAIClient } from "sarvamai"
import { DomainError } from "../domain/service"
export function sarvamClient() {
  const key = process.env.SARVAM_API_KEY
  if (!key)
    throw new DomainError(
      503,
      "Sarvam is not configured. Use explicit simulation mode."
    )
  return new SarvamAIClient({ apiSubscriptionKey: key })
}
export async function synthesize(text: string, language: "en-IN" | "hi-IN") {
  const result = await sarvamClient().textToSpeech.convert(
    {
      text: text.slice(0, 2400),
      model: "bulbul:v4-flash",
      language_code: language,
      speaker: language === "hi-IN" ? "ritu_hi_customer" : "simran_en_customer",
      speech_sample_rate: 24000,
    },
    { timeoutInSeconds: 30, maxRetries: 0 }
  )
  const audio = result.audios?.[0]
  if (!audio) throw new DomainError(502, "Sarvam did not return audio.")
  return new Uint8Array(Buffer.from(audio, "base64"))
}

export async function transcribe(file: File) {
  if (file.size > 5_000_000 || file.size === 0)
    throw new DomainError(400, "Use a non-empty recording smaller than 5 MB.")
  const result = await sarvamClient().speechToText.transcribe(
    { file, model: "saaras:v4", mode: "transcribe", language_code: "unknown" },
    { timeoutInSeconds: 30, maxRetries: 0 }
  )
  return {
    text: result.transcript,
    language: result.language_code,
    model: "saaras:v4",
  }
}
