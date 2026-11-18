import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'

export const AUTH_HEADER = 'x-dsh-web-gateway-auth'
const digest = value => createHash('sha256').update(value).digest()

export function createAuth(ctx, initial, disconnect) {
  let config = initial
  let generation = 0
  let bridge
  let cookieSession
  let lookup = new AbortController()
  const closeBridge = async () => {
    const previous = bridge
    bridge = undefined
    if (previous?.peer) {
      await previous.dispose()
      await previous.peer.dispose()
    }
  }
  return {
    async update(next, enabled) {
      generation++
      lookup.abort()
      lookup = new AbortController()
      cookieSession = undefined
      disconnect()
      config = next
      if (!enabled || next.enabled === false || next.mode !== 'basic') { await closeBridge(); return }
      if (bridge) return
      const registry = ctx.get('connection.authentication')
      if (!registry) {
        if (typeof ctx.connection.authenticatedUrl !== 'function') throw new Error('This Host has no supported authentication bridge')
        bridge = { legacy: true }
        return
      }
      const secret = randomBytes(32).toString('base64url')
      const expected = Buffer.from(secret)
      const peer = ctx.connection.createPeer({ principal: { kind: 'owner' } })
      const dispose = registry.register({
        authenticate(req) {
          const value = req.headers instanceof Headers ? req.headers.get(AUTH_HEADER) : req.headers[AUTH_HEADER]
          if (typeof value !== 'string') return
          const actual = Buffer.from(value)
          if (actual.length === expected.length && timingSafeEqual(actual, expected)) return peer
        },
      })
      bridge = { secret, peer, dispose }
    },
    revoke() { generation++; lookup.abort(); lookup = new AbortController(); cookieSession = undefined; disconnect() },
    async headers(req) {
      const current = generation
      const policy = config
      const headers = { ...req.headers }
      delete headers[AUTH_HEADER]
      delete headers['x-dsh-local-web-auth']
      if (policy.enabled === false || policy.mode === 'native') return headers
      const authorization = headers.authorization
      if (typeof authorization !== 'string' || !/^Basic [A-Za-z0-9+/]+={0,2}$/i.test(authorization)) return
      const decoded = Buffer.from(authorization.slice(6), 'base64').toString('utf8')
      const colon = decoded.indexOf(':')
      if (colon < 0) return
      const credential = await ctx.credentials.resolve(policy.passwordRef)
      if (current !== generation || !bridge || !credential?.value) return
      const nameMatches = timingSafeEqual(digest(decoded.slice(0, colon)), digest(policy.username))
      const passwordMatches = timingSafeEqual(digest(decoded.slice(colon + 1)), digest(credential.value))
      if (!nameMatches || !passwordMatches) return
      delete headers.authorization
      if (bridge.legacy) {
        const lifetime = lookup.signal
        cookieSession ??= (async () => {
          const response = await fetch(ctx.connection.authenticatedUrl(ctx.webServer.getOrigin()), {
            redirect: 'manual', signal: AbortSignal.any([lifetime, AbortSignal.timeout(10000)]),
          })
          await response.body?.cancel()
          const cookie = response.headers.getSetCookie()[0]?.split(';')[0]
          if (response.status !== 303 || !cookie) throw new Error('Could not establish upstream browser session')
          return { cookie, expires: Date.now() + 60000 }
        })()
        let session
        const pending = cookieSession
        try { session = await pending } catch (error) { if (cookieSession === pending) cookieSession = undefined; throw error }
        if (current !== generation || lifetime.aborted) return
        if (Date.now() >= session.expires) { cookieSession = undefined; return this.headers(req) }
        const cookieName = session.cookie.split('=')[0]
        const cookies = String(headers.cookie ?? '').split(';').map(part => part.trim())
          .filter(part => part && part.split('=')[0] !== cookieName)
        headers.cookie = [...cookies, session.cookie].join('; ')
      } else headers[AUTH_HEADER] = bridge.secret
      return headers
    },
    async close() { generation++; lookup.abort(); disconnect(); await closeBridge() },
  }
}
