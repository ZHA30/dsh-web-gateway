window.__ModuleLoader__.load({
  id: 'dsh-web-gateway',
  factory(require) {
    const { createElement: h, useEffect, useId, useRef, useState } = require('react')
    const { Button, Input, Switch, Menu, StateDot, IconGlobeOutlineRegular, IconCopyOutlineRegular, IconCheckOutlineRegular, IconCloseOutlineRegular, IconEyeOutlineRegular, IconEyeOffOutlineRegular, IconChevronUpOutlineRegular, IconChevronDownOutlineRegular } = require('@deepseek-ai/dsh-client-ui-primitives')
    const zh = {"invalidCommand":"无法从命令中识别 Tunnel token","copy":"复制","copied":"已复制","copyFailed":"复制失败","connector":"连接程序","checking":"检查更新中","downloading":"下载中","installingFile":"安装中","uninstalling":"卸载中","quickMode":"临时地址","tokenMode":"固定域名","tokenUnavailable":"Token 不可用","install":"安装","update":"更新","uninstall":"卸载","installing":"处理中","notInstalled":"未安装","origin":"源站地址","copyOrigin":"在 Cloudflare 控制台中配置此源站地址","entryDesc":"指定本地监听的地址和端口","authenticationDesc":"用于登录网页界面","tunnelDesc":"通过 Cloudflare Tunnel 访问网页界面","hostDesc":"接收网页连接的 IP 地址","portDesc":"接收网页连接的端口","usernameDesc":"Basic Auth 登录账号","passwordDesc":"Basic Auth 登录密码","hostnameDesc":"绑定到隧道的域名","executableDesc":"cloudflared 可执行文件的位置","originPortDesc":"隧道连接的本地端口","secretDesc":"Cloudflare 提供的隧道凭据","modeDesc":"选择临时地址或固定域名","off":"关闭","stopped":"已关闭","starting":"启动中","listening":"监听中","connected":"已连接","failed":"启动失败","reading":"读取状态中","conflict":"未能应用更改，请检查输入后重试","entry":"代理监听","host":"绑定地址","port":"端口","authentication":"登录方式","native":"宿主原生认证","username":"账号","password":"密码","keep":"留空保持不变","mode":"模式","quick":"Quick · 临时地址","token":"Token · 固定域名","originPort":"源站端口","executable":"cloudflared 路径","hostname":"公开域名","retry":"重试 Tunnel","loading":"加载配置中","unavailable":"配置不可用","nav":"Web Gateway"}
    const en = {"invalidCommand":"Could not find the tunnel token in the command","copy":"Copy","copied":"Copied","copyFailed":"Copy failed","connector":"Connector","checking":"Checking release","downloading":"Downloading","installingFile":"Installing","uninstalling":"Uninstalling","quickMode":"Temporary address","tokenMode":"Custom hostname","tokenUnavailable":"Token unavailable","install":"Install","update":"Update","uninstall":"Uninstall","installing":"Working","notInstalled":"Not installed","origin":"Origin","copyOrigin":"Configure this origin in the Cloudflare dashboard","entryDesc":"Address and port for local connections","authenticationDesc":"Credentials used to sign in to the web interface","tunnelDesc":"Access the web interface through Cloudflare Tunnel","hostDesc":"IP address for incoming connections","portDesc":"Port for incoming connections","usernameDesc":"Basic Auth sign-in name","passwordDesc":"Basic Auth sign-in password","hostnameDesc":"Domain assigned to the tunnel","executableDesc":"Path to the cloudflared executable","originPortDesc":"Local port used by the tunnel","secretDesc":"Tunnel credential issued by Cloudflare","modeDesc":"Use a temporary address or a fixed domain","off":"Off","stopped":"Stopped","starting":"Starting","listening":"Listening","connected":"Connected","failed":"Failed","reading":"Reading status","conflict":"Could not apply change; check the value and retry","entry":"Proxy listener","host":"Bind address","port":"Port","authentication":"Sign-in method","native":"Host authentication","username":"Username","password":"Password","keep":"Leave blank to keep","mode":"Mode","quick":"Quick · Temporary URL","token":"Token · Fixed hostname","originPort":"Origin port","executable":"cloudflared path","hostname":"Public hostname","retry":"Retry tunnel","loading":"Loading configuration","unavailable":"Configuration unavailable","nav":"Web Gateway"}
    zh.qrCode = '显示二维码'
    zh.secretKeep = '已设置，留空保持不变'
    zh.revealSecret = '显示密码'
    zh.hideSecret = '隐藏密码'
    en.qrCode = 'Show QR code'
    en.secretKeep = 'Configured; leave blank to keep'
    en.revealSecret = 'Show password'
    en.hideSecret = 'Hide password'
    const phases = { stopped: 'stopped', starting: 'starting', listening: 'listening', connected: 'connected', error: 'failed' }
    const address = 'dsh-resource://web-gateway/status'
    async function copyText(value) {
      if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(value)
      const input = document.createElement('textarea')
      input.value = value
      input.style.position = 'fixed'
      input.style.opacity = '0'
      document.body.append(input)
      try {
        input.select()
        if (!document.execCommand('copy')) throw new Error('copy failed')
      } finally { input.remove() }
    }
    function Address({ address, loginUrl, qr, unavailable, t }) {
      const popup = useRef(null)
      const copyTimer = useRef(null)
      const [copyMessage, setCopyMessage] = useState('')
      const label = t('qrCode')
      useEffect(() => () => { if (copyTimer.current !== null) clearTimeout(copyTimer.current) }, [])
      async function copy() {
        try {
          await copyText(loginUrl || address)
          setCopyMessage(t('copied'))
          if (copyTimer.current !== null) clearTimeout(copyTimer.current)
          copyTimer.current = setTimeout(() => { copyTimer.current = null; setCopyMessage('') }, 1000)
        }
        catch { setCopyMessage(t('copyFailed')) }
      }
      function toggle(event) {
        const panel = popup.current
        if (panel.matches(':popover-open')) { panel.hidePopover(); return }
        const rect = event.currentTarget.getBoundingClientRect()
        panel.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - 216))}px`
        panel.style.top = `${rect.bottom + 208 <= window.innerHeight ? rect.bottom + 6 : Math.max(8, rect.top - 208)}px`
        panel.showPopover()
      }
      return h('span', { className: 'dsh-wa-address-row' },
        h('a', { className: 'dsh-wa-address', href: loginUrl || address, target: '_blank', rel: 'noreferrer', title: address },
          h('span', null, address)),
        h('button', { type: 'button', className: 'dsh-wa-qr-button', title: copyMessage || t('copy'), 'aria-label': copyMessage || t('copy'), onClick: copy },
          h(copyMessage ? copyMessage === t('copied') ? IconCheckOutlineRegular : IconCloseOutlineRegular : IconCopyOutlineRegular, { size: 16, 'aria-hidden': true })),
        qr && h('button', { type: 'button', className: 'dsh-wa-qr-button', title: label, 'aria-label': label, onClick: toggle },
          h('svg', { viewBox: '0 0 24 24', width: 16, height: 16, fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true },
            h('rect', { x: 3, y: 3, width: 5, height: 5, rx: 1 }), h('rect', { x: 16, y: 3, width: 5, height: 5, rx: 1 }), h('rect', { x: 3, y: 16, width: 5, height: 5, rx: 1 }),
            h('path', { d: 'M21 16h-3a2 2 0 0 0-2 2v3 M21 21v.01 M12 7v3a2 2 0 0 1-2 2H7 M3 12h.01 M12 3h.01 M12 16v.01 M16 12h1 M21 12v.01 M12 21v-1' }))),
        qr && h('span', { ref: popup, popover: 'auto', className: 'dsh-wa-qr-popover' }, h('img', { src: qr, alt: label })),
        unavailable && h('span', null, t('tokenUnavailable')))
    }
    function Caption({ title, description, indicator }) {
      return h('span', { className: 'dsh-wa-caption' }, h('span', null, title, indicator), h('small', null, description))
    }
    function Field({ label, description, value, commit, type = 'text', placeholder, disabled, t }) {
      const [draft, setDraft] = useState(null)
      const [pending, setPending] = useState(false)
      const [error, setError] = useState('')
      const [revealed, setRevealed] = useState(false)
      async function finish(event) {
        const input = event.currentTarget
        if (draft === null || pending) return
        if (type === 'password' && input.closest('.dsh-wa-secret')?.contains(event.relatedTarget)) return
        if (!input.reportValidity()) return
        if (draft === String(value)) { setDraft(null); return }
        await write(type === 'number' ? Number(draft) : draft)
      }
      async function write(next) {
        setPending(true)
        try {
          await commit(next)
          setDraft(null)
          setError('')
        } catch (e) { setError(e.message) }
        finally { setPending(false) }
      }
      const numeric = type === 'number'
      const current = Number(draft ?? value)
      const input = h(numeric ? 'input' : Input, { type: type === 'password' && revealed && draft ? 'text' : type, placeholder, 'aria-label': label, value: draft ?? value, disabled: disabled || pending,
          required: type !== 'password', min: type === 'number' ? 1 : undefined, max: type === 'number' ? 65535 : undefined,
          autoComplete: type === 'password' ? 'new-password' : 'off',
          onChange: e => { setDraft(e.target.value); setError(''); setRevealed(false) }, onBlur: finish,
          onKeyDown: e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) e.currentTarget.blur() } })
      const control = type === 'password'
        ? h('div', { className: 'dsh-wa-secret' }, input,
            draft && h('button', { type: 'button', className: 'dsh-wa-secret-toggle', title: t(revealed ? 'hideSecret' : 'revealSecret'),
              'aria-label': t(revealed ? 'hideSecret' : 'revealSecret'), 'aria-pressed': revealed, disabled: disabled || pending || !draft,
              onClick: () => setRevealed(!revealed) }, h(revealed ? IconEyeOffOutlineRegular : IconEyeOutlineRegular, { size: 16, 'aria-hidden': true })))
        : input
      return h(numeric || type === 'password' ? 'div' : 'label', { className: 'dsh-wa-field' }, h(Caption, { title: label, description }),
        numeric ? h('div', { className: 'dsh-wa-stepper' }, input,
          h('span', { className: 'dsh-wa-arrows' }, [1, -1].map(step => {
            const next = current + step
            const name = label + (step > 0 ? ' +1' : ' −1')
            return h('button', { key: step, type: 'button', title: name, 'aria-label': name,
              disabled: disabled || pending || !Number.isInteger(next) || next < 1 || next > 65535,
              onMouseDown: e => e.preventDefault(), onClick: () => write(next) },
              h(step > 0 ? IconChevronUpOutlineRegular : IconChevronDownOutlineRegular, { size: 9 }))
          }))) : control,
        error && h('span', { role: 'alert' }, error))
    }
    function Section({ title, description, enabled, toggle, disabled, indicator, children }) {
      const [open, setOpen] = useState(false)
      const id = useId()
      return h('section', null,
        h('div', { className: 'dsh-wa-heading' }, h(Caption, { title, description, indicator }),
          h(Switch, { label: title, checked: enabled, disabled, onChange: toggle }),
          h('button', { type: 'button', className: 'dsh-wa-disclosure', 'aria-expanded': open, 'aria-controls': id,
            'aria-label': title, title, onClick: () => setOpen(!open) }, h(IconChevronDownOutlineRegular, { size: 12 }))),
        h('div', { id, hidden: !open }, open && children))
    }
    function Choice({ title, description, value, choices, disabled, change }) {
      const [open, setOpen] = useState(false)
      const items = choices.map(([id, label]) => ({ id, label }))
      return h('div', { className: 'dsh-wa-heading' }, h(Caption, { title, description }),
        h(Menu, { open, portal: true, align: 'end', items, selectedId: value,
          onClose: () => setOpen(false), onSelect: id => { setOpen(false); change(id) },
          anchor: h('button', { type: 'button', className: 'dsh-wa-selector', disabled,
            'aria-label': title, 'aria-haspopup': 'menu', 'aria-expanded': open, onClick: () => setOpen(!open) },
            items.find(item => item.id === value)?.label, h(IconChevronDownOutlineRegular)) }))
    }
    function Editor({ snapshot, runtime, save, credentials, retry, manage, t }) {
      const config = snapshot.value
      const [error, setError] = useState('')
      const [busy, setBusy] = useState(false)
      const [copyMessage, setCopyMessage] = useState('')
      const copyTimer = useRef(null)
      useEffect(() => () => { if (copyTimer.current !== null) clearTimeout(copyTimer.current) }, [])
      const locked = busy || !snapshot.writable
      async function run(action) {
        setBusy(true)
        setError('')
        try { await action() } catch (e) { setError(e.message) } finally { setBusy(false) }
      }
      function field(section, key, label, type) {
        return h(Field, { label, description: t(key === 'publicHostname' ? 'hostnameDesc' : key + 'Desc'), type, value: config[section][key], disabled: locked, t,
          commit: value => save([section, key], value) })
      }
      function secret(ref, label) {
        const isToken = label === 'Tunnel token'
        const configured = isToken ? runtime?.auth?.tokenConfigured : runtime?.auth?.passwordConfigured
        return h(Field, { label, description: t(configured ? 'secretKeep' : isToken ? 'secretDesc' : 'passwordDesc'), type: 'password', value: '', placeholder: configured ? '••••••••' : '', disabled: locked, t,
          commit: value => {
            if (!isToken) return credentials(ref, value)
            const trimmed = value.trim()
            const command = /(?:^|[\s/\\])cloudflared(?:\.exe)?(?:[\s"']|$)/i.test(trimmed)
            const match = trimmed.match(/(?:\bservice\s+install\s+|--token(?:=|\s+))["']?([A-Za-z0-9_+\/=-]+)["']?(?:\s|$)/i)
            if (command && !match) throw new Error(t('invalidCommand'))
            return credentials(ref, match ? match[1] : trimmed)
          } })
      }
      async function copyOrigin() {
        try { await copyText(`http://127.0.0.1:${config.tunnel.originPort}`); setCopyMessage(t('copied')) }
        catch { setCopyMessage(t('copyFailed')) }
        if (copyTimer.current !== null) clearTimeout(copyTimer.current)
        copyTimer.current = setTimeout(() => { copyTimer.current = null; setCopyMessage('') }, 1000)
      }
      function section(key, title, indicator, ...children) {
        const status = key === 'tunnel' ? runtime?.tunnel : runtime?.exposure
        const address = key === 'tunnel' ? status?.publicUrl : status?.url
        const description = address
          ? h(Address, { address, loginUrl: status.loginUrl, qr: status.qr, t,
              unavailable: config.auth.enabled !== false && config.auth.mode === 'native' && !status.loginUrl })
          : t(phases[status?.phase] || 'reading')
        return h(Section, { title, description, enabled: config.enabled !== false && config[key].enabled !== false, indicator, disabled: locked,
          toggle: value => run(() => config.enabled === false
            ? save([key, 'enabled'], value, [
                { op: 'set', path: ['enabled'], value: true },
                { op: 'set', path: [key === 'exposure' ? 'tunnel' : 'exposure', 'enabled'], value: false },
              ])
            : save([key, 'enabled'], value)) }, ...children)
      }
      const entry = runtime?.exposure
      const tunnel = runtime?.tunnel
      const manager = runtime?.cloudflared
      const progress = manager?.progress
      const managerDescription = progress
        ? progress.phase === 'downloading'
          ? `${t('downloading')}${progress.total ? ` ${Math.min(100, Math.round(progress.downloaded / progress.total * 100))}%` : ''}`
          : t({ checking: 'checking', installing: 'installingFile', uninstalling: 'uninstalling' }[progress.phase])
        : manager?.version ? `Version ${manager.version}` : t('notInstalled')
      function dot(status) {
        const phase = status ? t(phases[status.phase]) : t('reading')
        const state = status?.phase === 'error' ? 'error' : status?.phase === 'connected' || status?.phase === 'listening' ? 'done' : status?.phase === 'starting' ? 'ongoing' : 'idle'
        return h('span', { className: 'dsh-wa-dot-wrap', role: 'img', 'aria-label': phase, title: phase }, h(StateDot, { state, size: 8 }))
      }
      return h('div', { className: 'dsh-wa-form' },
        h('section', null, h(Choice, { title: t('authentication'), description: t('authenticationDesc'), disabled: locked,
          value: config.auth.enabled === false ? 'native' : config.auth.mode,
          choices: [['native', 'Token'], ['basic', 'Basic Auth']],
          change: value => run(() => save(['auth', 'enabled'], true, [{ op: 'set', path: ['auth', 'mode'], value }])) }),
          config.auth.enabled !== false && config.auth.mode === 'basic' && h('div', { className: 'dsh-wa-fields' }, field('auth', 'username', t('username')),
            secret(config.auth.passwordRef, t('password')))),
        section('exposure', t('entry'), dot(entry),
          h('div', { className: 'dsh-wa-fields' }, field('exposure', 'host', t('host')), field('exposure', 'port', t('port'), 'number')),
          entry?.error && h('p', { role: 'alert' }, entry.error)),
        section('tunnel', 'Cloudflare Tunnel', dot(tunnel),
          h('div', { className: 'dsh-wa-heading' },
            h(Caption, { title: t('connector'), description: managerDescription }),
            runtime?.cloudflared?.installed
              ? h('div', { className: 'dsh-wa-actions' },
                  h(Button, { className: 'dsh-wa-action', disabled: busy, onClick: () => run(() => manage('installCloudflared')) }, t('update')),
                  h(Button, { className: 'dsh-wa-action', disabled: busy, onClick: () => run(() => manage('uninstallCloudflared')) }, t('uninstall')))
              : h(Button, { className: 'dsh-wa-action', disabled: busy, onClick: () => run(() => manage('installCloudflared')) }, busy ? t('installing') : t('install'))),
          h(Choice, { title: t('mode'), description: t('modeDesc'), value: config.tunnel.mode, choices: [['quick', t('quickMode')], ['token', t('tokenMode')]],
            disabled: locked, change: value => run(() => save(['tunnel', 'mode'], value)) }),
          config.tunnel.mode === 'token' && h('div', { className: 'dsh-wa-fields' }, field('tunnel', 'publicHostname', t('hostname')),
            secret(config.tunnel.tokenRef, 'Tunnel token')),
          config.tunnel.mode === 'token' && h('div', { className: 'dsh-wa-heading' },
            h(Caption, { title: t('origin'), description: t('copyOrigin') }),
            h('code', null, `http://127.0.0.1:${config.tunnel.originPort}`),
            h(Button, { className: 'dsh-wa-action', onClick: copyOrigin, title: copyMessage || t('copy'), 'aria-label': copyMessage || t('copy') },
              copyMessage ? h(copyMessage === t('copied') ? IconCheckOutlineRegular : IconCloseOutlineRegular) : h(IconCopyOutlineRegular))),
          tunnel?.error && h('div', null, h('p', { role: 'alert' }, tunnel.error),
            h(Button, { disabled: locked, onClick: () => run(retry) }, t('retry')))),
        error && h('p', { role: 'alert' }, error))
    }
    function Panel({ useAccess, useResource, save, credentials, retry, manage, t }) {
      const snapshot = useAccess(value => value)
      const status = useResource(address)
      if (!snapshot.value) return h('p', null, snapshot.status === 'loading' ? t('loading') : t('unavailable'))
      return h('div', null, status.failure && h('p', { className: 'dsh-wa-error' }, status.failure.message),
        h(Editor, { snapshot, runtime: status.value, save, credentials, retry, manage, t }))
    }
    return {
      inject: ['slots', 'configForms', 'connection', 'remote', 'remote.credentials', 'resources', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register('webGateway', { zh, en }), 'web-gateway locale')
        const scope = ctx.configForms.get('web-gateway')
        const rpc = async (method, signal) => {
          const result = await ctx.connection.rpc.call('/api', `web-gateway/${method}`, {}, signal)
          if (!result.ok) throw new Error(result.error.message)
          return result.value
        }
        ctx.resources.register({ protocol: 'web-gateway', async *open(_address, { signal }) {
          while (!signal.aborted) {
            try { yield { ok: true, value: await rpc('status', signal) } }
            catch (error) { if (signal.aborted) return; yield { ok: false, error: { code: 'web-gateway/status', message: error.message, details: {} } } }
            await new Promise(resolve => {
              const finish = () => { clearTimeout(timer); signal.removeEventListener('abort', finish); resolve() }
              const timer = setTimeout(finish, 1500)
              signal.addEventListener('abort', finish, { once: true })
              if (signal.aborted) finish()
            })
          }
        } })
        ctx.effect(() => {
          const style = document.createElement('style')
          style.textContent = `
            .dsh-wa-form { width:100%; color:var(--dsw-alias-label-primary); font-size:14px; line-height:22px; }
            .dsh-wa-form > section { margin:0; }
            .dsh-wa-heading,.dsh-wa-field { display:flex; align-items:center; gap:12px; padding:14px 0; border-bottom:.5px solid var(--dsw-alias-border-l2); }
            .dsh-wa-caption { display:flex; flex:1 1 220px; min-width:0; flex-direction:column; gap:3px; padding-right:24px; font-size:14px; font-weight:400; line-height:20px; }
            .dsh-wa-caption small { font-size:12px; line-height:18px; color:var(--dsw-alias-label-tertiary); }
            .dsh-wa-field { flex-wrap:wrap; }
            .dsh-wa-field > :nth-child(2) { box-sizing:border-box; width:min(42%,240px); min-width:0; }
            .dsh-wa-field > .dsh-wa-stepper { position:relative; display:flex; align-items:center; width:100px; height:36px; border:.5px solid transparent; border-radius:var(--dsw-radius-md); background:var(--dsw-alias-bg-module-platform); }
            .dsh-wa-stepper:focus-within { border-color:var(--dsw-alias-state-business-primary); }
            .dsh-wa-stepper input { box-sizing:border-box; width:100%; height:100%; padding:0 25px 0 8px; border:0; border-radius:inherit; appearance:textfield; background:transparent; color:inherit; font:inherit; font-variant-numeric:tabular-nums; text-align:center; }
            .dsh-wa-stepper input::-webkit-inner-spin-button,.dsh-wa-stepper input::-webkit-outer-spin-button { -webkit-appearance:none; }
            .dsh-wa-secret { position:relative; min-width:0; }
            .dsh-wa-secret > span { box-sizing:border-box; width:100%; }
            .dsh-wa-secret input { padding-right:40px; }
            .dsh-wa-secret input::placeholder { color:var(--dsw-alias-label-primary); opacity:1; }
            .dsh-wa-secret-toggle { position:absolute; inset:1px 1px 1px auto; display:inline-flex; align-items:center; justify-content:center; width:32px; height:30px; padding:0; border:0; border-radius:var(--dsw-radius-md); background:transparent; color:var(--dsw-alias-label-secondary); cursor:pointer; }
            @media (hover:hover) { .dsh-wa-secret-toggle:hover:not(:disabled) { color:var(--dsw-alias-label-primary); } }
            .dsh-wa-secret-toggle:disabled { cursor:default; }
            .dsh-wa-arrows { position:absolute; right:8px; display:flex; flex-direction:column; gap:2px; opacity:0; }
            .dsh-wa-stepper:focus-within .dsh-wa-arrows,.dsh-wa-stepper:hover .dsh-wa-arrows { opacity:1; }
            @media (hover:none) { .dsh-wa-arrows { opacity:1; } }
            .dsh-wa-arrows button { display:inline-flex; align-items:center; justify-content:center; width:17px; height:12px; padding:0; border:0; border-radius:var(--dsw-radius-xs); background:color-mix(in srgb,var(--dsw-alias-bg-layer-1) 75%,transparent); color:var(--dsw-alias-label-primary); cursor:pointer; }
            .dsh-wa-arrows button:hover:not(:disabled) { background:var(--dsw-alias-bg-layer-1); }
            .dsh-wa-arrows button:disabled { color:var(--dsw-alias-label-caption); cursor:default; }
            .dsh-wa-field [role=alert] { flex-basis:100%; }
            @media (max-width:767px) { html:not([data-windows-titlebar]):not([data-platform=darwin]) .dsh-wa-caption { padding-right:16px; } }
            .dsh-wa-selector,.dsh-wa-disclosure { display:inline-flex; align-items:center; gap:8px; border:none; font:inherit; color:inherit; cursor:pointer; }
            .dsh-wa-selector { height:36px; padding:0 12px; gap:12px; border-radius:var(--dsw-radius-md); background:var(--dsw-alias-bg-module-platform); }
            @media (hover:hover) { .dsh-wa-selector:hover { background:var(--dsw-alias-interactive-bg-hover); } }
            .dsh-wa-disclosure { justify-content:center; width:24px; height:24px; padding:0; background:transparent; color:var(--dsw-alias-label-tertiary); border-radius:var(--dsw-radius-xs); }
            @media (hover:hover) { .dsh-wa-disclosure:hover { background:var(--dsw-alias-interactive-bg-hover); } }
            .dsh-wa-disclosure svg { transition:transform var(--ds-transition-duration-fast) var(--ds-ease-in-out); }
            .dsh-wa-disclosure[aria-expanded=true] svg { transform:rotate(180deg); }
            .dsh-wa-dot-wrap { display:inline-flex; align-items:center; margin-inline-start:8px; width:8px; height:8px; vertical-align:middle; }
            .dsh-wa-actions { display:flex; flex-wrap:wrap; justify-content:flex-end; gap:8px; }
            .dsh-wa-action { border:.5px solid var(--dsw-alias-border-l2); }
            .dsh-wa-caption small { min-width:0; max-width:360px; overflow:hidden; white-space:nowrap; text-overflow:ellipsis; }
            .dsh-wa-address { display:inline-flex; align-items:center; gap:5px; flex:0 1 auto; max-width:100%; min-width:0; color:var(--dsw-alias-link); vertical-align:bottom; }
            .dsh-wa-address-row { display:flex; align-items:center; gap:5px; min-width:0; line-height:20px; }
            .dsh-wa-qr-button { display:inline-flex; flex:none; align-items:center; justify-content:center; width:20px; height:20px; padding:2px; border:0; border-radius:var(--dsw-radius-xs); background:transparent; color:var(--dsw-alias-label-tertiary); cursor:pointer; }
            @media (hover:hover) { .dsh-wa-qr-button:hover { background:var(--dsw-alias-interactive-bg-hover); } }
            .dsh-wa-qr-popover { position:fixed; inset:auto; margin:0; padding:8px; border:0; border-radius:var(--dsw-radius-md); background:var(--dsw-alias-bg-layer-1); box-shadow:var(--dsw-elevation-prominent); }
            .dsh-wa-qr-popover img { display:block; width:184px; height:184px; border-radius:var(--dsw-radius-md); background:var(--dsw-alias-bg-layer-3); }
            .dsh-wa-address span:first-child { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
            .dsh-wa-form [role=alert] { overflow-wrap:anywhere; }
            .dsh-wa-options a { overflow-wrap:anywhere; }
            .dsh-wa-form p { font-size:13px; color:var(--dsw-alias-label-secondary); margin:0; }
            .dsh-wa-error { color:var(--dsw-alias-state-error-primary); white-space:pre-wrap; overflow-wrap:anywhere; padding:10px 0; }
            .dsh-wa-selector:focus-visible,.dsh-wa-disclosure:focus-visible,.dsh-wa-qr-button:focus-visible,.dsh-wa-arrows button:focus-visible,.dsh-wa-secret-toggle:focus-visible { outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary)); outline-offset:2px; }
            .dsh-wa-form [disabled] { cursor:not-allowed; }
            @media (max-width:520px) {
              .dsh-wa-heading,.dsh-wa-field { align-items:flex-start; }
              .dsh-wa-caption { flex-basis:100%; padding-right:0; }
              .dsh-wa-field > :nth-child(2),.dsh-wa-selector { width:100%; }
              .dsh-wa-actions { width:100%; justify-content:flex-start; }
              .dsh-wa-address-row { max-width:100%; }
            }
          `
          document.head.append(style)
          return () => style.remove()
        }, 'web-gateway styles')
        ctx.slots.inject('settings.section', () => ctx.slots.register({
          name: 'settings.section', id: 'dsh-web-gateway', order: 100,
          label: () => ctx.locale.bind('webGateway')('nav'), locale: 'webGateway', inject: () => ({
            hooks: { access: scope },
            save: async (path, value, related = []) => {
              const snapshot = scope.getSnapshot()
              const next = structuredClone(snapshot.value)
              const fields = new Set()
              for (const op of [...related, { op: 'set', path, value }]) {
                if (op.path.length === 1) next[op.path[0]] = op.value
                else next[op.path[0]][op.path[1]] = op.value
                fields.add(op.path[0])
              }
              const ops = [...fields].map(field => ({ op: 'set', path: [field], value: next[field] }))
              if (!await scope.mutate(ops, snapshot.revision)) throw new Error(ctx.locale.bind('webGateway')('conflict'))
            },
            credentials: async (ref, value) => {
              const response = await ctx.remote.credentials.set(ref, value)
              if (!response.ok) throw new Error(response.error.message)
            },
            retry: () => rpc('retryTunnel'),
            manage: method => rpc(method),
          }),
        }, Panel))
        ctx.slots.inject('settings.section.icon', () => ctx.slots.register({
          name: 'settings.section.icon', id: 'dsh-web-gateway',
        }, () => h(IconGlobeOutlineRegular, { size: 16, 'aria-hidden': true })))
      },
    }
  },
})
