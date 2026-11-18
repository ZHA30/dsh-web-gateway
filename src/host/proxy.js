import { createServer, request as httpRequest } from 'node:http'
import { request as httpsRequest } from 'node:https'

const HOP_HEADERS = ['connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailer', 'transfer-encoding', 'upgrade']
export const urlHost = host => host.includes(':') ? `[${host}]` : host

function clean(headers) {
  const result = { ...headers }
  const extra = String(headers.connection ?? '').split(',').map(value => value.trim().toLowerCase())
  for (const key of [...HOP_HEADERS, ...extra]) delete result[key]
  return result
}

export function trusted(req, origins) {
  if (req.headers['sec-fetch-site'] === 'cross-site' && !(req.method === 'GET' && req.headers['sec-fetch-mode'] === 'navigate' && req.headers['sec-fetch-dest'] === 'document')) return false
  const host = req.headers.host
  if (typeof host !== 'string') return false
  const allowed = origins().filter(Boolean).map(value => new URL(value))
  if (!allowed.some(value => value.host === host.toLowerCase())) return false
  const origin = req.headers.origin
  if (origin === undefined) return true
  try {
    const parsed = new URL(origin)
    return origin === parsed.origin && allowed.some(value => value.origin === parsed.origin && value.host === host.toLowerCase())
  } catch { return false }
}

export async function listenProxy({ host, port, upstreamOrigin, auth, origins }) {
  const clients = new Set()
  const upstreams = new Map()
  const writes = new Map()
  const target = new URL(upstreamOrigin)
  const request = target.protocol === 'https:' ? httpsRequest : httpRequest
  function upstream(req, headers, upgrade = false) {
    headers = upgrade ? { ...headers } : clean(headers)
    headers.host = target.host
    if (headers.origin !== undefined) headers.origin = target.origin
    // No deployment meaning is assigned to client-supplied forwarding headers.
    for (const key of Object.keys(headers)) {
      if (key === 'forwarded' || key.startsWith('x-forwarded-')) delete headers[key]
    }
    const exchange = request(target, { method: req.method, path: req.url, headers, agent: false })
    upstreams.set(exchange, req.socket)
    exchange.on('close', () => upstreams.delete(exchange))
    return exchange
  }
  const challenge = { 'WWW-Authenticate': 'Basic realm="DSH", charset="UTF-8"', 'Cache-Control': 'no-store' }
  const server = createServer(async (req, res) => {
    try {
      if (!trusted(req, origins)) { res.writeHead(403, { 'Cache-Control': 'no-store' }).end('Forbidden'); return }
      const headers = await auth.headers(req)
      if (res.destroyed) return
      if (!headers) { res.writeHead(401, challenge).end('Authentication required'); return }
      const pathname = new URL(req.url, 'http://proxy.invalid').pathname
      if (req.method === 'POST' && ['/api/settings/mutate', '/api/credentials/set'].includes(pathname)) {
        const write = { revoked: false, timer: undefined }
        writes.set(req.socket, write)
        const finish = () => {
          clearTimeout(write.timer)
          if (writes.get(req.socket) === write) writes.delete(req.socket)
          if (write.revoked) req.socket.end()
        }
        res.once('finish', finish)
        res.once('close', finish)
      }
      const exchange = upstream(req, headers)
      res.on('close', () => exchange.destroy())
      req.on('aborted', () => exchange.destroy())
      exchange.on('response', response => {
        res.writeHead(response.statusCode, clean(response.headers))
        res.flushHeaders()
        response.on('error', () => res.destroy())
        response.pipe(res)
      })
      exchange.on('error', () => {
        if (res.headersSent) res.destroy()
        else res.writeHead(502).end('Upstream unavailable')
      })
      req.pipe(exchange)
    } catch {
      if (!res.headersSent) res.writeHead(502)
      res.end('Upstream unavailable')
    }
  })
  server.on('connection', socket => {
    clients.add(socket)
    socket.on('error', () => {})
    socket.on('close', () => clients.delete(socket))
  })
  server.on('upgrade', async (req, socket, head) => {
    function reject(status, headers = {}) {
      socket.end(`HTTP/1.1 ${status}\r\nConnection: close\r\nContent-Length: 0\r\n${Object.entries(headers).map(([key, value]) => `${key}: ${value}\r\n`).join('')}\r\n`)
    }
    try {
      if (!trusted(req, origins)) { reject('403 Forbidden'); return }
      const headers = await auth.headers(req)
      if (socket.destroyed) return
      if (!headers) { reject('401 Unauthorized', challenge); return }
      const exchange = upstream(req, headers, true)
      socket.on('close', () => exchange.destroy())
      exchange.on('upgrade', (response, peer, peerHead) => {
        if (socket.destroyed) { peer.destroy(); return }
        clients.add(peer)
        peer.on('close', () => clients.delete(peer))
        peer.on('error', () => socket.destroy())
        socket.on('error', () => peer.destroy())
        socket.on('close', () => peer.destroy())
        peer.on('close', () => socket.destroy())
        socket.write(`HTTP/${response.httpVersion} ${response.statusCode} ${response.statusMessage}\r\n`)
        for (let i = 0; i < response.rawHeaders.length; i += 2) socket.write(`${response.rawHeaders[i]}: ${response.rawHeaders[i + 1]}\r\n`)
        socket.write('\r\n')
        if (peerHead.length) socket.write(peerHead)
        if (head.length) peer.write(head)
        socket.pipe(peer).pipe(socket)
      })
      exchange.on('response', response => { response.resume(); reject(`${response.statusCode} ${response.statusMessage}`) })
      exchange.on('error', () => socket.destroy())
      exchange.end()
    } catch { socket.destroy() }
  })
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen({ host, port }, () => { server.off('error', reject); resolve() })
  })
  const disconnect = () => {
    // Let the authenticated settings write acknowledge the change that revoked its connection.
    for (const [socket, write] of writes) {
      write.revoked = true
      write.timer ??= setTimeout(() => socket.destroy(), 5000)
      write.timer.unref()
    }
    for (const socket of clients) if (!writes.has(socket)) socket.destroy()
    for (const [exchange, socket] of upstreams) if (!writes.has(socket)) exchange.destroy()
  }
  return {
    url: `http://${urlHost(host)}:${server.address().port}`,
    disconnect,
    close: () => new Promise(resolve => { server.close(resolve); disconnect() }),
  }
}
