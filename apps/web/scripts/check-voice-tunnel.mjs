import { readFile } from 'node:fs/promises'
import { parse } from 'dotenv'
const env = parse(await readFile(new URL('../../../.env', import.meta.url)))
const base = process.argv[2]
if (!base?.startsWith('https://') || !env.VOICE_TOOL_SECRET) throw new Error('Tunnel URL and voice secret are required.')
const local = 'http://127.0.0.1:3000'
const bootstrap = await fetch(`${local}/api/bootstrap`)
const cookie = bootstrap.headers.get('set-cookie').split(';')[0]
async function localCall(path, data, suppliedCookie = cookie) {
 const response = await fetch(`${local}/api/${path}`, { method: data === undefined ? 'GET' : 'POST', headers: { cookie: suppliedCookie, origin: local, 'Content-Type': 'application/json' }, body: data === undefined ? undefined : JSON.stringify(data), signal: AbortSignal.timeout(20000) })
 if (!response.ok) throw new Error(`Local endpoint failed: ${response.status}`)
 return response
}
const item = await (await localCall('chats', { scenarioId: 'failed-recharge' })).json()
try {
 for (const tool of ['context', 'investigate']) {
  const response = await fetch(`${base}/api/voice-tools/${tool}`, { method: 'POST', headers: { Authorization: `Bearer ${env.VOICE_TOOL_SECRET}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ caseId: item.id }), signal: AbortSignal.timeout(20000) })
  const result = await response.json()
  console.log(JSON.stringify({ check: tool, status: response.status, validCase: result.caseId === item.id }))
  if (!response.ok || result.caseId !== item.id) throw new Error('Authenticated tunnel call failed.')
  const factsMatch = result.transactionId === item.transactionId && result.amount === item.amount && result.currency === 'INR' && result.merchant === item.merchant
  console.log(JSON.stringify({ check: `${tool} payment facts`, factsMatch }))
  if (!factsMatch) throw new Error('Voice tool payment facts do not match the selected case.')
 }
 const denied = await fetch(`${base}/api/voice-tools/context`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ caseId: item.id }), signal: AbortSignal.timeout(20000) })
 const admin = await fetch(`${base}/api/admin/cases`, { signal: AbortSignal.timeout(20000) })
 const root = await fetch(base, { signal: AbortSignal.timeout(20000) })
 console.log(JSON.stringify({ check: 'access restrictions', unauthenticated: denied.status, admin: admin.status, app: root.status }))
 if (denied.status !== 403 || admin.status !== 404 || root.status !== 404) throw new Error('Tunnel restriction check failed.')
} finally {
 const admin = await localCall('admin/session')
 const adminCookie = admin.headers.get('set-cookie').split(';')[0]
 await localCall('admin/unlock', { code: env.TEAM_ACCESS_CODE || 'sahay-finals' }, adminCookie)
 await localCall(`admin/cases/${item.id}/reset`, {}, adminCookie)
 console.log('Disposable tunnel test case removed.')
}
