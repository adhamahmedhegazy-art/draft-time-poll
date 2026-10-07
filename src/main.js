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
  arrow: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6"/></svg>`,
};

const leagueData = {
  basketball: {
    label: "Basketball",
    kicker: "Hardwood Headquarters",
    season: "2026–27 Season",
    icon: icons.basketball,
    announcement: {
      date: "OCTOBER 6, 2026",
      title: "Welcome back, family.",
      body: "Another season means another chapter in the story we keep writing together. The late-night waiver claims, the impossible comebacks, and yes—even the trades we regret—are what make this league ours. Compete hard, laugh often, and remember: the real trophy is the group chat we somehow haven’t muted.",
      signature: "With love (and full veto power),",
      author: "Commissioner Adham",
    },
    polls: [
      {
        id: "basketball-playoffs",
        question: "How many teams should make the playoffs?",
        deadline: "Closes Friday",
        options: ["4 teams", "6 teams", "8 teams"],
        votes: [3, 7, 2],
      },
      {
        id: "basketball-ir",
        question: "Add a second IR+ roster spot?",
        deadline: "Closes Sunday",
        options: ["Yes, absolutely", "No, embrace the pain"],
        votes: [9, 4],
      },
    ],
    trades: [
      { time: "2 HOURS AGO", a: "The Rim Reapers", b: "Splash Cousins", give: "J. Tatum + 2027 3rd", get: "S. Gilgeous-Alexander", tag: "BLOCKBUSTER" },
      { time: "YESTERDAY", a: "Air Ballers", b: "Dunk Dynasty", give: "T. Haliburton", get: "A. Edwards + $12 FAAB", tag: "ACCEPTED" },
      { time: "SEP 29", a: "Splash Cousins", b: "The Paint Saints", give: "B. Adebayo", get: "L. Markkanen", tag: "ACCEPTED" },
    ],
    standings: [
      ["The Rim Reapers", "Adham", "14–3", "1,842"],
      ["Splash Cousins", "Marco", "12–5", "1,761"],
      ["Dunk Dynasty", "Jules", "10–7", "1,694"],
      ["The Paint Saints", "Nico", "9–8", "1,622"],
      ["Air Ballers", "Sam", "7–10", "1,511"],
      ["Brick City", "Eli", "5–12", "1,403"],
    ],
  },
  football: {
    label: "Football",
    kicker: "Gridiron Headquarters",
    season: "2026 Season",
    icon: icons.football,
    announcement: {
      date: "OCTOBER 6, 2026",
      title: "Every Sunday, together.",
      body: "Through every last-second touchdown and every lineup left tragically on the bench, this league keeps bringing us back to the same place: together. Thank you for showing up, talking trash, and making Sundays mean a little more. May your players stay healthy and your victories remain completely undeserved.",
      signature: "Proud to be your commissioner,",
      author: "Adham",
    },
    polls: [
      {
        id: "football-deadline",
        question: "Move the trade deadline back one week?",
        deadline: "Closes Thursday",
        options: ["Move it back", "Keep it as-is"],
        votes: [6, 5],
      },
      {
        id: "football-kicker",
        question: "The eternal question: keep kickers?",
        deadline: "Closes Monday",
        options: ["Keep the chaos", "Abolish kickers"],
        votes: [4, 8],
      },
    ],
    trades: [
      { time: "48 MIN AGO", a: "Sunday Scaries", b: "Fourth & Wrong", give: "J. Jefferson", get: "J. Gibbs + 2027 1st", tag: "BREAKING" },
      { time: "MONDAY", a: "Blitz Brigade", b: "End Zone Empire", give: "L. Jackson", get: "J. Burrow + D. Smith", tag: "ACCEPTED" },
      { time: "SEP 28", a: "Fourth & Wrong", b: "Bench Mob", give: "D. Henry", get: "2027 2nd + $18 FAAB", tag: "ACCEPTED" },
    ],
    standings: [
      ["Sunday Scaries", "Priya", "5–0", "682"],
      ["Fourth & Wrong", "Adham", "4–1", "641"],
      ["Blitz Brigade", "Chris", "3–2", "608"],
      ["End Zone Empire", "Nadia", "3–2", "594"],
      ["Bench Mob", "Omar", "2–3", "551"],
      ["Hail Mary Heroes", "Dev", "1–4", "497"],
    ],
  },
};

let activeLeague = "basketball";
let activeTab = "announcement";

const app = document.querySelector("#app");

function renderShell() {
  app.innerHTML = `
    <div class="noise"></div>
    <header class="site-header">
      <a class="brand" href="#" aria-label="Nats Commish home">
        <span class="brand-mark">NC</span>
        <span><strong>NATS</strong><em>COMMISH</em></span>
      </a>
      <div class="live-pill"><span></span> League HQ is live</div>
      <button class="feedback-trigger">${icons.mail}<span>Complaints & ideas</span></button>
    </header>

    <main>
      <section class="hero">
        <div class="hero-sticker">EST. 2026 · ZERO PEACE</div>
        <p class="eyebrow">YOUR OFFICIAL SOURCE OF TRUTH*</p>
        <h1>ALL LEAGUE.<br><span>ALL DRAMA.</span></h1>
        <p class="hero-copy">Announcements, votes, trades, and receipts—served hot by your commissioner.</p>
        <p class="fine-print">*Unless the commissioner changes his mind.</p>
        <div class="hero-balls" aria-hidden="true">
          <span class="ball bball">${icons.basketball}</span>
          <span class="ball fball">${icons.football}</span>
        </div>
      </section>

      <section class="league-shell">
        <div class="league-switcher" role="tablist" aria-label="Choose fantasy league">
          ${Object.entries(leagueData).map(([key, league]) => `
            <button class="league-button ${key === activeLeague ? "active" : ""}" data-league="${key}" role="tab" aria-selected="${key === activeLeague}">
              <span class="league-icon">${league.icon}</span>
              <span><small>Fantasy</small>${league.label}</span>
              <b>${key === activeLeague ? "OPEN" : "ENTER"}</b>
            </button>
          `).join("")}
        </div>
        <div id="league-content"></div>
      </section>
    </main>

    <footer>
      <div class="footer-brand"><span class="brand-mark">NC</span> NATS COMMISH</div>
      <p>Built for the league. Run by the Commish. Fueled by controversy.</p>
      <button class="feedback-trigger footer-link">Got a complaint? We know you do.</button>
      <p class="copyright">© 2026 Nats Commish · natscommish.com</p>
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
  `;
  renderLeague();
  bindShellEvents();
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
      ${[
        ["announcement", icons.megaphone, "Commish Announcement"],
        ["polls", icons.poll, "League Polls"],
        ["trades", icons.trade, "Trade Wire"],
        ["leaderboard", icons.trophy, "Leaderboard"],
      ].map(([key, icon, label]) => `
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

function renderTab() {
  const league = leagueData[activeLeague];
  const panel = document.querySelector("#tab-panel");
  const renderers = {
    announcement: () => `
      <article class="announcement-card">
        <div class="tape tape-left"></div><div class="tape tape-right"></div>
        <div class="announcement-side">
          <span class="heart-burst">${icons.heart}</span>
          <p>FROM THE DESK OF</p>
          <strong>THE<br>COMMISH</strong>
          <span class="daily-label">TODAY'S MESSAGE</span>
        </div>
        <div class="letter">
          <div class="letter-meta"><span>DAILY ANNOUNCEMENT</span><time>${league.announcement.date}</time></div>
          <h3>${league.announcement.title}</h3>
          <p>${league.announcement.body}</p>
          <div class="signature"><span>${league.announcement.signature}</span><strong>${league.announcement.author}</strong></div>
        </div>
      </article>
      <div class="next-note"><span>${icons.heart}</span><p>A new note from the commissioner lands here every day.</p></div>
    `,
    polls: () => `
      <div class="section-intro">
        <div><p class="eyebrow">DEMOCRACY, SORT OF</p><h3>Your vote matters.</h3></div>
        <span>${league.polls.length} OPEN POLLS</span>
      </div>
      <div class="poll-grid">
        ${league.polls.map((poll, index) => renderPoll(poll, index)).join("")}
      </div>
    `,
    trades: () => `
      <div class="section-intro">
        <div><p class="eyebrow">LIVE FROM THE WIRE</p><h3>Deals, steals & bad decisions.</h3></div>
        <span class="pulse-label"><i></i> LIVE FEED</span>
      </div>
      <div class="trade-list">
        ${league.trades.map((trade) => `
          <article class="trade-card">
            <div class="trade-time"><span>${trade.tag}</span><time>${trade.time}</time></div>
            <div class="trade-team"><b>${trade.a}</b><small>SENDS</small><p>${trade.give}</p></div>
            <div class="trade-arrows">${icons.trade}<span>TRADE</span></div>
            <div class="trade-team right"><b>${trade.b}</b><small>SENDS</small><p>${trade.get}</p></div>
          </article>
        `).join("")}
      </div>
    `,
    leaderboard: () => `
      <div class="section-intro">
        <div><p class="eyebrow">POWER RANKINGS</p><h3>Receipts don't lie.</h3></div>
        <span>UPDATED TODAY</span>
      </div>
      <div class="leaderboard">
        <div class="table-header"><span>RANK</span><span>TEAM / MANAGER</span><span>RECORD</span><span>POINTS</span></div>
        ${league.standings.map((team, index) => `
          <div class="standing-row ${index < 3 ? `podium rank-${index + 1}` : ""}">
            <span class="rank">${index < 3 ? icons.trophy : ""}<b>${String(index + 1).padStart(2, "0")}</b></span>
            <span class="team-name"><b>${team[0]}</b><small>${team[1]}</small></span>
            <strong>${team[2]}</strong>
            <strong>${team[3]}</strong>
          </div>
        `).join("")}
      </div>
    `,
  };
  panel.innerHTML = renderers[activeTab]();
  bindTabEvents();
}

function renderPoll(poll, index) {
  const savedVote = localStorage.getItem(`natscommish:${poll.id}`);
  const votes = [...poll.votes];
  if (savedVote !== null) votes[Number(savedVote)] += 1;
  const total = votes.reduce((sum, vote) => sum + vote, 0);
  return `
    <article class="poll-card" data-poll="${poll.id}">
      <div class="poll-number">0${index + 1}</div>
      <div class="poll-meta"><span>${poll.deadline}</span><b>${total} VOTES</b></div>
      <h4>${poll.question}</h4>
      <div class="poll-options">
        ${poll.options.map((option, optionIndex) => {
          const percent = Math.round((votes[optionIndex] / total) * 100);
          return `
            <button data-option="${optionIndex}" ${savedVote !== null ? "disabled" : ""} class="${Number(savedVote) === optionIndex ? "chosen" : ""}">
              <span class="option-radio"></span><b>${option}</b>
              ${savedVote !== null ? `<span class="poll-result" style="--result:${percent}%"><i></i><strong>${percent}%</strong></span>` : ""}
            </button>`;
        }).join("")}
      </div>
      <p class="vote-status">${savedVote !== null ? "✓ VOTE LOCKED IN" : "CHOOSE WISELY. YOUR NAME IS ATTACHED."}</p>
    </article>
  `;
}

function bindShellEvents() {
  document.querySelectorAll("[data-league]").forEach((button) => {
    button.addEventListener("click", () => {
      activeLeague = button.dataset.league;
      activeTab = "announcement";
      renderShell();
      document.querySelector(".league-shell").scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });

  const modal = document.querySelector("#feedback-modal");
  document.querySelectorAll(".feedback-trigger").forEach((button) => button.addEventListener("click", () => modal.showModal()));
  document.querySelector(".modal-close").addEventListener("click", () => modal.close());
  modal.addEventListener("click", (event) => {
    if (event.target === modal) modal.close();
  });
  document.querySelector("#feedback-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const subject = encodeURIComponent(`[Nats Commish] ${data.get("league")} feedback from ${data.get("name")}`);
    const body = encodeURIComponent(`From: ${data.get("name")}\nLeague: ${data.get("league")}\n\n${data.get("message")}`);
    window.location.href = `mailto:adham@natscommish.com?subject=${subject}&body=${body}`;
  });
}

function bindTabEvents() {
  document.querySelectorAll("[data-poll] button").forEach((button) => {
    button.addEventListener("click", () => {
      const pollId = button.closest("[data-poll]").dataset.poll;
      localStorage.setItem(`natscommish:${pollId}`, button.dataset.option);
      renderTab();
    });
  });
}

renderShell();
