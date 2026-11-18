import { isIP } from 'node:net'
import z from '@deepseek-ai/schemastery'
import qrcode from 'qrcode-generator'
import { createAuth } from './auth.js'
import { listenProxy, urlHost } from './proxy.js'
import { startTunnel } from './cloudflare.js'
import { installManaged, uninstallManaged, managedStatus, managedPath } from './managed-cloudflared.js'

export const name = 'web-gateway'
export const inject = ['webServer', 'connection', 'credentials']
const port = fallback => z.natural().min(1).max(65535).default(fallback)
const reference = fallback => z.string().pattern(/^[A-Za-z_][A-Za-z0-9_]*$/).default(fallback)
export const Config = z.object({
  enabled: z.boolean().default(true),
  exposure: z.object({ enabled: z.boolean().default(true), host: z.string().default('127.0.0.1'), port: port(18430) }).default({}),
  auth: z.object({
    enabled: z.boolean().default(true),
    mode: z.union(['basic', 'native']).default('basic'),
    username: z.string().default('admin'),
    passwordRef: reference('DSH_WEB_GATEWAY_PASSWORD'),
  }).default({}),
  tunnel: z.object({
    enabled: z.boolean().default(false), mode: z.union(['quick', 'token']).default('quick'),
    originPort: port(18431), executable: z.string().min(1).default('cloudflared'),
    publicHostname: z.string().default(''), tokenRef: reference('DSH_WEB_GATEWAY_CF_TOKEN'),
    startupTimeoutMs: z.natural().min(1).max(2147483647).default(30000),
  }).default({}),
}).volatile()

function validate(config) {
  const { host, port } = config.exposure
  if (!isIP(host) || host.includes('%') || /^(?:0\.0\.0\.0|::|::ffff:0\.0\.0\.0|::ffff:0:0)$/.test(new URL(`http://${urlHost(host)}`).hostname.replace(/^\[|\]$/g, ''))) {
    throw new Error('绑定地址必须是具体的 IPv4 或 IPv6 地址')
  }
  if (!config.auth.username.trim() || config.auth.username.includes(':')) throw new Error('账号不能为空或包含冒号')
  if (config.tunnel.enabled && config.tunnel.mode === 'token' && config.exposure.enabled && host === '127.0.0.1' && port === config.tunnel.originPort) {
    throw new Error('网页入口与 Tunnel 源站不能占用同一端口')
  }
  const hostname = config.tunnel.publicHostname
  if (hostname && !/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(hostname)) throw new Error('请输入不带协议或路径的公开域名')
}
const fingerprint = value => JSON.stringify(value)
const message = error => error instanceof Error ? error.message : String(error)

export async function apply(ctx, config) {
  validate(config.get())
  let stopped = false
  let tail = Promise.resolve()
  let tunnelTask = Promise.resolve()
  let exposure, tunnelListener, tunnel, startup
  let exposureKey, tunnelKey, authKey
  let tokenRevision = 0
  let retryRevision = 0
  let publicUrl
  let managerBusy = false
  let managerProgress
  const qrCache = new Map()
  function qrData(value) {
    if (!qrCache.has(value)) {
      const qr = qrcode(0, 'M')
      qr.addData(value, 'Byte')
      qr.make()
      if (qrCache.size >= 2) qrCache.delete(qrCache.keys().next().value)
      qrCache.set(value, `data:image/svg+xml,${encodeURIComponent(qr.createSvgTag({ cellSize: 4, margin: 16 }))}`)
    }
    return qrCache.get(value)
  }
  const state = { exposure: { phase: 'stopped' }, auth: { mode: config.get().auth.mode, passwordConfigured: false }, tunnel: { phase: 'stopped' } }
  const disconnect = () => { exposure?.disconnect(); tunnelListener?.disconnect() }
  const auth = createAuth(ctx, config.get().auth, disconnect)
  function effectiveConfig() {
    const next = config.get()
    if (next.enabled !== false) return next
    return { ...next, exposure: { ...next.exposure, enabled: false }, tunnel: { ...next.tunnel, enabled: false } }
  }
  const getTunnelKey = next => fingerprint([next.tunnel.enabled, next.tunnel.mode, next.tunnel.originPort, next.tunnel.executable,
    ...(next.tunnel.mode === 'token' ? [next.tunnel.publicHostname, next.tunnel.tokenRef, tokenRevision] : []), retryRevision])
  async function closeTunnel() {
    publicUrl = undefined
    await tunnel?.stop()
    tunnel = undefined
    await tunnelListener?.close()
    tunnelListener = undefined
  }
  async function reconcile() {
    if (stopped || managerBusy) return
    const next = effectiveConfig()
    const identity = fingerprint([next.auth, next.exposure.enabled || next.tunnel.enabled])
    if (identity !== authKey) {
      await auth.update(next.auth, next.exposure.enabled || next.tunnel.enabled)
      authKey = identity
    }
    state.auth = { mode: next.auth.mode, passwordConfigured: Boolean((await ctx.credentials.resolve(next.auth.passwordRef))?.value),
      tokenConfigured: Boolean((await ctx.credentials.resolve(next.tunnel.tokenRef))?.value) }
    if (stopped) return
    const key = fingerprint(next.exposure)
    if (key !== exposureKey) {
      await exposure?.close()
      exposure = undefined
      exposureKey = key
      state.exposure = { phase: next.exposure.enabled ? 'starting' : 'stopped' }
      if (next.exposure.enabled && !stopped) {
        try {
          const url = `http://${urlHost(next.exposure.host)}:${next.exposure.port}`
          exposure = await listenProxy({ ...next.exposure, upstreamOrigin: ctx.webServer.getOrigin(), auth, origins: () => [url] })
          state.exposure = { phase: 'listening', url: exposure.url }
        } catch (error) { state.exposure = { phase: 'error', error: message(error) } }
      }
    }
    const desired = getTunnelKey(next)
    if (desired === tunnelKey || stopped) return
    startup?.controller.abort(new Error('Tunnel 配置已更新'))
    tunnelKey = desired
    const controller = new AbortController()
    startup = { key: desired, controller }
    state.tunnel = { phase: next.tunnel.enabled ? 'starting' : 'stopped' }
    tunnelTask = tunnelTask.then(async () => {
      await closeTunnel()
      if (controller.signal.aborted || stopped || !next.tunnel.enabled) return
      try {
        if (next.tunnel.mode === 'token' && !next.tunnel.publicHostname) throw new Error('请填写公开域名')
        const token = next.tunnel.mode === 'token' ? (await ctx.credentials.resolve(next.tunnel.tokenRef))?.value : undefined
        controller.signal.throwIfAborted()
        if (next.tunnel.mode === 'token' && !token) throw new Error('请先配置 Cloudflare Tunnel token')
        tunnelListener = await listenProxy({ host: '127.0.0.1', port: next.tunnel.mode === 'quick' ? 0 : next.tunnel.originPort, upstreamOrigin: ctx.webServer.getOrigin(), auth,
          origins: () => [tunnelListener?.url, publicUrl] })
        controller.signal.throwIfAborted()
        state.tunnel = { phase: 'starting', originUrl: tunnelListener.url }
        const installed = await managedStatus()
        const executable = installed.installed ? managedPath() : next.tunnel.executable
        if (!installed.installed && executable === 'cloudflared') throw new Error('请先安装 cloudflared')
        tunnel = await startTunnel({ ...next.tunnel, executable }, tunnelListener.url, token, controller.signal, error => {
          if (stopped || desired !== tunnelKey || controller.signal.aborted) return
          publicUrl = undefined
          state.tunnel = { phase: 'error', error: message(error) }
          tunnelTask = tunnelTask.then(closeTunnel).catch(error => ctx.logger.warn(message(error)))
        })
        controller.signal.throwIfAborted()
        publicUrl = tunnel.url
        state.tunnel = { phase: 'connected', originUrl: tunnelListener.url, publicUrl }
      } catch (error) {
        await closeTunnel()
        if (!controller.signal.aborted && !stopped) state.tunnel = { phase: 'error', error: message(error) }
      } finally { if (startup?.controller === controller) startup = undefined }
    }).catch(error => { state.tunnel = { phase: 'error', error: message(error) }; ctx.logger.warn(message(error)) })
  }

  function update() {
    if (stopped) return tail
    if (startup && startup.key !== getTunnelKey(effectiveConfig())) startup.controller.abort(new Error('Tunnel 配置已更新'))
    tail = tail.then(reconcile).catch(error => { ctx.logger.warn(message(error)); state.tunnel = { phase: 'error', error: message(error) } })
    return tail
  }
  const owner = ctx.fiber
  ctx.on('internal/config', (fiber, next) => {
    const raw = next()
    if (fiber === owner) {
      const exposure = { ...raw.exposure }
      for (const key of ['enabled', 'host', 'port']) {
        if (typeof exposure[key] === 'object' && exposure[key] !== null) exposure[key] = config.get().exposure[key]
      }
      validate(Config({ ...raw, exposure }).get())
    }
    return raw
  })
  ctx.on('loader/volatile-update', update)
  ctx.on('credentials/reference-updated', ref => {
    const next = config.get()
    if (ref === next.auth.passwordRef) auth.revoke()
    if (ref === next.tunnel.tokenRef) tokenRevision++
    void update()
  })
  // Exact Fetch routes share the Host's authenticated /api carrier, including Desktop IPC.
  for (const method of ['status', 'retryTunnel', 'installCloudflared', 'uninstallCloudflared']) {
    const endpoint = `web-gateway/${method}`
    ctx.connection.fetch.register({
      path: `/api/${endpoint}`, methods: ['POST'], requestBody: 'buffered',
      async fetch(request) {
        // Connection enforces owner access before dispatching exact Fetch routes.
        let body
        try { body = await request.json() } catch { return new Response('Invalid JSON', { status: 400 }) }
        if (body?.type !== 'client-request' || typeof body.rpcId !== 'string' || body.method !== endpoint) return new Response('Invalid RPC request', { status: 400 })
        if (method === 'retryTunnel') { retryRevision++; void update() }
        if (method === 'status') {
          state.cloudflared = { ...await managedStatus(), busy: managerBusy, progress: managerProgress }
          const result = structuredClone(state)
          if (config.get().auth.enabled !== false && config.get().auth.mode === 'native') {
            for (const [item, key] of [[result.exposure, 'url'], [result.tunnel, 'publicUrl']]) {
              if (!item[key] || typeof ctx.connection.authenticatedUrl !== 'function') continue
              try { item.loginUrl = ctx.connection.authenticatedUrl(item[key]) } catch { /* Host does not expose a browser token. */ }
            }
          }
          for (const [item, key] of [[result.exposure, 'url'], [result.tunnel, 'publicUrl']]) {
            if (item[key]) item.qr = qrData(item.loginUrl || item[key])
          }
          return Response.json({ type: 'server-response', rpcId: body.rpcId, result: { ok: true, value: result } })
        }
        if (method === 'installCloudflared' || method === 'uninstallCloudflared') {
          if (managerBusy) return Response.json({ type: 'server-response', rpcId: body.rpcId, result: { ok: false, error: { message: '操作正在进行' } } })
          managerBusy = true
          managerProgress = { phase: method === 'installCloudflared' ? 'checking' : 'uninstalling' }
          try {
            startup?.controller.abort(new Error('cloudflared 管理操作'))
            await tail
            await tunnelTask
            await closeTunnel()
            state.tunnel = { phase: 'stopped' }
            if (method === 'installCloudflared') await installManaged(progress => { managerProgress = progress })
            else await uninstallManaged()
          } catch (error) {
            return Response.json({ type: 'server-response', rpcId: body.rpcId, result: { ok: false, error: { message: message(error) } } })
          } finally {
            managerBusy = false
            managerProgress = undefined
            retryRevision++
            void update()
          }
        }
        return Response.json({ type: 'server-response', rpcId: body.rpcId, result: { ok: true, value: structuredClone(state) } })
      },
    })
  }
  ctx.effect(() => async () => {
    stopped = true
    startup?.controller.abort(new Error('Web 访问已关闭'))
    disconnect()
    await tail
    await tunnelTask
    await closeTunnel()
    await exposure?.close()
    await auth.close()
  }, 'web-gateway resources')
  // Tunnel startup must not block the Host boot or its settings page.
  void update()
}
