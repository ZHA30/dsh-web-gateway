import { createHash, randomUUID } from 'node:crypto'
import { execFile } from 'node:child_process'
import { access, chmod, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

const exec = promisify(execFile)
const directory = join(process.env.DSH_HOME || join(homedir(), '.dsh'), 'web-gateway', 'cloudflared')
const binary = join(directory, process.platform === 'win32' ? 'cloudflared.exe' : 'cloudflared')
const metadata = join(directory, 'version.json')

export async function managedStatus() {
  try {
    const data = JSON.parse(await readFile(metadata, 'utf8'))
    await access(binary)
    return { installed: true, version: data.version }
  } catch { return { installed: false } }
}

export function managedPath() { return binary }

export async function uninstallManaged() {
  await rm(binary, { force: true })
  await rm(metadata, { force: true })
}

export async function installManaged(onProgress = () => {}) {
  const arch = { x64: 'amd64', arm64: 'arm64' }[process.arch]
  const platform = { darwin: 'darwin', linux: 'linux', win32: 'windows' }[process.platform]
  if (!arch || !platform || (platform === 'windows' && arch === 'arm64')) throw new Error('此系统架构没有受支持的 cloudflared 安装包')
  const name = `cloudflared-${platform}-${arch}${platform === 'darwin' ? '.tgz' : platform === 'windows' ? '.exe' : ''}`
  const request = async url => {
    const response = await fetch(url, { signal: AbortSignal.timeout(300000), headers: { 'User-Agent': 'dsh-web-gateway' } })
    if (!response.ok) throw new Error(`下载失败 (HTTP ${response.status})`)
    return response
  }
  onProgress({ phase: 'checking' })
  const release = await (await request('https://api.github.com/repos/cloudflare/cloudflared/releases/latest')).json()
  const asset = release.assets?.find(item => item.name === name)
  if (!asset || !/^sha256:[a-f0-9]{64}$/.test(asset.digest || '')) throw new Error('未找到带校验值的官方安装包')
  const response = await request(asset.browser_download_url)
  const total = Number(response.headers.get('content-length')) || asset.size || 0
  const chunks = []
  let downloaded = 0
  onProgress({ phase: 'downloading', downloaded, total })
  for await (const chunk of response.body) {
    chunks.push(chunk)
    downloaded += chunk.length
    onProgress({ phase: 'downloading', downloaded, total })
  }
  const bytes = Buffer.concat(chunks)
  onProgress({ phase: 'installing' })
  if (createHash('sha256').update(bytes).digest('hex') !== asset.digest.slice(7)) throw new Error('安装包校验失败')
  await mkdir(directory, { recursive: true, mode: 0o700 })
  const prefix = join(directory, `.download-${randomUUID()}`)
  try {
    await writeFile(prefix, bytes, { mode: 0o600 })
    let executable = bytes
    if (platform === 'darwin') executable = (await exec('tar', ['-xOzf', prefix, 'cloudflared'], { encoding: 'buffer', maxBuffer: 150 * 1024 * 1024 })).stdout
    const candidate = prefix + '.bin'
    await writeFile(candidate, executable, { mode: 0o700 })
    await chmod(candidate, 0o700)
    await rename(candidate, binary)
    await writeFile(metadata, JSON.stringify({ version: release.tag_name }), { mode: 0o600 })
  } finally {
    await rm(prefix, { force: true })
    await rm(prefix + '.bin', { force: true })
  }
}
