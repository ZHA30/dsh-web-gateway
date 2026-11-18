import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export async function startTunnel(config, origin, token, signal, onExit) {
  signal.throwIfAborted()
  // Isolate Quick from ~/.cloudflared/config.yml without changing the parent environment.
  const directory = await mkdtemp(join(tmpdir(), 'dsh-web-gateway-'))
  const env = { ...process.env }
  for (const key of Object.keys(env)) {
    if (key.startsWith('TUNNEL_') || key === 'NO_AUTOUPDATE' || key === 'NO_TLS_VERIFY') delete env[key]
  }
  if (config.mode === 'quick') env.HOME = directory
  else env.TUNNEL_TOKEN = token
  const args = ['tunnel', '--no-autoupdate', ...(config.mode === 'quick' ? ['--url', origin] : ['run'])]
  const child = spawn(config.executable, args, { env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
  let closed = false
  let stopping
  let exited
  const exit = new Promise(resolve => { exited = resolve })
  child.once('error', error => { closed = true; exited(); fail(error) })
  child.once('close', (code, reason) => {
    closed = true
    exited()
    const error = new Error(`cloudflared exited (${reason ?? code})${tail ? `: ${diagnostic()}` : ''}`)
    if (!ready) fail(error)
    else if (!stopping) onExit(error)
  })
  let tail = ''
  const diagnostic = () => (token ? tail.replaceAll(token, '[REDACTED]') : tail).slice(-8192)
  let url = config.mode === 'token' ? `https://${config.publicHostname}` : undefined
  let connected = false
  let ready = false
  let succeed, fail
  const started = new Promise((resolve, reject) => { succeed = resolve; fail = reject })
  function scan(chunk) {
    const value = chunk.toString('utf8')
    tail = (tail + value).slice(-(8192 + (token?.length ?? 0)))
    if (config.mode === 'quick') url ??= tail.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com\b/)?.[0]
    connected ||= tail.includes('Registered tunnel connection')
    if (url && connected) succeed(url)
  }
  child.stdout.on('data', scan)
  child.stderr.on('data', scan)
  async function stop() {
    if (stopping) return stopping
    stopping = (async () => {
      signal.removeEventListener('abort', cancel)
      clearTimeout(timer)
      if (!closed) {
        child.kill('SIGTERM')
        const kill = setTimeout(() => child.kill('SIGKILL'), 2000)
        await exit
        clearTimeout(kill)
      }
      await rm(directory, { recursive: true, force: true })
    })()
    return stopping
  }
  const cancel = () => { fail(signal.reason ?? new Error('Tunnel startup cancelled')); void stop() }
  const timer = setTimeout(() => fail(new Error(`cloudflared startup timed out after ${config.startupTimeoutMs}ms${tail ? `: ${diagnostic()}` : ''}`)), config.startupTimeoutMs)
  signal.addEventListener('abort', cancel, { once: true })
  if (signal.aborted) cancel()
  try {
    await started
    clearTimeout(timer)
    signal.throwIfAborted()
    if (closed || child.exitCode !== null || child.signalCode !== null) throw new Error('cloudflared exited before startup completed')
    ready = true
    return { url, stop }
  } catch (error) { await stop(); throw error }
}
