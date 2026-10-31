import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { createVoiceTunnelProxy } from './voice-tunnel-proxy.mjs'
let backend
let proxy
let base
const caseId = '00000000-0000-4000-8000-000000000001'
let calls = 0
before(async () => {
  backend = createServer((request, response) => {
    calls++
    assert.equal(request.headers.authorization, 'Bearer test-only-value')
    assert.equal(request.headers.cookie, undefined)
    response.writeHead(200, { 'Content-Type': 'application/json' })
    response.end(JSON.stringify({ ok: true }))
  })
  await new Promise(resolve => backend.listen(0, '127.0.0.1', resolve))
  proxy = createVoiceTunnelProxy(`http://127.0.0.1:${backend.address().port}`)
  await new Promise(resolve => proxy.listen(0, '127.0.0.1', resolve))
  base = `http://127.0.0.1:${proxy.address().port}`
})
after(async () => { await Promise.all([new Promise(resolve => proxy.close(resolve)), new Promise(resolve => backend.close(resolve))]) })
const post = (path, body = { caseId }, headers = {}) => fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-only-value', ...headers }, body: JSON.stringify(body) })
test('forwards only the two exact authenticated POST tools', async () => {
  for (const path of ['/api/voice-tools/context', '/api/voice-tools/investigate']) {
    assert.equal((await post(path, { caseId }, { Cookie: 'must-not-be-forwarded=1' })).status, 200)
  }
  assert.equal(calls, 2)
})
test('denies app, admin, case, query, and method paths', async () => {
  for (const path of ['/', '/admin', '/api/admin/cases', '/api/cases/123', '/api/voice-tools/context?extra=1', '/api/voice-tools/context/', '/api/voice-tools/unknown']) assert.equal((await post(path)).status, 404)
  assert.equal((await fetch(base + '/api/voice-tools/context')).status, 404)
  assert.equal(calls, 2)
})
test('denies missing bearer auth, invalid payload, content type, and oversized bodies', async () => {
  assert.equal((await post('/api/voice-tools/context', { caseId }, { Authorization: '' })).status, 403)
  assert.equal((await post('/api/voice-tools/context', { caseId: 'invalid' })).status, 400)
  assert.equal((await post('/api/voice-tools/context', { caseId, extra: true })).status, 400)
  assert.equal((await post('/api/voice-tools/context', { caseId }, { 'Content-Type': 'text/plain' })).status, 415)
  assert.equal((await post('/api/voice-tools/context', { caseId, large: 'x'.repeat(20000) })).status, 413)
  assert.equal(calls, 2)
})
