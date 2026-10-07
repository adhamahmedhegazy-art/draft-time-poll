import { createServer } from "node:http";
import { randomBytes, createHash, timingSafeEqual } from "node:crypto";
import { db, transaction } from "./db.js";
import { getPerformers, getPlayer, getPlayerNews, getPlayersPayload, isSport, refreshPlayers, startPlayerRefreshSchedule } from "./espn.js";

const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || "127.0.0.1";
const PASSWORD = process.env.COMMISH_PASSWORD || "";
const SESSION_DAYS = 30;
const leagues = new Set(["basketball", "football"]);

if (!PASSWORD) console.warn("[commish] COMMISH_PASSWORD is not set, so commissioner editing is disabled.");

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

function isCommish(req) {
  const token = parseCookies(req).nc_commish;
  if (!token) return false;
  const hash = createHash("sha256").update(token).digest("hex");
  return Boolean(db.prepare("SELECT 1 FROM sessions WHERE token = ? AND expires_at > ?").get(hash, Date.now()));
}

function requireCommish(req) {
  if (!isCommish(req)) throw new HttpError(401, "Commissioner login required");
}

function requireLeague(league) {
  if (!leagues.has(league)) throw new HttpError(404, "Unknown league");
  return league;
}

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
  const voterToken = parseCookies(req).nc_voter || "";
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
  ["GET", /^\/api\/session$/, (req) => ({ commish: isCommish(req), editingEnabled: Boolean(PASSWORD) })],

  ["POST", /^\/api\/login$/, async (req, res) => {
    checkLoginRate(req.headers["x-forwarded-for"]?.split(",")[0].trim() || req.socket.remoteAddress);
    const { password } = await readJson(req);
    const given = Buffer.from(String(password ?? ""));
    const expected = Buffer.from(PASSWORD);
    if (!PASSWORD || given.length !== expected.length || !timingSafeEqual(given, expected)) throw new HttpError(401, "Wrong password");
    const token = randomBytes(32).toString("hex");
    db.prepare("DELETE FROM sessions WHERE expires_at < ?").run(Date.now());
    db.prepare("INSERT INTO sessions (token, expires_at) VALUES (?, ?)").run(createHash("sha256").update(token).digest("hex"), Date.now() + SESSION_DAYS * 86400_000);
    res.setHeader("Set-Cookie", cookie(req, "nc_commish", token, SESSION_DAYS * 86400));
    return { commish: true };
  }],

  ["POST", /^\/api\/logout$/, (req, res) => {
    const token = parseCookies(req).nc_commish;
    if (token) db.prepare("DELETE FROM sessions WHERE token = ?").run(createHash("sha256").update(token).digest("hex"));
    res.setHeader("Set-Cookie", cookie(req, "nc_commish", "", 0));
    return { commish: false };
  }],

  ["GET", /^\/api\/leagues\/(\w+)$/, (req, res, [league]) => {
    requireLeague(league);
    return {
      polls: pollsFor(req, league),
      trades: db.prepare("SELECT id, time_label AS time, team_a AS a, team_b AS b, give, get, tag FROM trades WHERE league = ? ORDER BY created_at DESC, id DESC").all(league),
      standings: db.prepare("SELECT team, manager, record, points FROM standings WHERE league = ? ORDER BY position").all(league),
    };
  }],

  ["POST", /^\/api\/polls\/([\w-]+)\/vote$/, async (req, res, [pollId]) => {
    const poll = db.prepare("SELECT league, options FROM polls WHERE id = ?").get(pollId);
    if (!poll) throw new HttpError(404, "Poll not found");
    const { option, name } = await readJson(req);
    const optionIndex = Number(option);
    if (!Number.isInteger(optionIndex) || optionIndex < 0 || optionIndex >= JSON.parse(poll.options).length) throw new HttpError(400, "Pick one of the options");
    const voterName = clean(name, 40);
    if (voterName.length < 2) throw new HttpError(400, "Enter your name to vote");
    let voterToken = parseCookies(req).nc_voter;
    if (!voterToken || !/^[a-f0-9]{48}$/.test(voterToken)) {
      voterToken = randomBytes(24).toString("hex");
    }
    res.setHeader("Set-Cookie", cookie(req, "nc_voter", voterToken, 2 * 365 * 86400));
    const nameKey = voterName.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (!nameKey) throw new HttpError(400, "Enter your name to vote");
    if (db.prepare("SELECT 1 FROM votes WHERE poll_id = ? AND voter_token = ?").get(pollId, voterToken)) throw new HttpError(409, "You already voted in this poll");
    if (db.prepare("SELECT 1 FROM votes WHERE poll_id = ? AND name_key = ?").get(pollId, nameKey)) throw new HttpError(409, `${voterName} already voted in this poll`);
    try {
      db.prepare("INSERT INTO votes (poll_id, option_index, voter_token, voter_name, name_key, created_at) VALUES (?, ?, ?, ?, ?, ?)")
        .run(pollId, optionIndex, voterToken, voterName, nameKey, Date.now());
    } catch {
      throw new HttpError(409, "You already voted in this poll");
    }
    return { polls: pollsFor({ headers: { ...req.headers, cookie: `nc_voter=${voterToken}; ${req.headers.cookie || ""}` } }, poll.league) };
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

  ["GET", /^\/api\/(basketball|football)\/players$/, (req, res, [sport]) => {
    send(res, 200, getPlayersPayload(sport), { "Cache-Control": "public, max-age=300" });
  }],

  ["GET", /^\/api\/(basketball|football)\/players\/(\d+)$/, async (req, res, [sport, id]) => {
    const player = getPlayer(sport, Number(id));
    if (!player) throw new HttpError(404, "Player not found");
    return { player, news: await getPlayerNews(sport, Number(id)) };
  }],

  ["GET", /^\/api\/(basketball|football)\/performers$/, async (req, res, [sport]) => {
    send(res, 200, await getPerformers(sport), { "Cache-Control": "public, max-age=300" });
  }],

  ["POST", /^\/api\/(basketball|football)\/players\/refresh$/, async (req, res, [sport]) => {
    requireCommish(req);
    if (!isSport(sport)) throw new HttpError(404, "Unknown league");
    return { refreshed: await refreshPlayers(sport, { force: true }) };
  }],
];

const server = createServer(async (req, res) => {
  const { pathname } = new URL(req.url, "http://localhost");
  try {
    for (const [method, pattern, handler] of routes) {
      const match = pathname.match(pattern);
      if (!match || req.method !== method) continue;
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
