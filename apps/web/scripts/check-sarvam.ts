import { config } from "dotenv"
import { resolve } from "node:path"
import { SarvamAIClient } from "sarvamai"
config({ path: resolve(process.cwd(), "../../.env"), quiet: true })
const key = process.env.SARVAM_API_KEY
if (!key) throw new Error("SARVAM_API_KEY is not configured.")
const client = new SarvamAIClient({ apiSubscriptionKey: key })
try {
  const stream = await client.chat.completions(
    {
      model: "sarvam-105b",
      stream: true,
      max_tokens: 1000,
      reasoning_effort: "low",
      messages: [
        { role: "user", content: "Reply with the single word ready." },
      ],
    },
    { timeoutInSeconds: 30, maxRetries: 0 }
  )
  let text = ""
  let chunks = 0
  let reasoning = 0
  for await (const chunk of stream) {
    chunks++
    text += chunk.choices[0]?.delta?.content ?? ""
    reasoning += chunk.choices[0]?.delta?.reasoning_content?.length ?? 0
  }
  console.log(
    JSON.stringify({
      check: "Sarvam streaming",
      ok: Boolean(text.trim()),
      characters: text.length,
      chunks,
      reasoning,
    })
  )
  if (!text.trim()) process.exitCode = 1
} catch (error) {
  console.log(
    JSON.stringify({
      check: "Sarvam streaming",
      ok: false,
      errorType: error instanceof Error ? error.name : "unknown",
      status: (error as { statusCode?: number }).statusCode,
    })
  )
  process.exitCode = 1
}
