#!/usr/bin/env bash
# Run on the web server from inside the unpacked bundle:  sudo bash deploy/install.sh
set -euo pipefail
cd "$(dirname "$0")/.."

node -e 'const [a,b]=process.versions.node.split(".").map(Number); if (a<22||(a===22&&b<13)) { console.error("Node 22.13+ is required, found "+process.version); process.exit(1) }'

# Static site (keeps a copy of the current one first)
if [ -d /srv/nats-commish ]; then cp -R /srv/nats-commish "/srv/nats-commish.bak-$(date +%Y%m%d%H%M)"; fi
mkdir -p /srv/nats-commish
cp -R dist/. /srv/nats-commish/

# League server
mkdir -p /opt/nats-commish
cp -R server package.json /opt/nats-commish/
if [ ! -f /etc/nats-commish.env ]; then
  read -rsp "Choose the commissioner password: " pw; echo
  printf 'COMMISH_PASSWORD=%s\n' "$pw" > /etc/nats-commish.env
  chmod 600 /etc/nats-commish.env
fi
sed "s#/usr/bin/node#$(command -v node)#" deploy/commish-api.service > /etc/systemd/system/commish-api.service
systemctl daemon-reload
systemctl enable commish-api
systemctl restart commish-api

# Caddy (keeps a copy of the current config first)
cp /etc/caddy/Caddyfile "/etc/caddy/Caddyfile.bak-$(date +%Y%m%d%H%M)" 2>/dev/null || true
cp Caddyfile /etc/caddy/Caddyfile
caddy validate --config /etc/caddy/Caddyfile
systemctl reload caddy

sleep 2
curl -fsS http://127.0.0.1:8787/api/session && echo && echo "Nats Commish is live."
