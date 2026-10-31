export function responseText(content: string): string {
  return content
    .replace(" All payment systems and policies in this demo are simulated.", "")
    .replace(/^Simulation mode:\s*/i, "")
    .replace(/\bsimulated\s+/gi, "")
}
