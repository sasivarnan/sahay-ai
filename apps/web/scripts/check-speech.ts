import { config } from "dotenv"
import { resolve } from "node:path"
config({ path: resolve(process.cwd(), "../../.env"), quiet: true })
const { synthesize, transcribe } = await import("../src/server/sarvam")
try {
  const audio = await synthesize(
    "My payment of six hundred and fifty rupees failed.",
    "en-IN"
  )
  console.log(
    JSON.stringify({
      check: "Bulbul v4 Flash",
      ok: audio.length > 100,
      audioBytes: audio.length,
    })
  )
  const result = await transcribe(
    new File([audio], "speech.wav", { type: "audio/wav" })
  )
  console.log(
    JSON.stringify({
      check: "Saaras v4",
      ok: Boolean(result.text?.trim()),
      language: result.language,
      transcriptCharacters: result.text?.length,
    })
  )
  if (!result.text?.trim()) process.exitCode = 1
} catch (error) {
  console.log(
    JSON.stringify({
      check: "speech",
      ok: false,
      errorType: error instanceof Error ? error.name : "unknown",
      status: (error as { statusCode?: number }).statusCode,
    })
  )
  process.exitCode = 1
}
