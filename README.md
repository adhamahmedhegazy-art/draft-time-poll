# Nats Commish

Fantasy basketball and football league hub for announcements, polls, trades, standings, and ESPN draft rankings.

It is a static Vite site plus one small Node server (`server/`) that stores everything in a single SQLite file.
The server has no npm dependencies: it uses Node's built-in `node:http` and `node:sqlite`, so it needs **Node 22.13 or newer**.

## What the server does

- **League Polls**: votes are saved in SQLite. Each person votes once per poll: the browser gets a voter cookie and the voter's name is attached, and both are checked. Results show after you vote. The commissioner sees who voted and can remove a bogus vote.
- **Trade Wire and Leaderboard**: only the commissioner can add or edit them. Use the small "Commish login" link in the footer, then edit forms appear on those tabs.
- **ADP & Rankings** (basketball tab): ESPN Fantasy Basketball rankings, ADP and stats for the top 300 players, pulled from ESPN every 12 hours and cached in SQLite. Page views never call ESPN.
- **Football Top 100** (football tab): ESPN's PPR top 100 with ADP, % rostered, season points, points per game and projections. Refreshed the same way.
- **Top performers**: basketball shows today's game leaders (or last night's before tip-off); football shows this week's passing, rushing and receiving leaders. One ESPN scoreboard request, cached for 30 minutes.
- **Player cards**: click any player in the rankings or top performers for stats, injury status, ESPN outlook and recent news. News is fetched from ESPN the first time a card is opened and cached for 2 hours.

## Local development

```sh
npm install
COMMISH_PASSWORD=pick-a-password npm run server   # terminal 1, API on :8787
npm run dev                                        # terminal 2, site on :5173 (proxies /api)
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

3. Install the league server:

   ```sh
   sudo mkdir -p /opt/nats-commish
   sudo cp -R server package.json /opt/nats-commish/
   echo 'COMMISH_PASSWORD=your-secret-password' | sudo tee /etc/nats-commish.env
   sudo chmod 600 /etc/nats-commish.env
   sudo cp deploy/commish-api.service /etc/systemd/system/
   sudo systemctl daemon-reload
   sudo systemctl enable --now commish-api
   ```

   The database lives at `/var/lib/nats-commish/commish.db`. Back it up by copying that file.

4. Copy the included `Caddyfile` to `/etc/caddy/Caddyfile` (it now forwards `/api/*` to the league server).
5. Validate and reload Caddy:

   ```sh
   sudo caddy validate --config /etc/caddy/Caddyfile
   sudo systemctl reload caddy
   ```

Caddy obtains and renews HTTPS certificates automatically after DNS is configured and ports 80/443 are reachable.

### Server settings

| Variable | Default | Purpose |
| --- | --- | --- |
| `COMMISH_PASSWORD` | none | Commissioner password. Editing is off until it is set. |
| `PORT` | `8787` | API port (localhost only). |
| `COMMISH_DB` | `data/commish.db` | SQLite file location. |
| `ESPN_REFRESH_HOURS` | `12` | How often rankings are re-pulled from ESPN. |
| `ESPN_PLAYER_LIMIT` | `300` | How many ranked basketball players to cache. |
| `ESPN_FOOTBALL_PLAYER_LIMIT` | `100` | How many ranked football players to cache. |
| `ESPN_PERFORMERS_TTL_MINUTES` | `30` | How long top performers stay cached. |
| `ESPN_NEWS_TTL_MINUTES` | `120` | How long a player's news stays cached. |
| `ESPN_SEASON` | auto | Force an ESPN season year (ESPN calls 2026–27 "2027"). |
| `ESPN_DISABLED` | unset | Set to `1` to never call ESPN. |

The service file caps the server at 150 MB of memory; in practice it idles well under that.

The original site, from before the server was added, is the first commit in this repository.

The feedback form uses the visitor's email application to send to `adham@natscommish.com`. Direct background delivery requires adding a server-side mail endpoint or form service.
