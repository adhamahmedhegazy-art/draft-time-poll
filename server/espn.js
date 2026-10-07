import { db, getMeta, setMeta, transaction } from "./db.js";

// ESPN's public fantasy basketball endpoints (the same ones the ESPN draft room uses).
const API = process.env.ESPN_API || "https://lm-api-reads.fantasy.espn.com/apis/v3/games/fba";
const NEWS_API = process.env.ESPN_NEWS_API || "https://site.api.espn.com/apis/fantasy/v2/games/fba/news/players";
const PLAYER_LIMIT = Number(process.env.ESPN_PLAYER_LIMIT || 300);
const REFRESH_HOURS = Number(process.env.ESPN_REFRESH_HOURS || 12);
const NEWS_TTL_MINUTES = Number(process.env.ESPN_NEWS_TTL_MINUTES || 120);

const positions = { 1: "PG", 2: "SG", 3: "SF", 4: "PF", 5: "C" };
const teams = {
  0: "FA", 1: "ATL", 2: "BOS", 3: "NOP", 4: "CHI", 5: "CLE", 6: "DAL", 7: "DEN", 8: "DET", 9: "GSW", 10: "HOU",
  11: "IND", 12: "LAC", 13: "LAL", 14: "MIA", 15: "MIL", 16: "MIN", 17: "BKN", 18: "NYK", 19: "ORL", 20: "PHI",
  21: "PHX", 22: "POR", 23: "SAC", 24: "SAS", 25: "OKC", 26: "UTA", 27: "WAS", 28: "TOR", 29: "MEM", 30: "CHA",
};
// ESPN fantasy basketball stat ids.
const statIds = { pts: 0, blk: 1, stl: 2, ast: 3, reb: 6, to: 11, fgPct: 19, ftPct: 20, threes: 17, min: 40, gp: 42 };
const headers = { "User-Agent": "Mozilla/5.0 (NatsCommish league site)", Accept: "application/json" };

// ESPN labels a season by the year it ends: October 2026 is the 2027 season.
export function currentSeason(now = new Date()) {
  if (process.env.ESPN_SEASON) return Number(process.env.ESPN_SEASON);
  return now.getMonth() >= 6 ? now.getFullYear() + 1 : now.getFullYear();
}

function pickStats(averages = {}) {
  const stats = {};
  for (const [key, id] of Object.entries(statIds)) {
    const value = averages[id] ?? averages[String(id)];
    if (typeof value === "number") stats[key] = Math.round(value * (key.endsWith("Pct") ? 1000 : 10)) / (key.endsWith("Pct") ? 1000 : 10);
  }
  return Object.keys(stats).length ? stats : null;
}

function findStats(stats = [], season, source) {
  const line = stats.find((entry) => entry.seasonId === season && entry.statSourceId === source && (entry.statSplitTypeId ?? 0) === 0);
  if (!line) return null;
  const averages = line.averageStats || (line.stats && line.stats[statIds.gp] ? Object.fromEntries(Object.entries(line.stats).map(([id, total]) => [id, total / line.stats[statIds.gp]])) : null);
  return pickStats(averages || {});
}

export function parsePlayer(entry, season) {
  const player = entry.player || entry;
  const ranks = player.draftRanksByRankType || {};
  const ownership = player.ownership || {};
  return {
    id: player.id,
    name: player.fullName || `${player.firstName ?? ""} ${player.lastName ?? ""}`.trim(),
    team: teams[player.proTeamId] || "FA",
    position: positions[player.defaultPositionId] || "",
    jersey: player.jersey || "",
    injuryStatus: player.injuryStatus || (player.injured ? "INJURED" : "ACTIVE"),
    injured: Boolean(player.injured),
    espnRank: ranks.STANDARD?.rank ?? null,
    rotoRank: ranks.ROTO?.rank ?? null,
    adp: typeof ownership.averageDraftPosition === "number" && ownership.averageDraftPosition > 0 ? Math.round(ownership.averageDraftPosition * 10) / 10 : null,
    adpChange: typeof ownership.averageDraftPositionPercentChange === "number" ? Math.round(ownership.averageDraftPositionPercentChange * 10) / 10 : null,
    auctionValue: typeof ownership.auctionValueAverage === "number" ? Math.round(ownership.auctionValueAverage * 10) / 10 : null,
    rostered: typeof ownership.percentOwned === "number" ? Math.round(ownership.percentOwned * 10) / 10 : null,
    outlook: player.seasonOutlook || "",
    lastSeason: findStats(player.stats, season - 1, 0),
    thisSeason: findStats(player.stats, season, 0),
    projected: findStats(player.stats, season, 1),
  };
}

async function fetchPlayers(season) {
  const filter = {
    players: {
      limit: PLAYER_LIMIT,
      sortDraftRanks: { sortPriority: 100, sortAsc: true, value: "STANDARD" },
      filterStatsForExternalIds: { value: [season - 1, season] },
      filterStatsForSourceIds: { value: [0, 1] },
      filterStatsForSplitTypeIds: { value: [0] },
    },
  };
  const response = await fetch(`${API}/seasons/${season}/segments/0/leaguedefaults/1?view=kona_player_info`, {
    headers: { ...headers, "X-Fantasy-Filter": JSON.stringify(filter) },
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error(`ESPN players request failed with ${response.status}`);
  const body = await response.json();
  return (body.players || []).map((entry) => parsePlayer(entry, season)).filter((player) => player.id && player.name);
}

let refreshing = null;
let playersPayload = null;

export function refreshPlayers({ force = false } = {}) {
  const last = Number(getMeta("players_refreshed_at") || 0);
  if (!force && Date.now() - last < REFRESH_HOURS * 3600_000) return Promise.resolve(false);
  refreshing ??= (async () => {
    try {
      let season = currentSeason();
      let players = await fetchPlayers(season);
      if (!players.length) players = await fetchPlayers(--season);
      if (!players.length) throw new Error("ESPN returned no players");
      const ranked = players
        .map((player, index) => ({ player, sort: player.espnRank ?? 10000 + index }))
        .sort((a, b) => a.sort - b.sort);
      transaction(() => {
        db.exec("DELETE FROM players");
        const insert = db.prepare("INSERT OR REPLACE INTO players (id, sort_rank, data) VALUES (?, ?, ?)");
        ranked.forEach(({ player }, index) => insert.run(player.id, index, JSON.stringify(player)));
        setMeta("players_refreshed_at", Date.now());
        setMeta("players_season", season);
        setMeta("players_error", "");
      });
      playersPayload = null;
      console.log(`[espn] cached ${players.length} players for season ${season}`);
      return true;
    } catch (error) {
      setMeta("players_error", error.message);
      console.error(`[espn] refresh failed: ${error.message}`);
      return false;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

export function startPlayerRefreshSchedule() {
  refreshPlayers();
  // Check hourly; ESPN is only called once the cache is older than ESPN_REFRESH_HOURS.
  setInterval(() => refreshPlayers(), 3600_000).unref();
}

// The list view only needs a slim slice of each player; the full record is served per player card.
export function getPlayersPayload() {
  if (playersPayload) return playersPayload;
  const players = db.prepare("SELECT data FROM players ORDER BY sort_rank").all().map(({ data }) => {
    const p = JSON.parse(data);
    const line = p.projected || p.lastSeason || {};
    return { id: p.id, name: p.name, team: p.team, position: p.position, injuryStatus: p.injuryStatus, espnRank: p.espnRank, rotoRank: p.rotoRank, adp: p.adp, rostered: p.rostered, pts: line.pts ?? null, reb: line.reb ?? null, ast: line.ast ?? null };
  });
  playersPayload = JSON.stringify({
    updatedAt: Number(getMeta("players_refreshed_at") || 0) || null,
    season: Number(getMeta("players_season") || currentSeason()),
    error: getMeta("players_error") || null,
    players,
  });
  return playersPayload;
}

export function getPlayer(id) {
  const row = db.prepare("SELECT data FROM players WHERE id = ?").get(id);
  return row ? JSON.parse(row.data) : null;
}

function parseNews(body) {
  const items = body.feed || body.articles || body.headlines || [];
  return items.slice(0, 6).map((item) => ({
    headline: item.headline || item.title || "",
    body: item.story ? item.story.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 600) : item.description || "",
    published: item.published || item.lastModified || null,
    link: item.links?.web?.href || null,
  })).filter((item) => item.headline || item.body);
}

// News is fetched only when someone opens a player card, then reused from SQLite until it goes stale.
export async function getPlayerNews(id) {
  const cached = db.prepare("SELECT fetched_at, data FROM player_news WHERE player_id = ?").get(id);
  if (cached && Date.now() - cached.fetched_at < NEWS_TTL_MINUTES * 60_000) return JSON.parse(cached.data);
  try {
    const response = await fetch(`${NEWS_API}?limit=6&playerId=${id}`, { headers, signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error(`ESPN news request failed with ${response.status}`);
    const news = parseNews(await response.json());
    db.prepare("INSERT INTO player_news (player_id, fetched_at, data) VALUES (?, ?, ?) ON CONFLICT(player_id) DO UPDATE SET fetched_at = excluded.fetched_at, data = excluded.data")
      .run(id, Date.now(), JSON.stringify(news));
    return news;
  } catch (error) {
    console.error(`[espn] news for ${id} failed: ${error.message}`);
    return cached ? JSON.parse(cached.data) : [];
  }
}
