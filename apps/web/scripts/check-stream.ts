import { config } from "dotenv"
import { resolve } from "node:path"
config({ path: resolve(process.cwd(), "../../.env"), quiet: true })
for (const version of ["v1", "v2"]) {
  const response = await fetch(
    `https://api.sarvam.ai/${version}/chat/completions`,
    {
      method: "POST",
      headers: {
        "api-subscription-key": process.env.SARVAM_API_KEY!,
        "Content-Type": "application/json",
        Accept: "text/event-stream",
      },
      body: JSON.stringify({
        model: "sarvam-105b",
        messages: [{ role: "user", content: "Reply with ready." }],
        stream: true,
        max_tokens: 20,
      }),
      signal: AbortSignal.timeout(30000),
    }
  )
  const body = await response.text()
  let jsonKeys: string[] = []
  try {
    jsonKeys = Object.keys(JSON.parse(body))
  } catch {}
  console.log(
    JSON.stringify({
      version,
      status: response.status,
      contentType: response.headers.get("content-type"),
      characters: body.length,
      hasDataLines: /^data:/m.test(body),
      jsonKeys,
      prefix: body.slice(0, 180),
    })
  )
}
