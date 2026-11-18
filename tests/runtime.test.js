import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:net'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { once } from 'node:events'
import { apply, Config } from '../src/host/index.js'

async function availablePort() {
  const server = createServer()
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const port = server.address().port
  await new Promise(resolve => server.close(resolve))
  return port
}
async function waitFor(read, matches) {
  const timeout = AbortSignal.timeout(5000)
  while (!timeout.aborted) {
    const value = await read()
    if (matches(value)) return value
    await new Promise(resolve => setTimeout(resolve, 10))
  }
  throw new Error(`State did not settle: ${JSON.stringify(await read())}`)
}
async function runtime(t, overrides = {}, source = "console.error(`https://runtime-${process.pid}.trycloudflare.com\\nRegistered tunnel connection`);setInterval(()=>{},1000)") {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-wa-runtime-'))
  const executable = join(directory, 'cloudflared')
  await writeFile(executable, `#!/usr/bin/env node\n${source}\n`, { mode: 0o700 })
  let config = Config({ exposure: { enabled: false, port: await availablePort() }, tunnel: { enabled: true, originPort: await availablePort(), executable, ...overrides } }).get()
  const listeners = new Map()
  const routes = new Map()
  let dispose
  const ctx = { fiber: {}, get: () => undefined, logger: { warn: error => { throw new Error(error) } },
    credentials: { resolve: async () => ({ value: 'password' }) },
    webServer: { getOrigin: () => 'http://127.0.0.1:9' },
    connection: { authenticatedUrl: value => `${value}/?token=test`, fetch: { register: route => routes.set(route.path, route) } },
    on: (name, callback) => listeners.set(name, callback), effect: callback => { dispose = callback() } }
  await apply(ctx, { get: () => config })
  t.after(async () => { await dispose(); await rm(directory, { recursive: true, force: true }) })
  async function call(method) {
    const endpoint = `web-gateway/${method}`
    const response = await routes.get(`/api/${endpoint}`).fetch(new Request(`http://localhost/api/${endpoint}`, { method: 'POST', body: JSON.stringify({ type: 'client-request', rpcId: 'test', method: endpoint }) }))
    return (await response.json()).result.value
  }
  return { call, update: async mutate => { config = mutate(config); await listeners.get('loader/volatile-update')() }, config: () => config }
}

test('local listener is independent of a connected tunnel and both shut down', async t => {
  const runtimeInstance = await runtime(t)
  const { call, update, config } = runtimeInstance
  const initial = await waitFor(() => call('status'), state => state.tunnel.phase === 'connected')
  assert.equal(initial.exposure.phase, 'stopped')
  await update(value => ({ ...value, exposure: { ...value.exposure, enabled: true } }))
  const enabled = await call('status')
  assert.equal(enabled.exposure.phase, 'listening')
  assert.equal(enabled.tunnel.publicUrl, initial.tunnel.publicUrl)
  await update(value => ({ ...value, exposure: { ...value.exposure, enabled: false } }))
  assert.equal((await call('status')).tunnel.phase, 'connected')
  await update(value => ({ ...value, tunnel: { ...value.tunnel, enabled: false } }))
  await waitFor(() => call('status'), state => state.tunnel.phase === 'stopped')
  // The listener has been released, not merely hidden from the status response.
  await waitFor(async () => { try { await fetch(`http://127.0.0.1:${config().tunnel.originPort}`); return false } catch { return true } }, Boolean)
})

test('local changes remain responsive while tunnel startup is pending and stop cancels it', async t => {
  const { call, update, config } = await runtime(t, { startupTimeoutMs: 20000 }, 'setInterval(()=>{},1000)')
  await waitFor(() => call('status'), state => state.tunnel.phase === 'starting' && state.tunnel.originUrl)
  await update(value => ({ ...value, exposure: { ...value.exposure, enabled: true } }))
  assert.equal((await call('status')).exposure.phase, 'listening')
  assert.equal((await call('status')).tunnel.phase, 'starting')
  assert.equal((await call('status')).exposure.url, `http://127.0.0.1:${config().exposure.port}`)
  await update(value => ({ ...value, tunnel: { ...value.tunnel, enabled: false } }))
  await waitFor(async () => { try { await fetch(`http://127.0.0.1:${config().tunnel.originPort}`); return false } catch { return true } }, Boolean)
  assert.equal((await call('status')).tunnel.phase, 'stopped')
})

test('browser login links are included only for native authentication', async t => {
  const { call, update } = await runtime(t)
  await waitFor(() => call('status'), state => state.tunnel.phase === 'connected')
  await update(value => ({ ...value, exposure: { ...value.exposure, enabled: true } }))
  let state = await call('status')
  assert.equal(state.exposure.loginUrl, undefined)
  assert.equal(state.tunnel.loginUrl, undefined)
  await update(value => ({ ...value, auth: { ...value.auth, mode: 'native' } }))
  state = await call('status')
  assert.equal(state.exposure.loginUrl, `${state.exposure.url}/?token=test`)
  assert.equal(state.tunnel.loginUrl, `${state.tunnel.publicUrl}/?token=test`)
  await update(value => ({ ...value, auth: { ...value.auth, mode: 'basic' } }))
  state = await call('status')
  assert.equal(state.exposure.loginUrl, undefined)
  assert.equal(state.tunnel.loginUrl, undefined)
})
