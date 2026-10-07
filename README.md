# Nats Commish

Fantasy basketball and football league hub for announcements, polls, trades, and standings.

## Local development

```sh
npm install
npm run dev
```

## Deploy with Caddy

1. Point the `A`/`AAAA` records for `natscommish.com` and `www.natscommish.com` to the server.
2. Build the static site:

   ```sh
   npm ci
   npm run build
   sudo mkdir -p /srv/nats-commish
   sudo cp -R dist/. /srv/nats-commish/
   ```

3. Copy the included `Caddyfile` to `/etc/caddy/Caddyfile`.
4. Validate and reload Caddy:

   ```sh
   sudo caddy validate --config /etc/caddy/Caddyfile
   sudo systemctl reload caddy
   ```

Caddy obtains and renews HTTPS certificates automatically after DNS is configured and ports 80/443 are reachable.

The feedback form uses the visitor's email application to send to `adham@natscommish.com`. Direct background delivery requires adding a server-side mail endpoint or form service.
