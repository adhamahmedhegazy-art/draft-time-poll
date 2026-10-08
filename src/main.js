import "./styles.css";

const icons = {
  basketball: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M5.7 5.7c4.1 4.1 8.5 8.5 12.6 12.6M18.3 5.7c-4.1 4.1-8.5 8.5-12.6 12.6M3 12h18M12 3c2.3 2.6 3.5 5.6 3.5 9S14.3 18.4 12 21M12 3C9.7 5.6 8.5 8.6 8.5 12S9.7 18.4 12 21"/></svg>`,
  football: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.7 3.3C15.5 2.5 10.5 4.1 7 7.6s-5 8.5-4.2 13.1c4.6.8 9.6-.7 13.1-4.2s5.1-8.5 4.8-13.2Z"/><path d="m6.5 17.5 11-11M9 11l4 4m-2-6 4 4"/></svg>`,
  megaphone: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 11 14-6v14L3 13v-2Z"/><path d="M7 15v5h4l1-3M20 9v6"/></svg>`,
  poll: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 20V10m7 10V4m7 16v-7"/></svg>`,
  trade: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h14m-4-4 4 4-4 4M20 17H6m4 4-4-4 4-4"/></svg>`,
  trophy: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 4h8v5a4 4 0 0 1-8 0V4Zm-4 1h4v5C5 10 4 8 4 5Zm16 0h-4v5c3 0 4-2 4-5ZM12 13v4m-4 3h8M9 17h6"/></svg>`,
  heart: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/></svg>`,
  mail: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>`,
  star: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.2l1.1-6.2L3 9.6l6.2-.9L12 3Z"/></svg>`,
  chat: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z"/></svg>`,
  list: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01"/></svg>`,
  arrow: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6"/></svg>`,
};

const leagueData = {
  basketball: {
    label: "Basketball",
    kicker: "Hardwood Headquarters",
    season: "2026–27 Season",
    icon: icons.basketball,
  },
  football: {
    label: "Football",
    kicker: "Gridiron Headquarters",
    season: "2026 Season",
    icon: icons.football,
  },
};

let activeLeague = "basketball";
let activeTab = "announcement";
let user = null;
let sessionChecked = false;
let inviteRequired = false;
let authMode = "register";
let isCommish = false;
const forumState = { basketball: { list: null, open: null, thread: null }, football: { list: null, open: null, thread: null } };
const leagueState = {};
const newRankings = () => ({ data: null, loading: false, query: "", position: "ALL", sort: "rank", shown: 50 });
const rankingsBySport = { basketball: newRankings(), football: newRankings() };
const performersBySport = { basketball: { data: null, loading: false }, football: { data: null, loading: false } };
let rankings = rankingsBySport[activeLeague];
let performers = performersBySport[activeLeague];

const app = document.querySelector("#app");

const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);

async function api(path, options = {}) {
  const response = await fetch(`/api${path}`, {
    ...options,
    credentials: "same-origin",
    headers: options.body ? { "Content-Type": "application/json" } : undefined,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (response.status === 401 && user && !path.startsWith("/login")) {
    setUser(null);
    renderShell();
  }
  if (!response.ok) throw new Error(data.error || "The league office is not answering right now.");
  return data;
}

function setUser(next) {
  user = next;
  isCommish = Boolean(next?.commish);
}

// Light formatting for posts and announcements: **bold**, blank line = new paragraph, line break = <br>.
const richText = (text) => String(text ?? "").trim().split(/\n{2,}/).map((paragraph) =>
  `<p>${esc(paragraph).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/\n/g, "<br>")}</p>`).join("");

const timeAgo = (time) => {
  const minutes = Math.round((Date.now() - time) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 1440) return `${Math.round(minutes / 60)}h ago`;
  return new Date(time).toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

async function loadLeague(key = activeLeague) {
  try {
    leagueState[key] = await api(`/leagues/${key}`);
  } catch (error) {
    leagueState[key] = { error: error.message, polls: [], trades: [], standings: [] };
  }
  if (key === activeLeague) renderTab();
}

function renderShell() {
  app.innerHTML = `
    <header class="site-header">
      <a class="brand" href="#" aria-label="Nats Commish home">
        <span class="brand-mark">NC</span>
        <span><strong>Nats Commish</strong></span>
      </a>
      <div class="header-actions">
        ${user ? `<span class="signed-in">${esc(user.name)}${isCommish ? " · Commish" : ""}</span><button class="text-button" id="logout-button">Log out</button>` : ""}
        <button class="feedback-trigger">${icons.mail}<span>Feedback</span></button>
      </div>
    </header>

    <main>
      <section class="hero">
        <p class="eyebrow">Fantasy League HQ</p>
        <h1>All league. All drama.</h1>
        <p class="hero-copy">Announcements, votes, trades and standings from your commissioner.</p>
      </section>

      ${!user ? renderAuth() : `<section class="league-shell">
        <div class="league-switcher" role="tablist" aria-label="Choose fantasy league">
          ${Object.entries(leagueData).map(([key, league]) => `
            <button class="league-button ${key === activeLeague ? "active" : ""}" data-league="${key}" role="tab" aria-selected="${key === activeLeague}">
              <span class="league-icon">${league.icon}</span>
              <span><small>Fantasy</small>${league.label}</span>
            </button>
          `).join("")}
        </div>
        <div id="league-content"></div>
      </section>`}
    </main>

    <footer>
      <p class="copyright">© 2026 Nats Commish · natscommish.com</p>
      <button class="feedback-trigger footer-link">Send feedback</button>
    </footer>

    <dialog id="feedback-modal">
      <button class="modal-close" aria-label="Close feedback form">×</button>
      <p class="eyebrow">THE COMMISH IS LISTENING</p>
      <h2>Air your grievances.</h2>
      <p>Complaints, recommendations, questionable trade takes—send them all.</p>
      <form id="feedback-form">
        <label>Your name <input name="name" required placeholder="Anonymous coward" /></label>
        <label>League
          <select name="league">
            <option>Basketball</option>
            <option>Football</option>
            <option>Both leagues</option>
          </select>
        </label>
        <label>Complaint or recommendation
          <textarea name="message" required rows="5" placeholder="Respectfully, Commissioner..."></textarea>
        </label>
        <button type="submit" class="send-button">Send to the Commish ${icons.arrow}</button>
        <small>This opens your email app and addresses the message to adham@natscommish.com.</small>
      </form>
    </dialog>

    <dialog id="player-modal" class="player-modal">
      <button class="modal-close" aria-label="Close player card">×</button>
      <div id="player-card"></div>
    </dialog>
  `;
  if (user) renderLeague();
  bindShellEvents();
}

function renderAuth() {
  if (!sessionChecked) return `<section class="auth-shell"><p class="muted">Loading…</p></section>`;
  const register = authMode === "register";
  return `
    <section class="auth-shell">
      <form class="auth-card single-form" id="auth-form">
        <h2>${register ? "Create your account" : "Welcome back"}</h2>
        <p class="muted">${register ? "Everyone in the league signs in with their name, so we know who's voting and posting." : "Sign in with the name and password you picked."}</p>
        <label>Your name <input name="name" required maxlength="24" autocomplete="username" placeholder="What the league calls you" /></label>
        <label>Password <input name="password" type="password" required minlength="${register ? 6 : 1}" autocomplete="${register ? "new-password" : "current-password"}" /></label>
        ${register && inviteRequired ? `<label>League code <input name="invite" required autocomplete="off" placeholder="Ask the Commish" /></label>` : ""}
        <button type="submit" class="send-button">${register ? "Create account" : "Sign in"} ${icons.arrow}</button>
        <small class="form-error" id="auth-error"></small>
        <button type="button" class="text-button auth-switch" id="auth-switch">${register ? "Already have an account? Sign in" : "New here? Create an account"}</button>
      </form>
    </section>
  `;
}

function tabsFor(key) {
  return [
    ["announcement", icons.megaphone, "Commish Announcement"],
    ["polls", icons.poll, "League Polls"],
    ["trades", icons.trade, "Trade Wire"],
    ["leaderboard", icons.trophy, "Leaderboard"],
    ["forum", icons.chat, "Forum"],
    ["performers", icons.star, key === "basketball" ? "Top Today" : "Top This Week"],
    ["rankings", icons.list, key === "basketball" ? "ADP & Rankings" : "Top 100"],
  ];
}

function renderLeague() {
  const league = leagueData[activeLeague];
  const content = document.querySelector("#league-content");
  content.innerHTML = `
    <div class="league-heading">
      <div>
        <p>${league.kicker}</p>
        <h2>${league.label} <span>Fantasy</span></h2>
      </div>
      <span class="season-badge">${league.season}</span>
    </div>
    <nav class="content-tabs" aria-label="${league.label} league pages">
      ${tabsFor(activeLeague).map(([key, icon, label]) => `
        <button class="${activeTab === key ? "active" : ""}" data-tab="${key}" ${activeTab === key ? 'aria-current="page"' : ""}>
          ${icon}<span>${label}</span>
        </button>
      `).join("")}
    </nav>
    <section id="tab-panel" class="tab-panel"></section>
  `;
  renderTab();
  document.querySelectorAll("[data-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      activeTab = button.dataset.tab;
      renderLeague();
    });
  });
}

const loadingPanel = (label) => `<div class="empty-state"><p class="muted">Loading ${label}…</p></div>`;
const errorBanner = (message) => message ? `<p class="form-error banner">${esc(message)}</p>` : "";

function renderTab() {
  const league = leagueData[activeLeague];
  const state = leagueState[activeLeague];
  const panel = document.querySelector("#tab-panel");
  if (!panel) return;
  rankings = rankingsBySport[activeLeague];
  performers = performersBySport[activeLeague];
  const renderers = {
    announcement: () => !state ? loadingPanel("the announcement") : `
      ${isCommish ? renderAnnouncementEditor(state.announcement) : ""}
      ${state.announcement ? `
        <article class="announcement-card">
          <div class="letter">
            <div class="letter-meta"><span>Commish Announcement</span><time>${esc(new Date(state.announcement.updatedAt).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }))}</time></div>
            <h3>${esc(state.announcement.title)}</h3>
            <div class="letter-body">${richText(state.announcement.body)}</div>
          </div>
        </article>
      ` : `<div class="empty-state"><h4>No announcement yet.</h4><p>The Commish posts a new note here every day.</p></div>`}
    `,
    forum: () => renderForum(),
    polls: () => !state ? loadingPanel("polls") : `
      <div class="section-intro">
        <div><p class="eyebrow">League polls</p><h3>Your vote matters</h3></div>
        <span>${state.polls.length} open</span>
      </div>
      ${errorBanner(state.error)}
      <div class="poll-grid">
        ${state.polls.map((poll, index) => renderPoll(poll, index)).join("")}
      </div>
    `,
    trades: () => !state ? loadingPanel("the wire") : `
      <div class="section-intro">
        <div><p class="eyebrow">Trade wire</p><h3>Deals & steals</h3></div>
        <span>${state.trades.length} ${state.trades.length === 1 ? "trade" : "trades"}</span>
      </div>
      ${errorBanner(state.error)}
      ${isCommish ? renderTradeEditor() : ""}
      <div class="trade-list">
        ${state.trades.length ? state.trades.map((trade) => `
          <article class="trade-card">
            <div class="trade-time"><span>${esc(trade.tag)}</span><time>${esc(trade.time)}</time></div>
            <div class="trade-team"><b>${esc(trade.a)}</b><small>SENDS</small><p>${esc(trade.give)}</p></div>
            <div class="trade-arrows">${icons.trade}<span>TRADE</span></div>
            <div class="trade-team right"><b>${esc(trade.b)}</b><small>SENDS</small><p>${esc(trade.get)}</p></div>
            ${isCommish ? `<button class="delete-chip" data-delete-trade="${trade.id}" aria-label="Delete trade">×</button>` : ""}
          </article>
        `).join("") : `<div class="empty-state"><h4>No trades yet.</h4><p>The Commish posts every official deal here.</p></div>`}
      </div>
    `,
    leaderboard: () => !state ? loadingPanel("standings") : `
      <div class="section-intro">
        <div><p class="eyebrow">Leaderboard</p><h3>Standings</h3></div>
        <span>${state.standings.length ? "Official" : "Coming soon"}</span>
      </div>
      ${errorBanner(state.error)}
      ${isCommish ? renderStandingsEditor(state.standings) : state.standings.length ? `
        <div class="leaderboard">
          <div class="table-header"><span>#</span><span>Team</span><span>Record</span><span>Points</span></div>
          ${state.standings.map((team, index) => `
            <div class="standing-row ${index < 3 ? `podium rank-${index + 1}` : ""}">
              <span class="rank"><b>${index + 1}</b></span>
              <span class="team-name"><b>${esc(team.team)}</b><small>${esc(team.manager)}</small></span>
              <strong>${esc(team.record)}</strong>
              <strong>${esc(team.points)}</strong>
            </div>
          `).join("")}
        </div>
      ` : `<div class="empty-state"><h4>The leaderboard is empty.</h4><p>Standings go up once the Commish posts them.</p></div>`}
    `,
    performers: () => renderPerformers(),
    rankings: () => renderRankings(),
  };
  panel.innerHTML = renderers[activeTab]();
  bindTabEvents();
}

function renderPoll(poll, index) {
  const voted = poll.myVote !== null;
  const total = poll.total;
  return `
    <article class="poll-card" data-poll="${esc(poll.id)}">
            <div class="poll-meta"><span>${esc(poll.deadline)}</span><b>${total} ${total === 1 ? "vote" : "votes"}</b></div>
      <h4>${esc(poll.question)}</h4>
      <div class="poll-options">
        ${poll.options.map((option, optionIndex) => {
          const percent = poll.votes && total ? Math.round((poll.votes[optionIndex] / total) * 100) : 0;
          return `
            <button data-option="${optionIndex}" ${voted ? "disabled" : ""} class="${poll.myVote === optionIndex ? "chosen" : ""}">
              <span class="option-radio"></span><b>${esc(option)}</b>
              ${poll.votes ? `<span class="poll-result" style="--result:${percent}%"><i></i><strong>${percent}%${isCommish ? ` · ${poll.votes[optionIndex]}` : ""}</strong></span>` : ""}
            </button>`;
        }).join("")}
      </div>
      <p class="vote-status">${voted ? "✓ Vote locked in" : `One vote per person. You\u2019re voting as ${esc(user?.name)}.`}</p>
      ${isCommish && poll.voters?.length ? `
        <div class="voter-list">
          <p class="eyebrow">WHO VOTED</p>
          ${poll.voters.map((voter) => `<span>${esc(voter.name)} → ${esc(poll.options[voter.option])}<button data-remove-vote="${esc(voter.name)}" aria-label="Remove ${esc(voter.name)}'s vote">×</button></span>`).join("")}
        </div>` : ""}
    </article>
  `;
}

function renderAnnouncementEditor(announcement) {
  return `
    <form class="commish-editor" id="announcement-form">
      <p class="eyebrow">Commish only · Update the daily announcement</p>
      <div class="single-form-fields">
        <label>Title <input name="title" required maxlength="120" value="${esc(announcement?.title ?? "")}" /></label>
        <label>Message <textarea name="body" required rows="10">${esc(announcement?.body ?? "")}</textarea></label>
        <small class="muted">Wrap words in **double stars** for bold. Leave a blank line between paragraphs.</small>
        <label class="check"><input type="checkbox" name="bothLeagues" checked /> Post to both basketball and football</label>
      </div>
      <button type="submit" class="send-button">Publish announcement ${icons.arrow}</button>
      <small class="form-error" id="announcement-error"></small>
    </form>
  `;
}

function loadForum() {
  const sport = activeLeague;
  const state = forumState[sport];
  api(`/leagues/${sport}/forum`)
    .then((data) => { state.list = data.threads; })
    .catch((error) => { state.list = []; state.error = error.message; })
    .finally(() => { if (activeTab === "forum" && activeLeague === sport) renderTab(); });
}

function loadThread(id) {
  const sport = activeLeague;
  const state = forumState[sport];
  state.open = id;
  state.thread = null;
  api(`/forum/${id}`)
    .then((data) => { state.thread = data; })
    .catch((error) => { state.thread = { error: error.message }; })
    .finally(() => { if (activeTab === "forum" && activeLeague === sport) renderTab(); });
}

function renderForum() {
  const state = forumState[activeLeague];
  if (state.open) {
    if (!state.thread) return loadingPanel("the conversation");
    if (state.thread.error) return `<button class="text-button back-link" id="forum-back">← All posts</button><div class="empty-state"><h4>${esc(state.thread.error)}</h4></div>`;
    const { thread, posts } = state.thread;
    return `
      <button class="text-button back-link" id="forum-back">← All posts</button>
      <article class="forum-post forum-op">
        <h3>${esc(thread.title)}</h3>
        <p class="forum-meta"><b>${esc(thread.author)}</b> · ${timeAgo(thread.createdAt)}${thread.canDelete ? ` · <button class="link-button" data-delete-thread="${thread.id}">Delete</button>` : ""}</p>
        <div class="forum-body">${richText(thread.body)}</div>
      </article>
      <div class="forum-replies">
        ${posts.map((post) => `
          <article class="forum-post">
            <p class="forum-meta"><b>${esc(post.author)}</b> · ${timeAgo(post.createdAt)}${post.canDelete ? ` · <button class="link-button" data-delete-reply="${post.id}">Delete</button>` : ""}</p>
            <div class="forum-body">${richText(post.body)}</div>
          </article>`).join("")}
      </div>
      <form class="forum-compose single-form" id="reply-form">
        <label>Reply as ${esc(user.name)} <textarea name="body" required rows="3" maxlength="4000" placeholder="Say something…"></textarea></label>
        <button type="submit" class="send-button">Reply</button>
        <small class="form-error" id="reply-error"></small>
      </form>
    `;
  }
  if (!state.list) {
    loadForum();
    return loadingPanel("the forum");
  }
  return `
    <div class="section-intro">
      <div><p class="eyebrow">Forum</p><h3>Talk it out</h3></div>
      <span>${state.list.length} ${state.list.length === 1 ? "post" : "posts"}</span>
    </div>
    <form class="forum-compose single-form" id="thread-form">
      <label>Start a conversation <input name="title" required maxlength="120" placeholder="Title" /></label>
      <textarea name="body" required rows="3" maxlength="4000" placeholder="What's on your mind?" aria-label="Post"></textarea>
      <button type="submit" class="send-button">Post</button>
      <small class="form-error" id="thread-error"></small>
    </form>
    <div class="forum-list">
      ${state.list.length ? state.list.map((thread) => `
        <button class="forum-item" data-thread="${thread.id}">
          <b>${esc(thread.title)}</b>
          <small>${esc(thread.author)} · ${thread.replies} ${thread.replies === 1 ? "reply" : "replies"} · active ${timeAgo(thread.lastActivity)}</small>
        </button>`).join("") : `<div class="empty-state"><h4>No posts yet.</h4><p>Be the first to start a conversation.</p></div>`}
    </div>
  `;
}

function renderTradeEditor() {
  return `
    <form class="commish-editor" id="trade-form">
      <p class="eyebrow">COMMISH ONLY · POST A TRADE</p>
      <div class="editor-grid">
        <label>Team A <input name="a" required maxlength="60" /></label>
        <label>Team A sends <input name="give" required maxlength="160" /></label>
        <label>Team B <input name="b" required maxlength="60" /></label>
        <label>Team B sends <input name="get" required maxlength="160" /></label>
        <label>Tag <input name="tag" maxlength="20" placeholder="ACCEPTED" /></label>
        <label>When <input name="time" maxlength="30" placeholder="Defaults to today" /></label>
      </div>
      <button type="submit" class="send-button">Post to the wire ${icons.arrow}</button>
      <small class="form-error" id="trade-error"></small>
    </form>
  `;
}

function renderStandingsEditor(standings) {
  const rows = standings.length ? standings : [{ team: "", manager: "", record: "", points: "" }];
  return `
    <form class="commish-editor" id="standings-form">
      <p class="eyebrow">COMMISH ONLY · EDIT THE LEADERBOARD (TOP ROW = 1ST PLACE)</p>
      <div class="standings-editor">
        <div class="standings-edit-row header"><span>#</span><span>Team</span><span>Manager</span><span>Record</span><span>Points</span><span></span></div>
        ${rows.map((row, index) => `
          <div class="standings-edit-row" data-row>
            <span>${index + 1}</span>
            <input name="team" value="${esc(row.team)}" maxlength="60" aria-label="Team" />
            <input name="manager" value="${esc(row.manager)}" maxlength="40" aria-label="Manager" />
            <input name="record" value="${esc(row.record)}" maxlength="20" aria-label="Record" placeholder="0–0" />
            <input name="points" value="${esc(row.points)}" maxlength="20" aria-label="Points" />
            <button type="button" class="delete-chip" data-remove-row aria-label="Remove row">×</button>
          </div>
        `).join("")}
      </div>
      <div class="editor-actions">
        <button type="button" class="ghost-button" id="add-standing">+ Add team</button>
        <button type="submit" class="send-button">Save leaderboard ${icons.arrow}</button>
      </div>
      <small class="form-error" id="standings-error"></small>
    </form>
  `;
}

const injuryLabels = { ACTIVE: "", OUT: "OUT", DAY_TO_DAY: "DTD", INJURY_RESERVE: "IR", SUSPENSION: "SUSP", QUESTIONABLE: "Q", DOUBTFUL: "D", PROBABLE: "P", INJURED: "INJ" };
const injuryText = (status) => status && status !== "ACTIVE" ? status.replace(/_/g, " ") : "Healthy";
const espnSport = { basketball: "nba", football: "nfl" };
const headshot = (sport, id, w = 96, h = 70) => `https://a.espncdn.com/combiner/i?img=/i/headshots/${espnSport[sport]}/players/full/${id}.png&w=${w}&h=${h}&cb=1`;
const fmt = (value, digits = 1) => value === null || value === undefined ? "—" : Number(value).toFixed(digits);
const injuryTag = (status) => injuryLabels[status] ? ` <em class="injury-tag">${injuryLabels[status]}</em>` : "";

const rankingSetup = {
  basketball: {
    title: "ADP & draft rankings",
    positions: ["ALL", "PG", "SG", "SF", "PF", "C"],
    columns: [["ADP", (p) => fmt(p.adp)], ["ROST", (p) => p.rostered === null ? "—" : `${fmt(p.rostered)}%`], ["PTS", (p) => fmt(p.pts)], ["REB", (p) => fmt(p.reb)], ["AST", (p) => fmt(p.ast)]],
    note: (season) => `ESPN Fantasy Basketball rankings and ADP (${season - 1}–${String(season).slice(2)}). Stats are projected per game, or last season when no projection exists.`,
    search: "Search players or team (e.g. LAL)",
  },
  football: {
    title: "Top 100",
    positions: ["ALL", "QB", "RB", "WR", "TE", "K", "D/ST"],
    columns: [["ADP", (p) => fmt(p.adp)], ["ROST", (p) => p.rostered === null ? "—" : `${fmt(p.rostered)}%`], ["FPTS", (p) => fmt(p.fpts)], ["AVG", (p) => fmt(p.avg)], ["PROJ", (p) => fmt(p.projAvg)]],
    note: (season) => `ESPN Fantasy Football PPR rankings (${season} season). FPTS and AVG are this season's PPR points; PROJ is ESPN's projected points per game.`,
    search: "Search players or team (e.g. KC)",
  },
};

function loadRankings() {
  const state = rankings;
  const sport = activeLeague;
  if (state.data || state.loading) return;
  state.loading = true;
  api(`/${sport}/players`)
    .then((data) => { state.data = data; })
    .catch((error) => { state.data = { players: [], error: error.message }; })
    .finally(() => {
      state.loading = false;
      if (activeTab === "rankings" && activeLeague === sport) renderTab();
    });
}

function filteredPlayers() {
  const query = rankings.query.trim().toLowerCase();
  const players = (rankings.data?.players || []).filter((player) =>
    (rankings.position === "ALL" || player.position === rankings.position) &&
    (!query || player.name.toLowerCase().includes(query) || player.team.toLowerCase() === query));
  if (rankings.sort === "adp") return [...players].sort((a, b) => (a.adp ?? 999) - (b.adp ?? 999));
  return players;
}

const updatedLabel = (updatedAt) => updatedAt ? new Date(updatedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : null;

function renderRankings() {
  if (!rankings.data) {
    loadRankings();
    return loadingPanel("ESPN rankings");
  }
  const setup = rankingSetup[activeLeague];
  const { updatedAt, season, error } = rankings.data;
  const players = filteredPlayers();
  const updated = updatedLabel(updatedAt);
  return `
    <div class="section-intro">
      <div><p class="eyebrow">Draft room</p><h3>${setup.title}</h3></div>
      <span>${updated ? `ESPN · Updated ${esc(updated)}` : "ESPN"}</span>
    </div>
    ${!rankings.data.players.length ? `<div class="empty-state"><h4>Rankings are on the way.</h4><p>The server pulls ESPN's rankings on a schedule. ${error ? `Last attempt: ${esc(error)}` : "Check back shortly."}</p>${isCommish ? `<button class="ghost-button" id="refresh-players">Pull from ESPN now</button>` : ""}</div>` : `
      <div class="rank-controls">
        <input type="search" id="rank-search" value="${esc(rankings.query)}" placeholder="${setup.search}" aria-label="Search players" />
        <div class="chip-row" role="group" aria-label="Filter by position">
          ${setup.positions.map((pos) => `<button class="${rankings.position === pos ? "active" : ""}" data-position="${pos}">${pos}</button>`).join("")}
        </div>
        <div class="chip-row" role="group" aria-label="Sort players">
          <button class="${rankings.sort === "rank" ? "active" : ""}" data-sort="rank">Rank</button>
          <button class="${rankings.sort === "adp" ? "active" : ""}" data-sort="adp">ADP</button>
        </div>
      </div>
      <div class="rank-table">
        <div class="rank-row rank-head"><span>#</span><span>Player</span>${setup.columns.map(([label]) => `<span>${label}</span>`).join("")}</div>
        ${players.slice(0, rankings.shown).map((player) => `
          <button class="rank-row" data-player="${player.id}">
            <span class="rank-num">${player.espnRank ?? "—"}</span>
            <span class="rank-player">
              <img src="${headshot(activeLeague, player.id)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'" />
              <span><b>${esc(player.name)}</b><small>${esc(player.team)} · ${esc(player.position)}${injuryTag(player.injuryStatus)}</small></span>
            </span>
            ${setup.columns.map(([, value]) => `<span>${value(player)}</span>`).join("")}
          </button>
        `).join("") || `<div class="empty-state slim"><h4>No players match.</h4></div>`}
      </div>
      ${players.length > rankings.shown ? `<button class="ghost-button show-more" id="show-more">Show more players</button>` : ""}
      <p class="rank-note">${setup.note(season)} Tap a player for the full card.</p>
    `}
  `;
}

function loadPerformers() {
  const state = performers;
  const sport = activeLeague;
  if (state.data || state.loading) return;
  state.loading = true;
  api(`/${sport}/performers`)
    .then((data) => { state.data = data; })
    .catch((error) => { state.data = { categories: [], error: error.message }; })
    .finally(() => {
      state.loading = false;
      if (activeTab === "performers" && activeLeague === sport) renderTab();
    });
}

function renderPerformers() {
  if (!performers.data) {
    loadPerformers();
    return loadingPanel("top performers");
  }
  const { categories, label, games, updatedAt, error } = performers.data;
  const period = activeLeague === "basketball" ? "of the day" : "of the week";
  return `
    <div class="section-intro">
      <div><p class="eyebrow">${esc(label || (activeLeague === "basketball" ? "Today" : "This week"))}${games ? ` · ${games} ${games === 1 ? "game" : "games"}` : ""}</p><h3>Top performers ${period}</h3></div>
      <span>${updatedAt ? `ESPN · Updated ${esc(updatedLabel(updatedAt))}` : "ESPN"}</span>
    </div>
    ${categories.length ? `
      <div class="performer-grid">
        ${categories.map((category) => `
          <section class="performer-card">
            <h4>${esc(category.label)}</h4>
            <ol>
              ${category.leaders.map((leader) => `
                <li>
                  <${leader.card ? `button data-player="${leader.id}"` : "div"} class="performer-row">
                    <img src="${headshot(activeLeague, leader.id, 64, 64)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'" />
                    <span class="performer-name"><b>${esc(leader.name)}</b>${leader.line.length > 8 ? `<span class="performer-stat">${esc(leader.line)}</span>` : ""}<small>${esc([leader.team, leader.position].filter(Boolean).join(" · "))}${leader.game ? ` · ${esc(leader.game)}` : ""}${leader.live ? ` <em class="live-tag">LIVE</em>` : ""}</small></span>
                    <span class="performer-line">${leader.line.length > 8 ? "" : esc(leader.line)}</span>
                  </${leader.card ? "button" : "div"}>
                </li>`).join("")}
            </ol>
          </section>`).join("")}
      </div>
      <p class="rank-note">Game leaders from ESPN box scores, refreshed every 30 minutes.</p>
    ` : `<div class="empty-state"><h4>No games yet.</h4><p>${error ? esc(error) : `Top performers show up here once games ${activeLeague === "basketball" ? "tip off" : "kick off"}.`}</p></div>`}
  `;
}

function statTable(title, stats, sport) {
  if (!stats) return "";
  if (sport === "football") {
    return `
      <div class="stat-block">
        <p class="eyebrow">${title}</p>
        <div class="stat-grid two">
          <span><b>${fmt(stats.fpts)}</b><small>PPR POINTS</small></span>
          <span><b>${fmt(stats.avg)}</b><small>PER GAME</small></span>
        </div>
      </div>
    `;
  }
  const cells = [["PTS", stats.pts], ["REB", stats.reb], ["AST", stats.ast], ["STL", stats.stl], ["BLK", stats.blk], ["3PM", stats.threes], ["TO", stats.to], ["MIN", stats.min]];
  return `
    <div class="stat-block">
      <p class="eyebrow">${title} · per game</p>
      <div class="stat-grid">
        ${cells.map(([label, value]) => `<span><b>${fmt(value)}</b><small>${label}</small></span>`).join("")}
        <span><b>${stats.fgPct === undefined ? "—" : (stats.fgPct * 100).toFixed(1)}</b><small>FG%</small></span>
        <span><b>${stats.ftPct === undefined ? "—" : (stats.ftPct * 100).toFixed(1)}</b><small>FT%</small></span>
      </div>
    </div>
  `;
}

async function openPlayer(id, sport = activeLeague) {
  const modal = document.querySelector("#player-modal");
  const card = document.querySelector("#player-card");
  card.innerHTML = `<p class="eyebrow">Loading…</p>`;
  modal.showModal();
  try {
    const { player, news } = await api(`/${sport}/players/${id}`);
    const injured = player.injuryStatus && player.injuryStatus !== "ACTIVE";
    card.innerHTML = `
      <div class="player-top">
        <img src="${headshot(sport, player.id, 350, 254)}" alt="" onerror="this.style.display='none'" />
        <div>
          <p class="eyebrow">${esc(player.team)} · ${esc(player.position)}${player.jersey ? ` · #${esc(player.jersey)}` : ""}</p>
          <h2>${esc(player.name)}</h2>
          <span class="health-badge ${injured ? "hurt" : ""}">${esc(injuryText(player.injuryStatus))}</span>
        </div>
      </div>
      <div class="player-facts">
        <span><b>${player.espnRank ?? "—"}</b><small>ESPN RANK</small></span>
        <span><b>${fmt(player.adp)}</b><small>ADP</small></span>
        <span><b>${sport === "football" ? fmt(player.auctionValue) : player.rotoRank ?? "—"}</b><small>${sport === "football" ? "AUCTION $" : "ROTO RANK"}</small></span>
        <span><b>${player.rostered === null ? "—" : `${fmt(player.rostered)}%`}</b><small>ROSTERED</small></span>
      </div>
      ${statTable("This season", player.thisSeason, sport)}
      ${statTable("Projected", player.projected, sport)}
      ${statTable("Last season", player.lastSeason, sport)}
      ${player.outlook ? `<div class="player-outlook"><p class="eyebrow">ESPN outlook</p><p>${esc(player.outlook)}</p></div>` : ""}
      <div class="player-news">
        <p class="eyebrow">Latest news</p>
        ${news.length ? news.map((item) => `
          <article>
            ${item.published ? `<time>${esc(new Date(item.published).toLocaleDateString("en-US", { month: "short", day: "numeric" }))}</time>` : ""}
            <h4>${esc(item.headline)}</h4>
            ${item.body ? `<p>${esc(item.body)}</p>` : ""}
            ${item.link ? `<a href="${esc(item.link)}" target="_blank" rel="noopener">Read on ESPN</a>` : ""}
          </article>`).join("") : `<p class="muted">No recent news for this player.</p>`}
      </div>
      <a class="espn-link" href="https://www.espn.com/${espnSport[sport]}/player/_/id/${player.id}" target="_blank" rel="noopener">Full profile on ESPN ${icons.arrow}</a>
    `;
  } catch (error) {
    card.innerHTML = `<p class="form-error">${esc(error.message)}</p>`;
  }
}

function bindShellEvents() {
  document.querySelectorAll("[data-league]").forEach((button) => {
    button.addEventListener("click", () => {
      activeLeague = button.dataset.league;
      activeTab = "announcement";
      if (!leagueState[activeLeague]) loadLeague(activeLeague);
      renderShell();
      document.querySelector(".league-shell").scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });

  document.querySelectorAll("dialog").forEach((modal) => {
    modal.querySelector(".modal-close").addEventListener("click", () => modal.close());
    modal.addEventListener("click", (event) => {
      if (event.target === modal) modal.close();
    });
  });
  const modal = document.querySelector("#feedback-modal");
  document.querySelectorAll(".feedback-trigger").forEach((button) => button.addEventListener("click", () => modal.showModal()));
  document.querySelector("#feedback-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const subject = encodeURIComponent(`[Nats Commish] ${data.get("league")} feedback from ${data.get("name")}`);
    const body = encodeURIComponent(`From: ${data.get("name")}\nLeague: ${data.get("league")}\n\n${data.get("message")}`);
    window.location.href = `mailto:adham@natscommish.com?subject=${subject}&body=${body}`;
  });

  document.querySelector("#auth-switch")?.addEventListener("click", () => {
    authMode = authMode === "register" ? "login" : "register";
    renderShell();
  });
  document.querySelector("#auth-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = event.currentTarget.querySelector("[type=submit]");
    button.disabled = true;
    try {
      const data = await api(authMode === "register" ? "/register" : "/login", { method: "POST", body: Object.fromEntries(new FormData(event.currentTarget)) });
      setUser(data.user);
      Object.keys(leagueState).forEach((key) => delete leagueState[key]);
      renderShell();
      loadLeague();
    } catch (error) {
      document.querySelector("#auth-error").textContent = error.message;
      button.disabled = false;
    }
  });
  document.querySelector("#logout-button")?.addEventListener("click", async () => {
    await api("/logout", { method: "POST" }).catch(() => {});
    setUser(null);
    authMode = "login";
    renderShell();
  });
}

function bindTabEvents() {
  document.querySelector("#announcement-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      await api(`/leagues/${activeLeague}/announcement`, { method: "PUT", body: { title: data.get("title"), body: data.get("body"), bothLeagues: data.get("bothLeagues") === "on" } });
      Object.keys(leagueState).forEach((key) => { if (key !== activeLeague) delete leagueState[key]; });
      loadLeague();
    } catch (error) {
      document.querySelector("#announcement-error").textContent = error.message;
    }
  });

  const forum = forumState[activeLeague];
  document.querySelector("#forum-back")?.addEventListener("click", () => {
    forum.open = null;
    forum.list = null;
    renderTab();
  });
  document.querySelectorAll("[data-thread]").forEach((button) => button.addEventListener("click", () => {
    loadThread(Number(button.dataset.thread));
    renderTab();
  }));
  document.querySelector("#thread-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const { id } = await api(`/leagues/${activeLeague}/forum`, { method: "POST", body: Object.fromEntries(new FormData(event.currentTarget)) });
      loadThread(id);
      renderTab();
    } catch (error) {
      document.querySelector("#thread-error").textContent = error.message;
    }
  });
  document.querySelector("#reply-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      await api(`/forum/${forum.open}/replies`, { method: "POST", body: Object.fromEntries(new FormData(event.currentTarget)) });
      loadThread(forum.open);
    } catch (error) {
      document.querySelector("#reply-error").textContent = error.message;
    }
  });
  document.querySelector("[data-delete-thread]")?.addEventListener("click", async (event) => {
    if (!confirm("Delete this post and all its replies?")) return;
    await api(`/forum/${event.currentTarget.dataset.deleteThread}`, { method: "DELETE" }).catch((error) => alert(error.message));
    forum.open = null;
    forum.list = null;
    renderTab();
  });
  document.querySelectorAll("[data-delete-reply]").forEach((button) => button.addEventListener("click", async () => {
    if (!confirm("Delete this reply?")) return;
    await api(`/forum/replies/${button.dataset.deleteReply}`, { method: "DELETE" }).catch((error) => alert(error.message));
    loadThread(forum.open);
  }));

  document.querySelectorAll("[data-poll] [data-option]").forEach((button) => {
    button.addEventListener("click", async () => {
      const card = button.closest("[data-poll]");
      card.querySelectorAll("[data-option]").forEach((option) => { option.disabled = true; });
      try {
        const { polls } = await api(`/polls/${card.dataset.poll}/vote`, { method: "POST", body: { option: Number(button.dataset.option) } });
        leagueState[activeLeague].polls = polls;
        renderTab();
      } catch (error) {
        await loadLeague();
        const freshStatus = document.querySelector(`[data-poll="${card.dataset.poll}"] .vote-status`);
        if (freshStatus) {
          freshStatus.textContent = error.message;
          freshStatus.classList.add("form-error");
        }
      }
    });
  });

  document.querySelectorAll("[data-remove-vote]").forEach((button) => {
    button.addEventListener("click", async () => {
      if (!confirm(`Remove ${button.dataset.removeVote}'s vote?`)) return;
      await api(`/polls/${button.closest("[data-poll]").dataset.poll}/votes/${encodeURIComponent(button.dataset.removeVote)}`, { method: "DELETE" }).catch((error) => alert(error.message));
      loadLeague();
    });
  });

  document.querySelector("#trade-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      await api(`/leagues/${activeLeague}/trades`, { method: "POST", body: Object.fromEntries(new FormData(event.currentTarget)) });
      loadLeague();
    } catch (error) {
      document.querySelector("#trade-error").textContent = error.message;
    }
  });
  document.querySelectorAll("[data-delete-trade]").forEach((button) => {
    button.addEventListener("click", async () => {
      if (!confirm("Delete this trade from the wire?")) return;
      await api(`/trades/${button.dataset.deleteTrade}`, { method: "DELETE" }).catch((error) => alert(error.message));
      loadLeague();
    });
  });

  const standingsForm = document.querySelector("#standings-form");
  if (standingsForm) {
    const collect = () => [...standingsForm.querySelectorAll("[data-row]")].map((row) =>
      Object.fromEntries([...row.querySelectorAll("input")].map((input) => [input.name, input.value])));
    const redraw = (rows) => {
      leagueState[activeLeague].standings = rows;
      renderTab();
    };
    document.querySelector("#add-standing").addEventListener("click", () => redraw([...collect(), { team: "", manager: "", record: "", points: "" }]));
    standingsForm.querySelectorAll("[data-remove-row]").forEach((button, index) => {
      button.addEventListener("click", () => redraw(collect().filter((_, rowIndex) => rowIndex !== index)));
    });
    standingsForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      try {
        await api(`/leagues/${activeLeague}/standings`, { method: "PUT", body: { standings: collect() } });
        document.querySelector("#standings-error").textContent = "Saved.";
        loadLeague();
      } catch (error) {
        document.querySelector("#standings-error").textContent = error.message;
      }
    });
  }

  const search = document.querySelector("#rank-search");
  search?.addEventListener("input", () => {
    rankings.query = search.value;
    rankings.shown = 50;
    renderTab();
    const next = document.querySelector("#rank-search");
    next.focus();
    next.setSelectionRange(next.value.length, next.value.length);
  });
  document.querySelectorAll("[data-position]").forEach((button) => button.addEventListener("click", () => {
    rankings.position = button.dataset.position;
    rankings.shown = 50;
    renderTab();
  }));
  document.querySelectorAll("[data-sort]").forEach((button) => button.addEventListener("click", () => {
    rankings.sort = button.dataset.sort;
    renderTab();
  }));
  document.querySelector("#show-more")?.addEventListener("click", () => {
    rankings.shown += 50;
    renderTab();
  });
  document.querySelector("#refresh-players")?.addEventListener("click", async (event) => {
    event.currentTarget.disabled = true;
    event.currentTarget.textContent = "Pulling from ESPN…";
    await api(`/${activeLeague}/players/refresh`, { method: "POST" }).catch(() => {});
    rankings.data = null;
    renderTab();
  });
  document.querySelectorAll("[data-player]").forEach((button) => button.addEventListener("click", () => openPlayer(button.dataset.player)));
}

renderShell();
api("/session")
  .then((session) => {
    inviteRequired = session.inviteRequired;
    setUser(session.user);
  })
  .catch(() => {})
  .finally(() => {
    sessionChecked = true;
    renderShell();
    if (user) loadLeague();
  });
