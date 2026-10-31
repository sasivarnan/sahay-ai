import { createServer } from 'node:http'
import { pathToFileURL } from 'node:url'

export const allowedPaths = new Set([
  '/api/voice-tools/context',
  '/api/voice-tools/investigate',
])
const maximumBodyBytes = 16 * 1024

export function createVoiceTunnelProxy(upstream = 'http://127.0.0.1:3000') {
  const server = createServer((request, response) => {
    const reply = (status, error) => {
      if (response.headersSent) return
      response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
      response.end(JSON.stringify({ error }))
    }
    if (request.method !== 'POST' || !allowedPaths.has(request.url ?? '')) {
      reply(404, 'Endpoint not available.')
      request.resume()
      return
    }
    const authorization = request.headers.authorization
    if (typeof authorization !== 'string' || !/^Bearer \S+$/.test(authorization)) {
      reply(403, 'Voice tool access denied.')
      request.resume()
      return
    }
    if (request.headers['content-type']?.split(';')[0].trim().toLowerCase() !== 'application/json') {
      reply(415, 'Use application/json.')
      request.resume()
      return
    }
    if (Number(request.headers['content-length']) > maximumBodyBytes) {
      reply(413, 'Request body is too large.')
      request.resume()
      return
    }
    const chunks = []
    let bytes = 0
    let rejected = false
    request.on('data', chunk => {
      bytes += chunk.length
      if (bytes > maximumBodyBytes) {
        rejected = true
        chunks.length = 0
        reply(413, 'Request body is too large.')
      } else if (!rejected) chunks.push(chunk)
    })
    request.on('error', () => reply(400, 'Invalid request body.'))
    request.on('end', () => {
      if (rejected) return
      void (async () => {
        try {
          const payload = JSON.parse(Buffer.concat(chunks).toString('utf8'))
          if (!payload || Array.isArray(payload) || typeof payload !== 'object' || typeof payload.caseId !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(payload.caseId) || Object.keys(payload).some(key => key !== 'caseId')) {
            reply(400, 'Send only a valid caseId.')
            return
          }
          const result = await fetch(new URL(request.url, upstream), {
            method: 'POST',
            headers: { Authorization: authorization, 'Content-Type': 'application/json' },
            body: JSON.stringify({ caseId: payload.caseId }),
            signal: AbortSignal.timeout(15000),
            redirect: 'manual',
          })
          if (result.status >= 300 && result.status < 400) {
            reply(502, 'Upstream redirects are not permitted.')
            return
          }
          const body = await result.text()
          if (Buffer.byteLength(body) > 65536) {
            reply(502, 'Upstream response is too large.')
            return
          }
          response.writeHead(result.status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
          response.end(body)
        } catch (error) {
          reply(error instanceof SyntaxError ? 400 : 502, error instanceof SyntaxError ? 'Invalid JSON body.' : 'Voice backend is unavailable.')
        }
      })()
    })
  })
  server.requestTimeout = 20000
  server.headersTimeout = 10000
  return server
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const server = createVoiceTunnelProxy()
  server.listen(8788, '127.0.0.1', () => console.log('Voice tool proxy listening on http://127.0.0.1:8788. Only the two POST voice tools are exposed.'))
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)))
}
