# DSH Web Gateway

Access the DeepSeek Harness web interface through a configurable local listener or Cloudflare Tunnel.

> [!NOTE]
> This plugin targets DeepSeek Harness `0.2.2-rc.5` and is configured under **Settings → Web Gateway**.

> [!WARNING]
> Basic Auth on the local listener uses plain HTTP, so use a trusted network or the tunnel's HTTPS address.

## Features

The plugin provides local access, authentication, and Cloudflare Tunnel management for Desktop and Web hosts.

- **Local listener**: Choose the listening address and port independently of the host's own listener.
- **Authentication**: Use the host's Token authentication, protect plugin entries with Basic Auth, or disable authentication.
- **Cloudflare Tunnel**: Install, update, and uninstall `cloudflared` from settings and run a Quick Tunnel or a remotely managed tunnel.
- **Access links**: Open the local or tunnel address from settings, with the host token included when available.
- **Status**: View listener and tunnel state and retry a failed tunnel from settings.

## References

- [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)
