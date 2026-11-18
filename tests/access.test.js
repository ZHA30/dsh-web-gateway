import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer, request } from 'node:http'
import { once } from 'node:events'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createAuth, AUTH_HEADER } from '../src/host/auth.js'
import { listenProxy } from '../src/host/proxy.js'
import { startTunnel } from '../src/host/cloudflare.js'

const basic = value => `Basic ${Buffer.from(value).toString('base64')}`
const policy = { mode: 'basic', username: 'admin', passwordRef: 'PASSWORD' }
function authentication(resolve = async () => ({ value: 'secret' })) {
  let provider
  const ctx = { get: () => ctx['connection.authentication'], credentials: { resolve }, connection: { createPeer: () => ({ dispose: async () => {} }) },
    'connection.authentication': { register(value) { provider = value; return async () => { provider = undefined } } } }
  return { auth: createAuth(ctx, policy, () => {}), provider: () => provider }
}

test('Basic requires the password and strips external identity before adding a private bridge', async t => {
  const { auth, provider } = authentication()
  t.after(() => auth.close())
  await auth.update(policy, true)
  for (const authorization of [undefined, basic('admin:wrong'), basic('other:secret'), 'Bearer token']) {
    assert.equal(await auth.headers({ headers: { authorization, [AUTH_HEADER]: 'forged' } }), undefined)
  }
  const headers = await auth.headers({ headers: { authorization: basic('admin:secret'), [AUTH_HEADER]: 'forged' } })
  assert.equal(headers.authorization, undefined)
  assert.notEqual(headers[AUTH_HEADER], 'forged')
  assert.ok(provider().authenticate({ headers }))
  assert.equal(provider().authenticate({ headers: { [AUTH_HEADER]: 'forged' } }), undefined)
  await auth.update({ ...policy, mode: 'native' }, true)
  assert.equal(provider(), undefined)
  assert.deepEqual(await auth.headers({ headers: { authorization: 'Bearer native', [AUTH_HEADER]: 'forged' } }), { authorization: 'Bearer native' })
})

test('password revocation rejects a credential lookup already in flight', async t => {
  let release
  const { auth } = authentication(() => new Promise(resolve => { release = resolve }))
  t.after(() => auth.close())
  await auth.update(policy, true)
  const pending = auth.headers({ headers: { authorization: basic('admin:secret') } })
  auth.revoke()
  release({ value: 'secret' })
  assert.equal(await pending, undefined)
})

async function mounted(t) {
  const upstream = createServer((req, res) => {
    if (req.url === '/stream') { res.writeHead(200, { 'content-type': 'text/event-stream' }); res.flushHeaders(); res.write('data: one\n\n'); return }
    let body = ''
    req.on('data', chunk => { body += chunk })
    req.on('end', () => { res.setHeader('set-cookie', ['a=1', 'b=2']); res.end(JSON.stringify({ headers: req.headers, body, url: req.url })) })
  })
  upstream.on('upgrade', (req, socket, head) => {
    socket.on('error', () => {})
    socket.write('HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n')
    if (head.length) socket.write(head)
    socket.pipe(socket)
  })
  upstream.listen(0, '127.0.0.1')
  await once(upstream, 'listening')
  const origin = `http://127.0.0.1:${upstream.address().port}`
  const { auth } = authentication()
  await auth.update(policy, true)
  let proxy
  proxy = await listenProxy({ host: '127.0.0.1', port: 0, upstreamOrigin: origin, auth, origins: () => [proxy?.url, 'https://active.trycloudflare.com'] })
  t.after(async () => { await proxy.close(); await auth.close(); upstream.closeAllConnections(); await new Promise(resolve => upstream.close(resolve)) })
  return { proxy, origin }
}
function call(url, headers = {}, body) {
  return new Promise((resolve, reject) => {
    const exchange = request(url, { method: body === undefined ? 'GET' : 'POST', headers }, response => {
      let text = ''
      response.on('data', chunk => { text += chunk })
      response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, text }))
    })
    exchange.on('error', reject)
    exchange.end(body)
  })
}

test('proxy preserves request bodies and cookies, enforces external sources, rewrites only admitted origins', async t => {
  const { proxy, origin } = await mounted(t)
  const authorization = basic('admin:secret')
  for (const headers of [{ host: 'evil.example' }, { origin: 'null' }, { origin: 'https://evil.example' }, { 'sec-fetch-site': 'cross-site' }, { host: 'other.trycloudflare.com' }]) {
    assert.equal((await call(proxy.url, { authorization, ...headers })).status, 403)
  }
  const navigation = { 'sec-fetch-site': 'cross-site', 'sec-fetch-mode': 'navigate', 'sec-fetch-dest': 'document' }
  assert.equal((await call(proxy.url, { authorization, ...navigation })).status, 200)
  assert.equal((await call(proxy.url, { ...navigation })).status, 401)
  assert.equal((await call(proxy.url, { authorization, ...navigation }, 'payload')).status, 403)
  assert.equal((await call(proxy.url, { authorization, ...navigation, origin: 'https://evil.example' })).status, 403)
  assert.equal((await call(proxy.url, { [AUTH_HEADER]: 'forged', cookie: 'native=token' })).status, 401)
  const response = await call(`${proxy.url}/echo?q=1`, { authorization, origin: proxy.url, 'x-forwarded-host': 'evil.example' }, 'payload')
  assert.equal(response.status, 200)
  const value = JSON.parse(response.text)
  assert.equal(value.headers.host, new URL(origin).host)
  assert.equal(value.headers.origin, origin)
  assert.equal(value.headers.authorization, undefined)
  assert.equal(value.headers['x-forwarded-host'], undefined)
  assert.equal(value.body, 'payload')
  assert.equal(value.url, '/echo?q=1')
  assert.deepEqual(response.headers['set-cookie'], ['a=1', 'b=2'])
  assert.equal((await call(proxy.url, { authorization, host: 'active.trycloudflare.com', origin: 'https://active.trycloudflare.com' })).status, 200)
})

test('streaming response arrives without waiting for end and cancellation releases upstream', async t => {
  const { proxy } = await mounted(t)
  await new Promise((resolve, reject) => {
    const exchange = request(`${proxy.url}/stream`, { headers: { authorization: basic('admin:secret') } }, response => {
      response.once('data', chunk => { assert.equal(chunk.toString(), 'data: one\n\n'); response.destroy(); resolve() })
    })
    exchange.on('error', reject)
    exchange.end()
  })
})

test('Upgrade forwards data in both directions and close releases upgraded sockets', async t => {
  const { proxy } = await mounted(t)
  await new Promise((resolve, reject) => {
    const exchange = request(proxy.url, { headers: { authorization: basic('admin:secret'), connection: 'Upgrade', upgrade: 'websocket', origin: proxy.url } })
    exchange.on('error', reject)
    exchange.on('upgrade', (_response, socket) => {
      socket.once('data', chunk => { assert.equal(chunk.toString(), 'ping'); socket.destroy(); resolve() })
      socket.on('error', reject)
      socket.write('ping')
    })
    exchange.end()
  })
})

async function fake(t, source) {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-cf-test-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const executable = join(directory, 'cloudflared')
  await writeFile(executable, `#!/usr/bin/env node\n${source}\n`, { mode: 0o700 })
  return { executable, mode: 'quick', startupTimeoutMs: 5000 }
}

test('Quick waits for a connected tunnel, parses split URL and stops its process', async t => {
  const config = await fake(t, `process.stderr.write('https://split.trycloud'); setTimeout(() => { process.stderr.write('flare.com\\nRegistered tunnel connection\\n') }, 20); setInterval(() => {}, 1000)`)
  const controller = new AbortController()
  const tunnel = await startTunnel(config, 'http://127.0.0.1:18431', undefined, controller.signal, () => assert.fail('intentional stop must not report a crash'))
  t.after(() => tunnel.stop())
  assert.equal(tunnel.url, 'https://split.trycloudflare.com')
  await tunnel.stop()
})

test('Quick URL alone is not readiness and startup timeout cleans up', async t => {
  const config = await fake(t, `console.error('https://pending.trycloudflare.com'); setInterval(() => {}, 1000)`)
  await assert.rejects(startTunnel({ ...config, startupTimeoutMs: 120 }, 'http://127.0.0.1:18431', undefined, new AbortController().signal, () => {}), /timed out/)
})

test('startup cancellation stops silent cloudflared promptly', async t => {
  const config = await fake(t, 'setInterval(() => {}, 1000)')
  const controller = new AbortController()
  const pending = startTunnel(config, 'http://127.0.0.1:18431', undefined, controller.signal, () => {})
  setTimeout(() => controller.abort(new Error('cancelled by test')), 40)
  await assert.rejects(pending, /cancelled by test/)
})

test('Token travels through child environment and is redacted from failures', async t => {
  const config = await fake(t, `if (process.argv.join(' ').includes('test-secret')) process.exit(7); console.error(process.env.TUNNEL_TOKEN); process.exit(2)`)
  await assert.rejects(startTunnel({ ...config, mode: 'token', publicHostname: 'app.example.com' }, 'http://127.0.0.1:18431', 'test-secret', new AbortController().signal, () => {}), error => {
    assert.match(error.message, /REDACTED/)
    assert.doesNotMatch(error.message, /test-secret/)
    return true
  })
})

test('spawn failure and runtime process exit are observable', async t => {
  await assert.rejects(startTunnel({ executable: '/missing/cloudflared', mode: 'quick', startupTimeoutMs: 1000 }, 'http://127.0.0.1:18431', undefined, new AbortController().signal, () => {}), /ENOENT/)
  const config = await fake(t, `console.error('https://crash.trycloudflare.com\\nRegistered tunnel connection'); setTimeout(() => process.exit(3), 100)`)
  const exited = Promise.withResolvers()
  const tunnel = await startTunnel(config, 'http://127.0.0.1:18431', undefined, new AbortController().signal, exited.resolve)
  t.after(() => tunnel.stop())
  assert.match((await exited.promise).message, /exited \(3\)/)
})

test('published Host bridge exchanges its token privately and is revoked with credentials', async t => {
  let exchanges = 0
  const upstream = createServer((req, res) => {
    assert.equal(req.url, '/?token=launch')
    exchanges++
    res.writeHead(303, { location: './', 'set-cookie': 'host-session=private; HttpOnly; Path=/' }).end()
  })
  upstream.listen(0, '127.0.0.1')
  await once(upstream, 'listening')
  const origin = `http://127.0.0.1:${upstream.address().port}`
  const auth = createAuth({ get: () => undefined, webServer: { getOrigin: () => origin },
    connection: { authenticatedUrl: value => `${value}/?token=launch` }, credentials: { resolve: async () => ({ value: 'secret' }) } }, policy, () => {})
  t.after(async () => { await auth.close(); upstream.closeAllConnections(); await new Promise(resolve => upstream.close(resolve)) })
  await auth.update(policy, true)
  const headers = { authorization: basic('admin:secret'), cookie: 'host-session=forged; unrelated=1' }
  const result = await auth.headers({ headers })
  assert.equal(result.cookie, 'unrelated=1; host-session=private')
  assert.equal(result.authorization, undefined)
  assert.equal(exchanges, 1)
  await auth.headers({ headers })
  assert.equal(exchanges, 1)
  auth.revoke()
  await auth.headers({ headers })
  assert.equal(exchanges, 2)
})

test('process termination escalates when cloudflared ignores SIGTERM', { skip: process.platform === 'win32' }, async t => {
  const config = await fake(t, `process.on('SIGTERM', () => {}); console.error('https://stubborn.trycloudflare.com\\nRegistered tunnel connection'); setInterval(() => {}, 1000)`)
  const tunnel = await startTunnel(config, 'http://127.0.0.1:18431', undefined, new AbortController().signal, () => {})
  t.after(() => tunnel.stop())
  await tunnel.stop()
})

test('revocation allows its authenticated settings write to acknowledge before closing', async t => {
  let proxy
  const upstream = createServer((req, res) => {
    req.resume()
    req.on('end', () => { proxy.disconnect(); res.end('saved') })
  })
  upstream.listen(0, '127.0.0.1')
  await once(upstream, 'listening')
  const { auth } = authentication()
  await auth.update(policy, true)
  proxy = await listenProxy({ host: '127.0.0.1', port: 0, upstreamOrigin: `http://127.0.0.1:${upstream.address().port}`, auth, origins: () => [proxy.url] })
  t.after(async () => { await proxy.close(); await auth.close(); await new Promise(resolve => upstream.close(resolve)) })
  const response = await call(`${proxy.url}/api/settings/mutate`, { authorization: basic('admin:secret') }, '{}')
  assert.equal(response.status, 200)
  assert.equal(response.text, 'saved')
})
