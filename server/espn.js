import { db, getMeta, setMeta, transaction } from "./db.js";

// ESPN's public fantasy endpoints (the same ones the ESPN draft room uses) plus the public scoreboard.
const FANTASY_API = process.env.ESPN_API || "https://lm-api-reads.fantasy.espn.com/apis/v3/games";
const NEWS_API = process.env.ESPN_NEWS_API || "https://site.api.espn.com/apis/fantasy/v2/games";
const SCOREBOARD_API = process.env.ESPN_SCOREBOARD_API || "https://site.api.espn.com/apis/site/v2/sports";
const REFRESH_HOURS = Number(process.env.ESPN_REFRESH_HOURS || 12);
const NEWS_TTL_MINUTES = Number(process.env.ESPN_NEWS_TTL_MINUTES || 120);
const PERFORMERS_TTL_MINUTES = Number(process.env.ESPN_PERFORMERS_TTL_MINUTES || 30);
const headers = { "User-Agent": "Mozilla/5.0 (NatsCommish league site)", Accept: "application/json" };

const round = (value, places = 1) => Math.round(value * 10 ** places) / 10 ** places;

// ESPN fantasy basketball stat ids.
const nbaStatIds = { pts: 0, blk: 1, stl: 2, ast: 3, reb: 6, to: 11, fgPct: 19, ftPct: 20, threes: 17, min: 40, gp: 42 };

function nbaStats(line) {
  if (!line) return null;
  const averages = line.averageStats || (line.stats?.[nbaStatIds.gp] ? Object.fromEntries(Object.entries(line.stats).map(([id, total]) => [id, total / line.stats[nbaStatIds.gp]])) : {});
  const stats = {};
  for (const [key, id] of Object.entries(nbaStatIds)) {
    const value = averages[id] ?? averages[String(id)];
    if (typeof value === "number") stats[key] = round(value, key.endsWith("Pct") ? 3 : 1);
  }
  return Object.keys(stats).length ? stats : null;
}

// Football stat lines are summarised as fantasy points (PPR scoring from ESPN's default league).
function nflStats(line) {
  if (!line) return null;
  const stats = {};
  if (typeof line.appliedTotal === "number") stats.fpts = round(line.appliedTotal);
  if (typeof line.appliedAverage === "number") stats.avg = round(line.appliedAverage);
  return Object.keys(stats).length ? stats : null;
}

export const sports = {
  basketball: {
    game: "fba",
    scoreboard: "basketball/nba",
    leagueDefaults: 1,
    rankType: "STANDARD",
    limit: Number(process.env.ESPN_PLAYER_LIMIT || 300),
    // ESPN labels a basketball season by the year it ends: October 2026 is the 2027 season.
    season: (now) => (now.getMonth() >= 6 ? now.getFullYear() + 1 : now.getFullYear()),
    positions: { 1: "PG", 2: "SG", 3: "SF", 4: "PF", 5: "C" },
    teams: {
      0: "FA", 1: "ATL", 2: "BOS", 3: "NOP", 4: "CHI", 5: "CLE", 6: "DAL", 7: "DEN", 8: "DET", 9: "GSW", 10: "HOU",
      11: "IND", 12: "LAC", 13: "LAL", 14: "MIA", 15: "MIL", 16: "MIN", 17: "BKN", 18: "NYK", 19: "ORL", 20: "PHI",
      21: "PHX", 22: "POR", 23: "SAC", 24: "SAS", 25: "OKC", 26: "UTA", 27: "WAS", 28: "TOR", 29: "MEM", 30: "CHA",
    },
    statLine: nbaStats,
  },
  football: {
    game: "ffl",
    scoreboard: "football/nfl",
    leagueDefaults: 3,
    rankType: "PPR",
    limit: Number(process.env.ESPN_FOOTBALL_PLAYER_LIMIT || 100),
    // Football seasons are labelled by the year they start; January and February still belong to last year.
    season: (now) => (now.getMonth() < 2 ? now.getFullYear() - 1 : now.getFullYear()),
    positions: { 1: "QB", 2: "RB", 3: "WR", 4: "TE", 5: "K", 16: "D/ST" },
    teams: {
      0: "FA", 1: "ATL", 2: "BUF", 3: "CHI", 4: "CIN", 5: "CLE", 6: "DAL", 7: "DEN", 8: "DET", 9: "GB", 10: "TEN",
      11: "IND", 12: "KC", 13: "LV", 14: "LAR", 15: "MIA", 16: "MIN", 17: "NE", 18: "NO", 19: "NYG", 20: "NYJ",
      21: "PHI", 22: "ARI", 23: "PIT", 24: "LAC", 25: "SF", 26: "SEA", 27: "TB", 28: "WSH", 29: "CAR", 30: "JAX",
      33: "BAL", 34: "HOU",
    },
    statLine: nflStats,
  },
};

export const isSport = (sport) => Object.hasOwn(sports, sport);

export function currentSeason(sport, now = new Date()) {
  if (process.env.ESPN_SEASON && sport === "basketball") return Number(process.env.ESPN_SEASON);
  return sports[sport].season(now);
}

function findLine(stats = [], season, source) {
  return stats.find((entry) => entry.seasonId === season && entry.statSourceId === source && (entry.statSplitTypeId ?? 0) === 0) || null;
}

export function parsePlayer(entry, season, sport = "basketball") {
  const config = sports[sport];
  const player = entry.player || entry;
  const ranks = player.draftRanksByRankType || {};
  const ownership = player.ownership || {};
  return {
    id: player.id,
    sport,
    name: player.fullName || `${player.firstName ?? ""} ${player.lastName ?? ""}`.trim(),
    team: config.teams[player.proTeamId] || "FA",
    position: config.positions[player.defaultPositionId] || "",
    jersey: player.jersey || "",
    injuryStatus: player.injuryStatus || (player.injured ? "INJURED" : "ACTIVE"),
    injured: Boolean(player.injured),
    espnRank: ranks[config.rankType]?.rank ?? ranks.STANDARD?.rank ?? null,
    rotoRank: ranks.ROTO?.rank ?? null,
    adp: typeof ownership.averageDraftPosition === "number" && ownership.averageDraftPosition > 0 ? round(ownership.averageDraftPosition) : null,
    auctionValue: typeof ownership.auctionValueAverage === "number" ? round(ownership.auctionValueAverage) : null,
    rostered: typeof ownership.percentOwned === "number" ? round(ownership.percentOwned) : null,
    outlook: player.seasonOutlook || "",
    lastSeason: config.statLine(findLine(player.stats, season - 1, 0)),
    thisSeason: config.statLine(findLine(player.stats, season, 0)),
    projected: config.statLine(findLine(player.stats, season, 1)),
  };
}

async function fetchPlayers(sport, season) {
  const config = sports[sport];
  const filter = {
    players: {
      limit: config.limit,
      sortDraftRanks: { sortPriority: 100, sortAsc: true, value: config.rankType },
      filterStatsForExternalIds: { value: [season - 1, season] },
      filterStatsForSourceIds: { value: [0, 1] },
      filterStatsForSplitTypeIds: { value: [0] },
    },
  };
  const response = await fetch(`${FANTASY_API}/${config.game}/seasons/${season}/segments/0/leaguedefaults/${config.leagueDefaults}?view=kona_player_info`, {
    headers: { ...headers, "X-Fantasy-Filter": JSON.stringify(filter) },
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error(`ESPN ${sport} players request failed with ${response.status}`);
  const body = await response.json();
  return (body.players || []).map((entry) => parsePlayer(entry, season, sport)).filter((player) => player.id && player.name);
}

const refreshing = {};
const playersPayload = {};

export function refreshPlayers(sport, { force = false } = {}) {
  const last = Number(getMeta(`players_refreshed_at:${sport}`) || 0);
  if (!force && Date.now() - last < REFRESH_HOURS * 3600_000) return Promise.resolve(false);
  refreshing[sport] ??= (async () => {
    try {
      let season = currentSeason(sport);
      let players = await fetchPlayers(sport, season);
      if (!players.length) players = await fetchPlayers(sport, --season);
      if (!players.length) throw new Error("ESPN returned no players");
      const ranked = players
        .map((player, index) => ({ player, sort: player.espnRank ?? 10000 + index }))
        .sort((a, b) => a.sort - b.sort)
        .slice(0, sports[sport].limit);
      transaction(() => {
        db.prepare("DELETE FROM players WHERE sport = ?").run(sport);
        const insert = db.prepare("INSERT OR REPLACE INTO players (sport, id, sort_rank, data) VALUES (?, ?, ?, ?)");
        ranked.forEach(({ player }, index) => insert.run(sport, player.id, index, JSON.stringify(player)));
        setMeta(`players_refreshed_at:${sport}`, Date.now());
        setMeta(`players_season:${sport}`, season);
        setMeta(`players_error:${sport}`, "");
      });
      delete playersPayload[sport];
      console.log(`[espn] cached ${ranked.length} ${sport} players for season ${season}`);
      return true;
    } catch (error) {
      setMeta(`players_error:${sport}`, error.message);
      console.error(`[espn] ${sport} refresh failed: ${error.message}`);
      return false;
    } finally {
      delete refreshing[sport];
    }
  })();
  return refreshing[sport];
}

export function startPlayerRefreshSchedule() {
  // One sport at a time so the box never does two big ESPN pulls at once.
  const run = async () => {
    for (const sport of Object.keys(sports)) await refreshPlayers(sport);
  };
  run();
  // Check hourly; ESPN is only called once a cache is older than ESPN_REFRESH_HOURS.
  setInterval(run, 3600_000).unref();
}

// The list view only needs a slim slice of each player; the full record is served per player card.
export function getPlayersPayload(sport) {
  if (playersPayload[sport]) return playersPayload[sport];
  const players = db.prepare("SELECT data FROM players WHERE sport = ? ORDER BY sort_rank").all(sport).map(({ data }) => {
    const p = JSON.parse(data);
    const line = p.projected || p.lastSeason || {};
    const slim = { id: p.id, name: p.name, team: p.team, position: p.position, injuryStatus: p.injuryStatus, espnRank: p.espnRank, adp: p.adp, rostered: p.rostered };
    if (sport === "basketball") Object.assign(slim, { pts: line.pts ?? null, reb: line.reb ?? null, ast: line.ast ?? null });
    else Object.assign(slim, { fpts: p.thisSeason?.fpts ?? null, avg: p.thisSeason?.avg ?? null, projAvg: p.projected?.avg ?? null });
    return slim;
  });
  playersPayload[sport] = JSON.stringify({
    updatedAt: Number(getMeta(`players_refreshed_at:${sport}`) || 0) || null,
    season: Number(getMeta(`players_season:${sport}`) || currentSeason(sport)),
    error: getMeta(`players_error:${sport}`) || null,
    players,
  });
  return playersPayload[sport];
}

export function getPlayer(sport, id) {
  const row = db.prepare("SELECT data FROM players WHERE sport = ? AND id = ?").get(sport, id);
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
export async function getPlayerNews(sport, id) {
  const cached = db.prepare("SELECT fetched_at, data FROM player_news WHERE sport = ? AND player_id = ?").get(sport, id);
  if (cached && Date.now() - cached.fetched_at < NEWS_TTL_MINUTES * 60_000) return JSON.parse(cached.data);
  try {
    const response = await fetch(`${NEWS_API}/${sports[sport].game}/news/players?limit=6&playerId=${id}`, { headers, signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error(`ESPN news request failed with ${response.status}`);
    const news = parseNews(await response.json());
    db.prepare("INSERT INTO player_news (sport, player_id, fetched_at, data) VALUES (?, ?, ?, ?) ON CONFLICT(sport, player_id) DO UPDATE SET fetched_at = excluded.fetched_at, data = excluded.data")
      .run(sport, id, Date.now(), JSON.stringify(news));
    return news;
  } catch (error) {
    console.error(`[espn] news for ${sport} ${id} failed: ${error.message}`);
    return cached ? JSON.parse(cached.data) : [];
  }
}

// ---- Top performers: one ESPN scoreboard request, cached, read from each game's stat leaders. ----

const performerCategories = {
  basketball: [["rating", "Best overall"], ["points", "Points"], ["rebounds", "Rebounds"], ["assists", "Assists"]],
  football: [["passingYards", "Passing"], ["rushingYards", "Rushing"], ["receivingYards", "Receiving"]],
};

const etDate = (date) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(date).replace(/-/g, "");

export function parsePerformers(sport, body) {
  const wanted = new Map(performerCategories[sport]);
  const lists = Object.fromEntries([...wanted.keys()].map((key) => [key, []]));
  let games = 0;
  for (const event of body.events || []) {
    const competition = event.competitions?.[0];
    if (!competition) continue;
    const state = competition.status?.type?.state || event.status?.type?.state;
    if (state === "pre") continue;
    games += 1;
    const teamsById = Object.fromEntries((competition.competitors || []).map((c) => [String(c.team?.id ?? c.id), c.team?.abbreviation || ""]));
    const groups = [
      ...(competition.leaders || []).map((group) => ({ group, team: null })),
      ...(competition.competitors || []).flatMap((c) => (c.leaders || []).map((group) => ({ group, team: c.team?.abbreviation || "" }))),
    ];
    for (const { group, team } of groups) {
      if (!wanted.has(group.name)) continue;
      for (const leader of group.leaders || []) {
        const athlete = leader.athlete || {};
        if (!athlete.id || typeof leader.value !== "number") continue;
        lists[group.name].push({
          id: Number(athlete.id),
          name: athlete.displayName || athlete.fullName || athlete.shortName || "",
          team: team || teamsById[String(athlete.team?.id)] || "",
          position: athlete.position?.abbreviation || "",
          value: leader.value,
          line: leader.displayValue || String(leader.value),
          game: event.shortName || "",
          live: state === "in",
        });
      }
    }
  }
  const categories = [...wanted.entries()].map(([key, label]) => {
    const seen = new Set();
    const leaders = lists[key]
      .sort((a, b) => b.value - a.value)
      .filter((entry) => !seen.has(entry.id) && seen.add(entry.id))
      .slice(0, 5);
    return { key, label, leaders };
  }).filter((category) => category.leaders.length);
  return { games, categories };
}

async function fetchScoreboard(sport, query = "") {
  const response = await fetch(`${SCOREBOARD_API}/${sports[sport].scoreboard}/scoreboard${query}`, { headers, signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`ESPN scoreboard request failed with ${response.status}`);
  return response.json();
}

async function loadPerformers(sport) {
  if (sport === "basketball") {
    // Today's games once any have tipped off, otherwise last night's.
    const today = new Date();
    let body = await fetchScoreboard(sport, `?dates=${etDate(today)}`);
    let result = parsePerformers(sport, body);
    let label = "Today";
    if (!result.categories.length) {
      const yesterday = new Date(today.getTime() - 86400_000);
      body = await fetchScoreboard(sport, `?dates=${etDate(yesterday)}`);
      result = parsePerformers(sport, body);
      label = "Yesterday";
    }
    return { ...result, label };
  }
  // Football: the current week, or last week before this week's games have started.
  let body = await fetchScoreboard(sport);
  let result = parsePerformers(sport, body);
  const week = body.week?.number;
  const seasonType = body.season?.type ?? 2;
  let label = week ? `Week ${week}` : "This week";
  if (!result.categories.length && week > 1) {
    body = await fetchScoreboard(sport, `?week=${week - 1}&seasontype=${seasonType}`);
    result = parsePerformers(sport, body);
    label = `Week ${week - 1}`;
  }
  return { ...result, label };
}

const performersInFlight = {};

export async function getPerformers(sport) {
  const cached = db.prepare("SELECT fetched_at, data FROM performers WHERE sport = ?").get(sport);
  if (cached && Date.now() - cached.fetched_at < PERFORMERS_TTL_MINUTES * 60_000) return cached.data;
  try {
    performersInFlight[sport] ??= loadPerformers(sport).finally(() => delete performersInFlight[sport]);
    const result = await performersInFlight[sport];
    const inRankings = db.prepare("SELECT 1 FROM players WHERE sport = ? AND id = ?");
    result.categories.forEach((category) => category.leaders.forEach((leader) => { leader.card = Boolean(inRankings.get(sport, leader.id)); }));
    const data = JSON.stringify({ ...result, updatedAt: Date.now() });
    db.prepare("INSERT INTO performers (sport, fetched_at, data) VALUES (?, ?, ?) ON CONFLICT(sport) DO UPDATE SET fetched_at = excluded.fetched_at, data = excluded.data")
      .run(sport, Date.now(), data);
    return data;
  } catch (error) {
    console.error(`[espn] ${sport} performers failed: ${error.message}`);
    return cached ? cached.data : JSON.stringify({ games: 0, categories: [], label: "", error: error.message });
  }
}
