/* SRGF Racketlon 2027 - Results page
   Uses the FIXTURES data as the source for result calculations, matching the
   working Admin reference page. JSON is shown first; live Sheet data is then
   refreshed in the background every 30 minutes.
*/
document.addEventListener("DOMContentLoaded", async () => {
  const { $, esc, setStatus, loadJsonDataset, loadJsonFreshness, live, nav, C } = SRGF;
  SRGFAuth.init();
  nav("results");

  let fixture = { headers: [], rows: [] };
  let teams = [];
  let players = [];
  let activeTab = "racketlon";
  let tierFilters = { racketlon: "", nonRacketlon: "" };

  const norm = v => String(v ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
  const clean = v => String(v ?? "").trim();
  const num = v => Number(String(v ?? "").replace(/,/g, "")) || 0;

  function objectRowsToTable(rows) {
    if (!Array.isArray(rows) || !rows.length || typeof rows[0] !== "object" || Array.isArray(rows[0])) {
      return { headers: [], rows: Array.isArray(rows) ? rows : [] };
    }
    const headers = [...new Set(rows.flatMap(r => Object.keys(r || {})))];
    return { headers, rows: rows.map(r => headers.map(h => r?.[h] ?? "")) };
  }

  function tableFromDataset(d) {
    if (!d) return { headers: [], rows: [] };
    if (Array.isArray(d.headers) && Array.isArray(d.rows)) {
      return { headers: [...d.headers], rows: d.rows.map(r => Array.isArray(r) ? [...r] : d.headers.map(h => r?.[h] ?? "")) };
    }
    return objectRowsToTable(d.rows || d);
  }

  function headerIndex(name) {
    const wanted = norm(name);
    if (!wanted) return -1;
    let i = fixture.headers.findIndex(h => norm(h) === wanted);
    if (i >= 0) return i;
    i = fixture.headers.findIndex(h => norm(h).startsWith(wanted));
    return i;
  }

  function value(row, name) {
    const i = headerIndex(name);
    return i < 0 ? "" : clean(row[i]);
  }

  function teamRecord(value) {
    const raw = clean(value);
    if (!raw) return "";
    const lower = raw.toLowerCase();
    const found = teams.find(t => String(t.id || "").trim().toLowerCase() === lower || String(t.name || "").trim().toLowerCase() === lower);
    return clean(found?.name || found?.id || raw);
  }

  function teamKey(value) {
    const raw = clean(value).toLowerCase();
    if (!raw) return "";
    const found = teams.find(t => String(t.id || "").trim().toLowerCase() === raw || String(t.name || "").trim().toLowerCase() === raw);
    const canonical = String(found?.id || found?.name || raw).trim().toLowerCase();
    const m = canonical.match(/^(?:team|t)[\s_-]*0*(\d+)$/);
    return m ? `t${m[1]}` : canonical.replace(/\s+/g, " ");
  }

  function playerTeam(playerValue) {
    const raw = clean(playerValue);
    if (!raw) return "";
    const p = players.find(x => {
      const id = clean(x.id || x["Player ID"] || x["PlayerID"] || x.ID);
      const name = clean(x.name || x["Player Name"] || x["PlayerName"] || x.Name || x.Player);
      return id.toLowerCase() === raw.toLowerCase() || name.toLowerCase() === raw.toLowerCase();
    });
    return clean(p?.team || p?.["Team"] || p?.["Team Name"] || p?.teamName || "");
  }

  function matchTeams(row) {
    let a = value(row, "team 1");
    let b = value(row, "team 2");
    if (a && b) return [teamRecord(a), teamRecord(b)];

    for (let i = 0; i < fixture.headers.length; i++) {
      const h = clean(fixture.headers[i]);
      if (!/^(match|fixture)$/i.test(h)) continue;
      const raw = clean(row[i]);
      if (!raw) continue;
      let parts = raw.split(/\s+(?:vs|v)\s+/i).map(clean).filter(Boolean);
      if (parts.length < 2) parts = raw.split(/(?:vs|v)/i).map(clean).filter(Boolean);
      if (parts.length >= 2) return [teamRecord(parts[0]), teamRecord(parts[1])];
    }

    const p1 = value(row, "player 1");
    const p2 = value(row, "player 2");
    return [teamRecord(playerTeam(p1)), teamRecord(playerTeam(p2))];
  }

  function scorePair(raw) {
    const m = clean(raw).match(/^\s*(-?\d+(?:\.\d+)?)\s*-\s*(-?\d+(?:\.\d+)?)\s*$/);
    return m ? [Number(m[1]), Number(m[2])] : null;
  }

  function scoreColumns() {
    const out = [];
    fixture.headers.forEach((h, i) => {
      const n = norm(h);
      if (/^(game|set)\d+/.test(n)) out.push(i);
    });
    return out;
  }

  function isRacketlon(sport) {
    return norm(sport) === "racketlon";
  }

  function refreshFilters() {
    const sportSelect = $("resultPlayerSportFilter");
    const tierSelect = $("resultPlayerTierFilter");
    const sports = [...new Set(fixture.rows.map(r => value(r, "sport")).filter(Boolean))].sort((a,b) => a.localeCompare(b));
    const tiers = [...new Set(fixture.rows.map(r => value(r, "tier")).filter(Boolean))].sort((a,b) => {
      const na = Number((a.match(/\d+(?:\.\d+)?/) || [])[0]);
      const nb = Number((b.match(/\d+(?:\.\d+)?/) || [])[0]);
      return Number.isFinite(na) && Number.isFinite(nb) ? na - nb : a.localeCompare(b);
    });

    if (sportSelect) {
      const old = sportSelect.value;
      sportSelect.innerHTML = `<option value="">All Sports</option>${sports.map(s => `<option value="${esc(s)}">${esc(s)}</option>`).join("")}`;
      if (sports.includes(old)) sportSelect.value = old;
    }
    if (tierSelect) {
      const saved = tierFilters[activeTab] || "";
      tierSelect.innerHTML = `<option value="">All Tiers</option>${tiers.map(t => `<option value="${esc(t)}">${esc(t)}</option>`).join("")}`;
      tierSelect.value = tiers.includes(saved) ? saved : "";
      tierFilters[activeTab] = tierSelect.value;
    }
  }

  function renderTeamPoints() {
    const body = $("teamPointsBody");
    const table = $("teamPointsTable");
    const msg = $("teamPointsMessage");
    if (!body || !table) return;

    const stats = {};
    const ensure = name => {
      const n = clean(name);
      if (!n) return null;
      if (!stats[n]) stats[n] = { score: 0, wins: 0, losses: 0, pd: 0 };
      return stats[n];
    };

    fixture.rows.forEach(row => {
      const winner = teamRecord(value(row, "winning team"));
      const points = num(value(row, "points"));
      if (winner && points) ensure(winner).score += points;

      const [a, b] = matchTeams(row);
      if (a) ensure(a);
      if (b) ensure(b);

      if (winner) {
        const wk = teamKey(winner);
        if (a && teamKey(a) === wk) ensure(a).wins++;
        else if (b && teamKey(b) === wk) ensure(b).wins++;
      }

      scoreColumns().forEach(i => {
        const pair = scorePair(row[i]);
        if (!pair) return;
        if (a) {
          ensure(a).pd += pair[0] - pair[1];
          if (pair[0] < pair[1]) ensure(a).losses++;
        }
        if (b) {
          ensure(b).pd += pair[1] - pair[0];
          if (pair[1] < pair[0]) ensure(b).losses++;
        }
      });
    });

    teams.forEach(t => ensure(clean(t.name || t.id)));

    const entries = Object.entries(stats).sort((a,b) =>
      b[1].score - a[1].score || b[1].wins - a[1].wins || a[1].losses - b[1].losses || b[1].pd - a[1].pd || a[0].localeCompare(b[0])
    );

    body.innerHTML = entries.length
      ? entries.map(([team,s],i) => `<tr class="${i===0 ? "team-top-row" : ""}"><td>${esc(team)}</td><td class="result-total">${s.score}</td><td>${s.wins}</td><td>${s.losses}</td><td>${s.pd>0?"+":""}${s.pd}</td></tr>`).join("")
      : `<tr><td colspan="5">No fixture results entered yet.</td></tr>`;
    table.classList.remove("hidden");
    if (msg) msg.textContent = entries.length ? `${entries.length} team(s) shown.` : "Results will appear here after fixture scores are entered.";
  }

  function renderPlayerScores() {
    const body = $("playerScoresBody");
    const table = $("playerScoresTable");
    const head = $("playerScoresHead");
    const msg = $("playerScoresMessage");
    const sportSelect = $("resultPlayerSportFilter");
    const tierSelect = $("resultPlayerTierFilter");
    const sportWrap = $("playerScoreSportFilterWrap");
    const filters = $("playerScoreFilters");
    if (!body || !table) return;

    const selectedSport = activeTab === "nonRacketlon" ? clean(sportSelect?.value).toLowerCase() : "";
    const selectedTier = clean(tierSelect?.value).toLowerCase();
    const scores = {};

    const ensure = (sport,tier,player) => {
      const key = `${sport}|||${tier}|||${player}`;
      if (!scores[key]) scores[key] = { sport,tier,player,score:0,wins:0,lost:0,pd:0 };
      return scores[key];
    };

    fixture.rows.forEach(row => {
      const sport = value(row,"sport");
      const tier = value(row,"tier");
      const p1 = value(row,"player 1");
      const p2 = value(row,"player 2");
      if (!sport || !tier || (!p1 && !p2)) return;

      const racketlon = isRacketlon(sport);
      if (activeTab === "racketlon" && !racketlon) return;
      if (activeTab === "nonRacketlon" && racketlon) return;
      if (activeTab === "nonRacketlon" && selectedSport && norm(sport) !== norm(selectedSport)) return;
      if (selectedTier && norm(tier) !== norm(selectedTier)) return;

      const a = p1 ? ensure(sport,tier,p1) : null;
      const b = p2 ? ensure(sport,tier,p2) : null;
      const columns = scoreColumns();

      columns.forEach(i => {
        const pair = scorePair(row[i]);
        if (!pair) return;
        if (racketlon) {
          if (a) a.score += pair[0];
          if (b) b.score += pair[1];
        } else {
          if (pair[0] > pair[1] && b) b.lost++;
          else if (pair[1] > pair[0] && a) a.lost++;
        }
      });

      if (!racketlon) {
        const winner = teamKey(value(row,"winning team"));
        const [ta,tb] = matchTeams(row);
        if (winner) {
          if (a && ta && teamKey(ta) === winner) a.wins++;
          if (b && tb && teamKey(tb) === winner) b.wins++;
        }
        let d1=0,d2=0;
        columns.forEach(i => {
          const pair = scorePair(row[i]);
          if (!pair) return;
          d1 += pair[0]-pair[1];
          d2 += pair[1]-pair[0];
        });
        if (a) a.pd += d1;
        if (b) b.pd += d2;
      }
    });

    const entries = Object.values(scores);
    const groups = {};
    entries.forEach(x => {
      const key = `${norm(x.sport)}|||${norm(x.tier)}`;
      (groups[key] ||= []).push(x);
    });
    Object.values(groups).forEach(g => g.sort((a,b) => activeTab === "racketlon"
      ? b.score-a.score || a.player.localeCompare(b.player)
      : b.wins-a.wins || a.lost-b.lost || b.pd-a.pd || a.player.localeCompare(b.player)
    ));

    const sorted = Object.keys(groups).sort((a,b) => a.localeCompare(b)).flatMap(k => groups[k]);
    const tops = new Set(Object.values(groups).filter(g => g.length).map(g => `${norm(g[0].sport)}|||${norm(g[0].tier)}|||${g[0].player}`));

    if (head) {
      head.innerHTML = activeTab === "racketlon"
        ? `<tr><th>Sport</th><th>Tier</th><th>Player Name</th><th>Total Points</th></tr>`
        : `<tr><th>Sport</th><th>Tier</th><th>Player Name</th><th>Matches Won</th><th>Games Lost</th><th>Point Difference</th></tr>`;
    }

    body.innerHTML = sorted.length
      ? sorted.map(x => {
          const top = tops.has(`${norm(x.sport)}|||${norm(x.tier)}|||${x.player}`);
          return activeTab === "racketlon"
            ? `<tr class="${top ? "racketlon-top-player" : ""}"><td>${esc(x.sport)}</td><td>${esc(x.tier)}</td><td>${esc(x.player)}</td><td class="result-total">${x.score}</td></tr>`
            : `<tr class="${top ? "racketlon-top-player" : ""}"><td>${esc(x.sport)}</td><td>${esc(x.tier)}</td><td>${esc(x.player)}</td><td class="result-total">${x.wins}</td><td>${x.lost}</td><td>${x.pd>0?"+":""}${x.pd}</td></tr>`;
        }).join("")
      : `<tr><td colspan="${activeTab === "racketlon" ? 4 : 6}">No player scores entered yet.</td></tr>`;

    table.classList.remove("hidden");
    if (sportWrap) sportWrap.classList.toggle("hidden", activeTab !== "nonRacketlon");
    if (filters) {
      filters.classList.toggle("player-score-filters-racketlon", activeTab === "racketlon");
      filters.classList.toggle("player-score-filters-non-racketlon", activeTab === "nonRacketlon");
    }
    if (msg) msg.textContent = activeTab === "racketlon"
      ? `${sorted.length} Racketlon player result(s) shown. Ranking: Sum Points.`
      : `${sorted.length} non-Racketlon player result(s) shown. Ranking: Matches Won → fewer Games Lost → Point Difference.`;
  }

  function render() {
    refreshFilters();
    renderTeamPoints();
    renderPlayerScores();
    const notes = document.querySelectorAll(".tie-break-note");
    if (notes[1]) notes[1].textContent = "* In case of a tie, the head-to-head winner will be the ultimate winner.";
  }

  async function loadJsonFirst() {
    try {
      const [f,t,p] = await Promise.all([
        loadJsonDataset("fixtures"),
        loadJsonDataset("teams"),
        loadJsonDataset("players")
      ]);
      fixture = tableFromDataset(f);
      teams = (t.data || []).map(x => ({
        id: x["Team ID"] ?? x.TeamID ?? x.ID ?? x.id ?? x.Team ?? "",
        name: x["Team Name"] ?? x.TeamName ?? x.Name ?? x.name ?? x.Team ?? ""
      })).filter(x => x.id || x.name);
      players = (p.data || []).map(x => ({
        id: x["Player ID"] ?? x.PlayerID ?? x.ID ?? x.id ?? "",
        name: x.Name ?? x["Player Name"] ?? x.PlayerName ?? x.name ?? x.Player ?? "",
        team: x.Team ?? x["Team Name"] ?? x.TeamName ?? x.team ?? ""
      }));
      render();
      await loadJsonFreshness();
      setStatus("JSON data");
      return true;
    } catch (_) {
      return false;
    }
  }

  async function loadLive() {
    try {
      const d = await live("data");
      if (Array.isArray(d.fixtures)) {
        const converted = objectRowsToTable(d.fixtures);
        fixture = converted;
      }
      if (Array.isArray(d.teams)) {
        teams = d.teams.map(x => ({
          id: x["Team ID"] ?? x.TeamID ?? x.ID ?? x.id ?? x.Team ?? "",
          name: x["Team Name"] ?? x.TeamName ?? x.Name ?? x.name ?? x.Team ?? ""
        })).filter(x => x.id || x.name);
      }
      if (Array.isArray(d.players)) {
        players = d.players.map(x => ({
          id: x["Player ID"] ?? x.PlayerID ?? x.ID ?? x.id ?? "",
          name: x.Name ?? x["Player Name"] ?? x.PlayerName ?? x.name ?? x.Player ?? "",
          team: x.Team ?? x["Team Name"] ?? x.TeamName ?? x.team ?? ""
        }));
      }
      render();
      setStatus("LIVE · Google Sheet");
    } catch (_) {
      // Keep the JSON data already displayed. Do not replace it with blank data.
      setStatus("JSON data · live refresh unavailable");
    }
  }

  $("playerScoresRacketlonTab")?.addEventListener("click", () => {
    tierFilters[activeTab] = clean($("resultPlayerTierFilter")?.value);
    activeTab = "racketlon";
    $("playerScoresRacketlonTab")?.classList.add("active");
    $("playerScoresRacketlonTab")?.setAttribute("aria-selected", "true");
    $("playerScoresNonRacketlonTab")?.classList.remove("active");
    $("playerScoresNonRacketlonTab")?.setAttribute("aria-selected", "false");
    render();
  });

  $("playerScoresNonRacketlonTab")?.addEventListener("click", () => {
    tierFilters[activeTab] = clean($("resultPlayerTierFilter")?.value);
    activeTab = "nonRacketlon";
    $("playerScoresNonRacketlonTab")?.classList.add("active");
    $("playerScoresNonRacketlonTab")?.setAttribute("aria-selected", "true");
    $("playerScoresRacketlonTab")?.classList.remove("active");
    $("playerScoresRacketlonTab")?.setAttribute("aria-selected", "false");
    render();
  });

  $("resultPlayerSportFilter")?.addEventListener("change", render);
  $("resultPlayerTierFilter")?.addEventListener("change", () => {
    tierFilters[activeTab] = clean($("resultPlayerTierFilter").value);
    render();
  });

  $("refreshBtn")?.addEventListener("click", async () => {
    const btn = $("refreshBtn");
    if (btn) { btn.disabled = true; btn.classList.add("spinning"); }
    try { await loadLive(); await loadJsonFreshness(); }
    finally { if (btn) { btn.disabled = false; btn.classList.remove("spinning"); } }
  });

  const shown = await loadJsonFirst();
  if (!shown) setStatus("Loading results…");
  loadLive();
  setInterval(() => { if (!document.hidden) loadLive(); }, C.REFRESH_MS || 30 * 60 * 1000);
});
