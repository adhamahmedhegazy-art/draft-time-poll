import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

const dbPath = process.env.COMMISH_DB || new URL("../data/commish.db", import.meta.url).pathname;
mkdirSync(dirname(dbPath), { recursive: true });

export const db = new DatabaseSync(dbPath);

// The first version cached basketball players only. Those tables hold nothing but ESPN cache, so rebuild them.
try {
  const columns = db.prepare("PRAGMA table_info(players)").all().map((column) => column.name);
  if (columns.length && !columns.includes("sport")) db.exec("DROP TABLE players; DROP TABLE IF EXISTS player_news; DELETE FROM meta WHERE key LIKE 'players_%';");
} catch { /* fresh database */ }

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA synchronous = NORMAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS polls (
    id TEXT PRIMARY KEY,
    league TEXT NOT NULL,
    position INTEGER NOT NULL,
    question TEXT NOT NULL,
    deadline TEXT NOT NULL,
    options TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS votes (
    poll_id TEXT NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
    option_index INTEGER NOT NULL,
    voter_token TEXT NOT NULL,
    voter_name TEXT NOT NULL,
    name_key TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    UNIQUE (poll_id, voter_token),
    UNIQUE (poll_id, name_key)
  );
  CREATE TABLE IF NOT EXISTS trades (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    league TEXT NOT NULL,
    time_label TEXT NOT NULL,
    team_a TEXT NOT NULL,
    team_b TEXT NOT NULL,
    give TEXT NOT NULL,
    get TEXT NOT NULL,
    tag TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS standings (
    league TEXT NOT NULL,
    position INTEGER NOT NULL,
    team TEXT NOT NULL,
    manager TEXT NOT NULL,
    record TEXT NOT NULL,
    points TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    expires_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS players (
    sport TEXT NOT NULL,
    id INTEGER NOT NULL,
    sort_rank INTEGER NOT NULL,
    data TEXT NOT NULL,
    PRIMARY KEY (sport, id)
  );
  CREATE TABLE IF NOT EXISTS player_news (
    sport TEXT NOT NULL,
    player_id INTEGER NOT NULL,
    fetched_at INTEGER NOT NULL,
    data TEXT NOT NULL,
    PRIMARY KEY (sport, player_id)
  );
  CREATE TABLE IF NOT EXISTS performers (
    sport TEXT PRIMARY KEY,
    fetched_at INTEGER NOT NULL,
    data TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

export function getMeta(key) {
  return db.prepare("SELECT value FROM meta WHERE key = ?").get(key)?.value ?? null;
}

export function setMeta(key, value) {
  db.prepare("INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(key, String(value));
}

export function transaction(fn) {
  db.exec("BEGIN");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

// First-run seed. The original polls are kept (vote counts start fresh because the old numbers were placeholders),
// the basketball Trade Wire and Leaderboard start empty, and football keeps its original entries.
const seedPolls = [
  ["basketball-draft-time", "basketball", "What time should the draft be?", "Vote now", ["2:30 PM", "8:00 PM"]],
  ["basketball-playoffs", "basketball", "How many teams should make the playoffs?", "Closes Friday", ["4 teams", "6 teams", "8 teams"]],
  ["basketball-ir", "basketball", "Add a second IR+ roster spot?", "Closes Sunday", ["Yes, absolutely", "No, embrace the pain"]],
  ["football-deadline", "football", "Move the trade deadline back one week?", "Closes Thursday", ["Move it back", "Keep it as-is"]],
  ["football-kicker", "football", "The eternal question: keep kickers?", "Closes Monday", ["Keep the chaos", "Abolish kickers"]],
];

const seedFootballTrades = [
  ["48 MIN AGO", "Sunday Scaries", "Fourth & Wrong", "J. Jefferson", "J. Gibbs + 2027 1st", "BREAKING"],
  ["MONDAY", "Blitz Brigade", "End Zone Empire", "L. Jackson", "J. Burrow + D. Smith", "ACCEPTED"],
  ["SEP 28", "Fourth & Wrong", "Bench Mob", "D. Henry", "2027 2nd + $18 FAAB", "ACCEPTED"],
];

const seedFootballStandings = [
  ["Sunday Scaries", "Priya", "5–0", "682"],
  ["Fourth & Wrong", "Adham", "4–1", "641"],
  ["Blitz Brigade", "Chris", "3–2", "608"],
  ["End Zone Empire", "Nadia", "3–2", "594"],
  ["Bench Mob", "Omar", "2–3", "551"],
  ["Hail Mary Heroes", "Dev", "1–4", "497"],
];

if (!getMeta("seeded")) {
  transaction(() => {
    const insertPoll = db.prepare("INSERT OR IGNORE INTO polls (id, league, position, question, deadline, options) VALUES (?, ?, ?, ?, ?, ?)");
    seedPolls.forEach(([id, league, question, deadline, options], index) => insertPoll.run(id, league, index, question, deadline, JSON.stringify(options)));
    const insertTrade = db.prepare("INSERT INTO trades (league, time_label, team_a, team_b, give, get, tag, created_at) VALUES ('football', ?, ?, ?, ?, ?, ?, ?)");
    [...seedFootballTrades].reverse().forEach((trade, index) => insertTrade.run(...trade, index));
    const insertStanding = db.prepare("INSERT INTO standings (league, position, team, manager, record, points) VALUES ('football', ?, ?, ?, ?, ?)");
    seedFootballStandings.forEach((row, index) => insertStanding.run(index, ...row));
    setMeta("seeded", Date.now());
  });
}
