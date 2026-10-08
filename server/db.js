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
  // Sessions used to be commissioner-only; now every session belongs to an account.
  const sessionColumns = db.prepare("PRAGMA table_info(sessions)").all().map((column) => column.name);
  if (sessionColumns.length && !sessionColumns.includes("user_id")) db.exec("DROP TABLE sessions;");
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
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    name_key TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    is_commish INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS announcements (
    league TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS forum_threads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    league TEXT NOT NULL,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    last_activity INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS forum_threads_league ON forum_threads (league, last_activity DESC);
  CREATE TABLE IF NOT EXISTS forum_posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    thread_id INTEGER NOT NULL REFERENCES forum_threads(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    body TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS forum_posts_thread ON forum_posts (thread_id, created_at);
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

// The commissioner's daily announcement, editable from the site. Both leagues start with the same message.
const seedAnnouncement = {
  title: "Daily League Update 🫡",
  body: `The website is starting to come together and become a lot more polished. We’re still in the developing stages, though, so I’m completely open to **feedback across the board**. If there’s anything you think could be improved, added, changed, or just made easier to use, feel free to let me know. The goal is to make this something everyone actually enjoys using.

Also, reminder that our **league meeting will be at 2:30 PM at Austin’s house**. Please try to be there so we can get everything sorted out and keep things moving.

If you have any questions, concerns, or suggestions about anything league-related, **ping me directly** and I’ll get back to you.

Lastly, I just want to say that I really appreciate everyone being a part of this. We’re still getting everything started, but I’m excited to see what this league becomes, and I’m glad we’re all doing it together. ❤️

**See you guys at the meeting.**`,
};

if (!getMeta("announcement_seeded")) {
  const insert = db.prepare("INSERT OR IGNORE INTO announcements (league, title, body, updated_at) VALUES (?, ?, ?, ?)");
  ["basketball", "football"].forEach((league) => insert.run(league, seedAnnouncement.title, seedAnnouncement.body, Date.now()));
  setMeta("announcement_seeded", Date.now());
}
