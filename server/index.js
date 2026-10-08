import { createServer } from "node:http";
import { randomBytes, createHash, scryptSync, timingSafeEqual } from "node:crypto";
import { db, transaction } from "./db.js";
import { getPerformers, getPlayer, getPlayerNews, getPlayersPayload, isSport, refreshPlayers, startPlayerRefreshSchedule } from "./espn.js";

const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || "127.0.0.1";
const PASSWORD = process.env.COMMISH_PASSWORD || "";
const COMMISH_NAME = process.env.COMMISH_USERNAME || "Adham";
const INVITE_CODE = process.env.LEAGUE_INVITE_CODE || "";
const SESSION_DAYS = 60;
const leagues = new Set(["basketball", "football"]);

const nameKeyOf = (name) => String(name).toLowerCase().replace(/[^a-z0-9]/g, "");

function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(password, salt, 32).toString("hex")}`;
}

function checkPassword(password, stored) {
  const [salt, hash] = String(stored).split(":");
  if (!salt || !hash) return false;
  return timingSafeEqual(scryptSync(password, salt, 32), Buffer.from(hash, "hex"));
}

// The commissioner signs in like everyone else, as COMMISH_USERNAME with COMMISH_PASSWORD.
if (PASSWORD) {
  const key = nameKeyOf(COMMISH_NAME);
  const existing = db.prepare("SELECT id FROM users WHERE name_key = ?").get(key);
  if (existing) db.prepare("UPDATE users SET name = ?, password_hash = ?, is_commish = 1 WHERE id = ?").run(COMMISH_NAME, hashPassword(PASSWORD), existing.id);
  else db.prepare("INSERT INTO users (name, name_key, password_hash, is_commish, created_at) VALUES (?, ?, ?, 1, ?)").run(COMMISH_NAME, key, hashPassword(PASSWORD), Date.now());
} else {
  console.warn("[commish] COMMISH_PASSWORD is not set, so there is no commissioner account.");
}

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function parseCookies(req) {
  return Object.fromEntries((req.headers.cookie || "").split(";").map((part) => part.trim().split("=")).filter(([key]) => key).map(([key, ...value]) => [key, decodeURIComponent(value.join("="))]));
}

function cookie(req, name, value, maxAgeSeconds) {
  const secure = req.headers["x-forwarded-proto"] === "https" ? "; Secure" : "";
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure}`;
}

function send(res, status, body, extraHeaders = {}) {
  const payload = typeof body === "string" ? body : JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...extraHeaders });
  res.end(payload);
}

async function readJson(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 64_000) throw new HttpError(413, "Request too large");
    chunks.push(chunk);
  }
  try {
    return chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {};
  } catch {
    throw new HttpError(400, "Invalid JSON");
  }
}

const clean = (value, max = 120) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);

const tokenHash = (token) => createHash("sha256").update(token).digest("hex");

function currentUser(req) {
  if (req.user !== undefined) return req.user;
  const token = parseCookies(req).nc_session;
  req.user = token
    ? db.prepare("SELECT users.id, users.name, users.is_commish FROM sessions JOIN users ON users.id = sessions.user_id WHERE sessions.token = ? AND sessions.expires_at > ?").get(tokenHash(token), Date.now()) ?? null
    : null;
  return req.user;
}

const isCommish = (req) => Boolean(currentUser(req)?.is_commish);

function requireUser(req) {
  const user = currentUser(req);
  if (!user) throw new HttpError(401, "Sign in to continue");
  return user;
}

function requireCommish(req) {
  if (!isCommish(req)) throw new HttpError(403, "Only the commissioner can do that");
}

function startSession(req, res, userId) {
  const token = randomBytes(32).toString("hex");
  db.prepare("DELETE FROM sessions WHERE expires_at < ?").run(Date.now());
  db.prepare("INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)").run(tokenHash(token), userId, Date.now() + SESSION_DAYS * 86400_000);
  res.setHeader("Set-Cookie", cookie(req, "nc_session", token, SESSION_DAYS * 86400));
}

const publicUser = (user) => user ? { name: user.name, commish: Boolean(user.is_commish) } : null;

function requireLeague(league) {
  if (!leagues.has(league)) throw new HttpError(404, "Unknown league");
  return league;
}

const clientIp = (req) => req.headers["x-forwarded-for"]?.split(",")[0].trim() || req.socket.remoteAddress;

// Simple in-memory brake on password guessing.
const loginAttempts = new Map();
function checkLoginRate(ip) {
  const now = Date.now();
  const recent = (loginAttempts.get(ip) || []).filter((time) => now - time < 15 * 60_000);
  if (recent.length >= 10) throw new HttpError(429, "Too many attempts. Try again later.");
  recent.push(now);
  loginAttempts.set(ip, recent);
}

function pollsFor(req, league) {
  const user = currentUser(req);
  const voterToken = user ? `user:${user.id}` : "";
  const commish = isCommish(req);
  const polls = db.prepare("SELECT * FROM polls WHERE league = ? ORDER BY position").all(league);
  const counts = db.prepare("SELECT option_index, COUNT(*) AS total FROM votes WHERE poll_id = ? GROUP BY option_index");
  const mine = db.prepare("SELECT option_index FROM votes WHERE poll_id = ? AND voter_token = ?");
  const voters = db.prepare("SELECT voter_name AS name, option_index AS option FROM votes WHERE poll_id = ? ORDER BY created_at");
  return polls.map((poll) => {
    const options = JSON.parse(poll.options);
    const votes = options.map(() => 0);
    counts.all(poll.id).forEach(({ option_index, total }) => { votes[option_index] = total; });
    const myVote = voterToken ? mine.get(poll.id, voterToken)?.option_index ?? null : null;
    return {
      id: poll.id,
      question: poll.question,
      deadline: poll.deadline,
      options,
      // Results stay hidden until you vote, so nobody just follows the crowd.
      votes: myVote !== null || commish ? votes : null,
      total: votes.reduce((sum, count) => sum + count, 0),
      myVote,
      voters: commish ? voters.all(poll.id) : undefined,
    };
  });
}

const routes = [
  ["GET", /^\/api\/session$/, (req) => ({ user: publicUser(currentUser(req)), inviteRequired: Boolean(INVITE_CODE) })],

  ["POST", /^\/api\/register$/, async (req, res) => {
    checkLoginRate(clientIp(req));
    const body = await readJson(req);
    const name = clean(body.name, 24);
    const password = String(body.password ?? "");
    if (INVITE_CODE && clean(body.invite, 60) !== INVITE_CODE) throw new HttpError(403, "That league code isn't right. Ask the Commish for it.");
    if (name.length < 2 || !nameKeyOf(name)) throw new HttpError(400, "Pick a name with at least 2 letters or numbers");
    if (password.length < 6) throw new HttpError(400, "Use a password with at least 6 characters");
    if (db.prepare("SELECT 1 FROM users WHERE name_key = ?").get(nameKeyOf(name))) throw new HttpError(409, "That name is taken. If it's you, sign in instead.");
    const { lastInsertRowid } = db.prepare("INSERT INTO users (name, name_key, password_hash, created_at) VALUES (?, ?, ?, ?)").run(name, nameKeyOf(name), hashPassword(password), Date.now());
    startSession(req, res, Number(lastInsertRowid));
    return { user: { name, commish: false } };
  }],

  ["POST", /^\/api\/login$/, async (req, res) => {
    checkLoginRate(clientIp(req));
    const body = await readJson(req);
    const user = db.prepare("SELECT * FROM users WHERE name_key = ?").get(nameKeyOf(body.name ?? ""));
    if (!user || !checkPassword(String(body.password ?? ""), user.password_hash)) throw new HttpError(401, "Wrong name or password");
    startSession(req, res, user.id);
    return { user: publicUser(user) };
  }],

  ["POST", /^\/api\/logout$/, (req, res) => {
    const token = parseCookies(req).nc_session;
    if (token) db.prepare("DELETE FROM sessions WHERE token = ?").run(tokenHash(token));
    res.setHeader("Set-Cookie", cookie(req, "nc_session", "", 0));
    return { user: null };
  }],

  ["GET", /^\/api\/leagues\/(\w+)$/, (req, res, [league]) => {
    requireLeague(league);
    return {
      announcement: db.prepare("SELECT title, body, updated_at AS updatedAt FROM announcements WHERE league = ?").get(league) || null,
      polls: pollsFor(req, league),
      trades: db.prepare("SELECT id, time_label AS time, team_a AS a, team_b AS b, give, get, tag FROM trades WHERE league = ? ORDER BY created_at DESC, id DESC").all(league),
      moves: db.prepare("SELECT id, time_label AS time, team, kind, added, dropped FROM moves WHERE league = ? ORDER BY created_at DESC, id DESC LIMIT 200").all(league),
      standings: db.prepare("SELECT team, manager, record, points FROM standings WHERE league = ? ORDER BY position").all(league),
    };
  }],

  ["POST", /^\/api\/polls\/([\w-]+)\/vote$/, async (req, res, [pollId]) => {
    const user = currentUser(req);
    const poll = db.prepare("SELECT league, options FROM polls WHERE id = ?").get(pollId);
    if (!poll) throw new HttpError(404, "Poll not found");
    const { option } = await readJson(req);
    const optionIndex = Number(option);
    if (!Number.isInteger(optionIndex) || optionIndex < 0 || optionIndex >= JSON.parse(poll.options).length) throw new HttpError(400, "Pick one of the options");
    try {
      db.prepare("INSERT INTO votes (poll_id, option_index, voter_token, voter_name, name_key, created_at) VALUES (?, ?, ?, ?, ?, ?)")
        .run(pollId, optionIndex, `user:${user.id}`, user.name, nameKeyOf(user.name), Date.now());
    } catch {
      throw new HttpError(409, "You already voted in this poll");
    }
    return { polls: pollsFor(req, poll.league) };
  }],

  ["DELETE", /^\/api\/polls\/([\w-]+)\/votes\/(.+)$/, (req, res, [pollId, name]) => {
    requireCommish(req);
    db.prepare("DELETE FROM votes WHERE poll_id = ? AND name_key = ?").run(pollId, decodeURIComponent(name).toLowerCase().replace(/[^a-z0-9]/g, ""));
    return { ok: true };
  }],

  ["POST", /^\/api\/leagues\/(\w+)\/trades$/, async (req, res, [league]) => {
    requireCommish(req);
    requireLeague(league);
    const body = await readJson(req);
    const trade = { time: clean(body.time, 30), a: clean(body.a, 60), b: clean(body.b, 60), give: clean(body.give, 160), get: clean(body.get, 160), tag: clean(body.tag, 20).toUpperCase() || "ACCEPTED" };
    if (!trade.a || !trade.b || !trade.give || !trade.get) throw new HttpError(400, "Fill in both teams and what each side sends");
    if (!trade.time) trade.time = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" }).toUpperCase();
    db.prepare("INSERT INTO trades (league, time_label, team_a, team_b, give, get, tag, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .run(league, trade.time, trade.a, trade.b, trade.give, trade.get, trade.tag, Date.now());
    return { ok: true };
  }],

  ["DELETE", /^\/api\/trades\/(\d+)$/, (req, res, [id]) => {
    requireCommish(req);
    db.prepare("DELETE FROM trades WHERE id = ?").run(Number(id));
    return { ok: true };
  }],

  ["POST", /^\/api\/leagues\/(\w+)\/moves$/, async (req, res, [league]) => {
    requireCommish(req);
    requireLeague(league);
    const body = await readJson(req);
    const move = { time: clean(body.time, 30), team: clean(body.team, 60), added: clean(body.added, 80), dropped: clean(body.dropped, 80) };
    if (!move.team || (!move.added && !move.dropped)) throw new HttpError(400, "Add the team and at least one player");
    const kinds = ["WAIVER", "ADD/DROP", "ADD", "DROP"];
    move.kind = kinds.includes(String(body.kind).toUpperCase()) ? String(body.kind).toUpperCase() : move.added && move.dropped ? "ADD/DROP" : move.added ? "ADD" : "DROP";
    if (!move.time) move.time = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" }).toUpperCase();
    db.prepare("INSERT INTO moves (league, time_label, team, kind, added, dropped, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(league, move.time, move.team, move.kind, move.added, move.dropped, Date.now());
    return { ok: true };
  }],

  ["DELETE", /^\/api\/moves\/(\d+)$/, (req, res, [id]) => {
    requireCommish(req);
    db.prepare("DELETE FROM moves WHERE id = ?").run(Number(id));
    return { ok: true };
  }],

  ["PUT", /^\/api\/leagues\/(\w+)\/standings$/, async (req, res, [league]) => {
    requireCommish(req);
    requireLeague(league);
    const { standings } = await readJson(req);
    if (!Array.isArray(standings) || standings.length > 40) throw new HttpError(400, "Standings must be a list of up to 40 teams");
    const rows = standings.map((row) => [clean(row.team, 60), clean(row.manager, 40), clean(row.record, 20), clean(row.points, 20)]).filter(([team]) => team);
    transaction(() => {
      db.prepare("DELETE FROM standings WHERE league = ?").run(league);
      const insert = db.prepare("INSERT INTO standings (league, position, team, manager, record, points) VALUES (?, ?, ?, ?, ?, ?)");
      rows.forEach((row, index) => insert.run(league, index, ...row));
    });
    return { ok: true };
  }],

  ["PUT", /^\/api\/leagues\/(\w+)\/announcement$/, async (req, res, [league]) => {
    requireCommish(req);
    requireLeague(league);
    const body = await readJson(req);
    const title = clean(body.title, 120);
    const text = String(body.body ?? "").replace(/\r\n/g, "\n").trim().slice(0, 6000);
    if (!title || !text) throw new HttpError(400, "Add a title and a message");
    const targets = body.bothLeagues ? [...leagues] : [league];
    const save = db.prepare("INSERT INTO announcements (league, title, body, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(league) DO UPDATE SET title = excluded.title, body = excluded.body, updated_at = excluded.updated_at");
    transaction(() => targets.forEach((target) => save.run(target, title, text, Date.now())));
    return { ok: true };
  }],

  ["GET", /^\/api\/leagues\/(\w+)\/forum$/, (req, res, [league]) => {
    requireLeague(league);
    return {
      threads: db.prepare(`
        SELECT t.id, t.title, t.created_at AS createdAt, t.last_activity AS lastActivity, u.name AS author,
          (SELECT COUNT(*) FROM forum_posts p WHERE p.thread_id = t.id) AS replies
        FROM forum_threads t JOIN users u ON u.id = t.user_id
        WHERE t.league = ? ORDER BY t.last_activity DESC LIMIT 100`).all(league),
    };
  }],

  ["POST", /^\/api\/leagues\/(\w+)\/forum$/, async (req, res, [league]) => {
    const user = currentUser(req);
    requireLeague(league);
    const body = await readJson(req);
    const title = clean(body.title, 120);
    const text = String(body.body ?? "").replace(/\r\n/g, "\n").trim().slice(0, 4000);
    if (title.length < 3) throw new HttpError(400, "Give your post a title");
    if (!text) throw new HttpError(400, "Write something first");
    const now = Date.now();
    const { lastInsertRowid } = db.prepare("INSERT INTO forum_threads (league, user_id, title, body, created_at, last_activity) VALUES (?, ?, ?, ?, ?, ?)").run(league, user.id, title, text, now, now);
    return { id: Number(lastInsertRowid) };
  }],

  ["GET", /^\/api\/forum\/(\d+)$/, (req, res, [id]) => {
    const thread = db.prepare("SELECT t.id, t.league, t.title, t.body, t.created_at AS createdAt, t.user_id, u.name AS author FROM forum_threads t JOIN users u ON u.id = t.user_id WHERE t.id = ?").get(Number(id));
    if (!thread) throw new HttpError(404, "That post was deleted");
    const user = currentUser(req);
    const posts = db.prepare("SELECT p.id, p.body, p.created_at AS createdAt, p.user_id, u.name AS author FROM forum_posts p JOIN users u ON u.id = p.user_id WHERE p.thread_id = ? ORDER BY p.created_at").all(thread.id);
    const canDelete = (ownerId) => ownerId === user.id || Boolean(user.is_commish);
    const { user_id: threadOwner, ...rest } = thread;
    return {
      thread: { ...rest, canDelete: canDelete(threadOwner) },
      posts: posts.map(({ user_id: owner, ...post }) => ({ ...post, canDelete: canDelete(owner) })),
    };
  }],

  ["POST", /^\/api\/forum\/(\d+)\/replies$/, async (req, res, [id]) => {
    const user = currentUser(req);
    const thread = db.prepare("SELECT id FROM forum_threads WHERE id = ?").get(Number(id));
    if (!thread) throw new HttpError(404, "That post was deleted");
    const text = String((await readJson(req)).body ?? "").replace(/\r\n/g, "\n").trim().slice(0, 4000);
    if (!text) throw new HttpError(400, "Write something first");
    const now = Date.now();
    db.prepare("INSERT INTO forum_posts (thread_id, user_id, body, created_at) VALUES (?, ?, ?, ?)").run(thread.id, user.id, text, now);
    db.prepare("UPDATE forum_threads SET last_activity = ? WHERE id = ?").run(now, thread.id);
    return { ok: true };
  }],

  ["DELETE", /^\/api\/forum\/(\d+)$/, (req, res, [id]) => {
    const user = currentUser(req);
    const thread = db.prepare("SELECT user_id FROM forum_threads WHERE id = ?").get(Number(id));
    if (thread && thread.user_id !== user.id && !user.is_commish) throw new HttpError(403, "You can only delete your own posts");
    db.prepare("DELETE FROM forum_threads WHERE id = ?").run(Number(id));
    return { ok: true };
  }],

  ["DELETE", /^\/api\/forum\/replies\/(\d+)$/, (req, res, [id]) => {
    const user = currentUser(req);
    const post = db.prepare("SELECT user_id FROM forum_posts WHERE id = ?").get(Number(id));
    if (post && post.user_id !== user.id && !user.is_commish) throw new HttpError(403, "You can only delete your own posts");
    db.prepare("DELETE FROM forum_posts WHERE id = ?").run(Number(id));
    return { ok: true };
  }],

  ["GET", /^\/api\/(basketball|football)\/players$/, (req, res, [sport]) => {
    send(res, 200, getPlayersPayload(sport), { "Cache-Control": "private, max-age=300" });
  }],

  ["GET", /^\/api\/(basketball|football)\/players\/(\d+)$/, async (req, res, [sport, id]) => {
    const player = getPlayer(sport, Number(id));
    if (!player) throw new HttpError(404, "Player not found");
    return { player, news: await getPlayerNews(sport, Number(id)) };
  }],

  ["GET", /^\/api\/(basketball|football)\/performers$/, async (req, res, [sport]) => {
    send(res, 200, await getPerformers(sport), { "Cache-Control": "private, max-age=300" });
  }],

  ["POST", /^\/api\/(basketball|football)\/players\/refresh$/, async (req, res, [sport]) => {
    requireCommish(req);
    if (!isSport(sport)) throw new HttpError(404, "Unknown league");
    return { refreshed: await refreshPlayers(sport, { force: true }) };
  }],
];

const openRoutes = new Set(["/api/session", "/api/register", "/api/login", "/api/logout"]);

const server = createServer(async (req, res) => {
  const { pathname } = new URL(req.url, "http://localhost");
  try {
    for (const [method, pattern, handler] of routes) {
      const match = pathname.match(pattern);
      if (!match || req.method !== method) continue;
      if (!openRoutes.has(pathname)) requireUser(req);
      const result = await handler(req, res, match.slice(1));
      if (!res.headersSent) send(res, 200, result);
      return;
    }
    throw new HttpError(404, "Not found");
  } catch (error) {
    if (!error.status) console.error(error);
    if (!res.headersSent) send(res, error.status || 500, { error: error.status ? error.message : "Something went wrong" });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`[commish] API listening on http://${HOST}:${PORT}`);
  if (process.env.ESPN_DISABLED !== "1") startPlayerRefreshSchedule();
});
