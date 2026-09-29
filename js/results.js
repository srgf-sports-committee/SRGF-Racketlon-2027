document.addEventListener("DOMContentLoaded", async () => {
  const { $, esc, setStatus, loadJsonDataset, live, loadJsonFreshness, nav } = SRGF;
  SRGFAuth.init();
  nav("results");

  let fixtureHeaders = [];
  let fixtureRows = [];
  let teamsData = [];
  let activeTab = "racketlon";
  const tierFilters = { racketlon: "", nonRacketlon: "" };

  const norm = v => String(v ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
  const number = v => {
    const m = String(v ?? "").replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
    return m ? Number(m[0]) : 0;
  };
  const isRacketlon = sport => norm(sport) === "racketlon";
  const teamKey = v => norm(String(v ?? ""));
  const cleanTeam = v => String(v ?? "").trim();

  // Convert team IDs (e.g. T1) to the actual team name (e.g. T1 Team1).
  // This prevents the Results table from showing the same team twice.
  function resolveTeamName(value) {
    const raw = String(value ?? "").trim();
    if (!raw) return "";

    const rawKey = norm(raw);

    // First use the TEAMS data as the authoritative ID -> name mapping.
    for (const t of teamsData) {
      const id = String(
        t.id ?? t["Team ID"] ?? t["TeamID"] ?? t.teamId ?? t.TeamId ?? ""
      ).trim();
      const name = String(
        t.name ?? t["Team Name"] ?? t["TeamName"] ?? t.Team ?? ""
      ).trim();

      if (name && norm(name) === rawKey) return name;
      if (id && norm(id) === rawKey) return name || id;
    }

    // Also accept common nested/object shapes.
    for (const t of teamsData) {
      const id = String(t.ID ?? t.Id ?? "").trim();
      const name = String(t.Name ?? "").trim();
      if (name && norm(name) === rawKey) return name;
      if (id && norm(id) === rawKey) return name || id;
    }

    // If no mapping exists, preserve the supplied value.
    return raw;
  }

  function headersFromObjects(rows) {
    const headers = Object.keys(rows[0] || {});
    return { headers, rows: rows.map(r => headers.map(h => r[h] ?? "")) };
  }

  function findIndex(names) {
    const wanted = names.map(norm);
    for (const w of wanted) {
      const exact = fixtureHeaders.findIndex(h => norm(h) === w);
      if (exact >= 0) return exact;
    }
    for (const w of wanted) {
      const prefix = fixtureHeaders.findIndex(h => norm(h).startsWith(w));
      if (prefix >= 0) return prefix;
    }
    return -1;
  }

  function value(row, names) {
    const i = findIndex(Array.isArray(names) ? names : [names]);
    return i < 0 ? "" : String(row[i] ?? "").trim();
  }

  function scoreColumns() {
    const out = [];
    fixtureHeaders.forEach((h, i) => {
      const n = norm(h);
      const m = n.match(/^(?:game|set)([1-4])/);
      if (m) out[Number(m[1]) - 1] = i;
    });
    return out.filter(i => i !== undefined);
  }

  function parseScore(raw) {
    const m = String(raw ?? "").match(/^\s*(-?\d+(?:\.\d+)?)\s*[-:]\s*(-?\d+(?:\.\d+)?)\s*$/);
    return m ? [Number(m[1]), Number(m[2])] : null;
  }

  function playerTeam(player) {
    if (!player) return "";
    const wanted = norm(player);
    for (const t of teamsData) {
      const name = String(t.name || t["Team Name"] || t.Team || t.id || "").trim();
      const members = t.players || t.Players || [];
      if (Array.isArray(members) && members.some(p => norm(p.name || p["Player Name"] || p) === wanted)) return name;
      const pList = String(t["Players"] || t["Player Names"] || "").split(/[,;|]/).map(x => x.trim());
      if (pList.some(p => norm(p) === wanted)) return name;
    }
    return "";
  }

  function matchTeams(row) {
    const match = value(row, ["Match", "Fixture"]);
    if (match) {
      const parts = match.split(/\s+(?:vs|v)\.?\s+/i).map(resolveTeamName).filter(Boolean);
      if (parts.length >= 2) return [parts[0], parts[1]];
    }

    const team1 = value(row, ["Team 1", "Team1", "Team A", "TeamA"]);
    const team2 = value(row, ["Team 2", "Team2", "Team B", "TeamB"]);
    if (team1 || team2) return [resolveTeamName(team1), resolveTeamName(team2)];

    return [
      resolveTeamName(playerTeam(value(row, ["Player 1", "Player1", "Player 1 Name", "Player1Name"]))),
      resolveTeamName(playerTeam(value(row, ["Player 2", "Player2", "Player 2 Name", "Player2Name"])))
    ];
  }

  function refreshFilters() {
    const sportSelect = $("resultPlayerSportFilter");
    const tierSelect = $("resultPlayerTierFilter");
    const sportWrap = $("playerScoreSportFilterWrap");

    const sports = [...new Set(fixtureRows.map(r => value(r, ["Sport"])).filter(Boolean))]
      .filter(s => !isRacketlon(s))
      .sort((a, b) => a.localeCompare(b));
    const currentSport = sportSelect?.value || "";
    if (sportSelect) {
      sportSelect.innerHTML = '<option value="">All Sports</option>' + sports.map(s => `<option value="${esc(s)}">${esc(s)}</option>`).join("");
      if (sports.includes(currentSport)) sportSelect.value = currentSport;
    }

    const tiers = [...new Set(fixtureRows.map(r => value(r, ["Tier"])).filter(Boolean))].sort((a, b) => {
      const na = Number((a.match(/\d+(?:\.\d+)?/) || [])[0]);
      const nb = Number((b.match(/\d+(?:\.\d+)?/) || [])[0]);
      return Number.isFinite(na) && Number.isFinite(nb) ? na - nb : a.localeCompare(b);
    });
    if (tierSelect) {
      const saved = tierFilters[activeTab] || "";
      tierSelect.innerHTML = '<option value="">All Tiers</option>' + tiers.map(t => `<option value="${esc(t)}">${esc(t)}</option>`).join("");
      tierSelect.value = tiers.includes(saved) ? saved : "";
    }

    if (sportWrap) sportWrap.classList.toggle("hidden", activeTab !== "nonRacketlon");
    const filters = $("playerScoreFilters");
    if (filters) {
      filters.classList.toggle("player-score-filters-racketlon", activeTab === "racketlon");
      filters.classList.toggle("player-score-filters-non-racketlon", activeTab === "nonRacketlon");
    }
  }

  function renderTeamResults() {
    const body = $("teamPointsBody");
    const msg = $("teamPointsMessage");
    const table = $("teamPointsTable");
    if (!body || !table) return;

    const stats = {};
    const ensure = name => {
      const clean = resolveTeamName(name);
      if (!clean) return null;
      const key = teamKey(clean);
      if (!stats[key]) stats[key] = { name: clean, score: 0, wins: 0, losses: 0, pd: 0 };
      return stats[key];
    };

    fixtureRows.forEach(row => {
      const [a, b] = matchTeams(row);
      if (a) ensure(a);
      if (b) ensure(b);

      const winner = resolveTeamName(value(row, ["Winning Team", "Winner Team", "Winner"]));
      const winnerKey = teamKey(winner);
      if (winnerKey) {
        if (a && teamKey(a) === winnerKey) ensure(a).wins++;
        else if (b && teamKey(b) === winnerKey) ensure(b).wins++;
      }

      const points = number(value(row, ["Points"]));
      if (winnerKey && points !== 0) ensure(winner).score += points;

      fixtureHeaders.forEach((h, i) => {
        if (!/^(?:game|set)\d+/.test(norm(h))) return;
        const parsed = parseScore(row[i]);
        if (!parsed) return;
        if (a) {
          ensure(a).pd += parsed[0] - parsed[1];
          if (parsed[0] < parsed[1]) ensure(a).losses++;
        }
        if (b) {
          ensure(b).pd += parsed[1] - parsed[0];
          if (parsed[1] < parsed[0]) ensure(b).losses++;
        }
      });
    });

    teamsData.forEach(t => {
      const name = resolveTeamName(
        t.name || t["Team Name"] || t["TeamName"] || t.Team ||
        t.id || t["Team ID"] || t["TeamID"] || t.teamId
      );
      if (name) ensure(name);
    });

    const entries = Object.values(stats).sort((a, b) =>
      b.score - a.score || b.wins - a.wins || a.losses - b.losses || b.pd - a.pd || a.name.localeCompare(b.name)
    );

    body.innerHTML = entries.length
      ? entries.map((x, i) => `<tr class="${i === 0 ? "team-top-row" : ""}"><td>${esc(x.name)}</td><td>${x.score}</td><td>${x.wins}</td><td>${x.losses}</td><td>${x.pd > 0 ? "+" : ""}${x.pd}</td></tr>`).join("")
      : '<tr><td colspan="5">No team results available.</td></tr>';
    table.classList.remove("hidden");
    if (msg) msg.textContent = entries.length ? `${entries.length} team(s) shown.` : "Results will appear here after fixture scores are entered.";
  }

  function renderPlayerResults() {
    const sport = activeTab === "nonRacketlon" ? String($("resultPlayerSportFilter")?.value || "").trim().toLowerCase() : "";
    const tier = String($("resultPlayerTierFilter")?.value || "").trim().toLowerCase();
    tierFilters[activeTab] = $("resultPlayerTierFilter")?.value || "";

    const playerScores = {};
    const ensure = (sportName, tierName, player) => {
      const key = `${norm(sportName)}|||${norm(tierName)}|||${norm(player)}`;
      if (!playerScores[key]) playerScores[key] = { sport: sportName, tier: tierName, player, points: 0, wins: 0, losses: 0, pd: 0 };
      return playerScores[key];
    };

    fixtureRows.forEach(row => {
      const sportName = value(row, ["Sport"]);
      const tierName = value(row, ["Tier"]);
      const p1 = value(row, ["Player 1", "Player1", "Player 1 Name", "Player1Name"]);
      const p2 = value(row, ["Player 2", "Player2", "Player 2 Name", "Player2Name"]);
      if (!sportName || !tierName || (!p1 && !p2)) return;

      const rack = isRacketlon(sportName);
      if (activeTab === "racketlon" && !rack) return;
      if (activeTab === "nonRacketlon" && rack) return;
      if (sport && norm(sportName) !== norm(sport)) return;
      if (tier && norm(tierName) !== norm(tier)) return;

      const a = p1 ? ensure(sportName, tierName, p1) : null;
      const b = p2 ? ensure(sportName, tierName, p2) : null;
      const [teamA, teamB] = matchTeams(row);
      const winner = resolveTeamName(value(row, ["Winning Team", "Winner Team", "Winner"]));
      const winnerKey = teamKey(winner);

      fixtureHeaders.forEach((h, i) => {
        if (!/^(?:game|set)\d+/.test(norm(h))) return;
        const parsed = parseScore(row[i]);
        if (!parsed) return;

        if (rack) {
          if (a) a.points += parsed[0];
          if (b) b.points += parsed[1];
        } else {
          if (parsed[0] < parsed[1] && a) a.losses++;
          if (parsed[1] < parsed[0] && b) b.losses++;
          if (a) a.pd += parsed[0] - parsed[1];
          if (b) b.pd += parsed[1] - parsed[0];
        }
      });

      if (!rack && winnerKey) {
        if (a && teamKey(teamA) === winnerKey) a.wins++;
        if (b && teamKey(teamB) === winnerKey) b.wins++;
      }
    });

    const groups = {};
    Object.values(playerScores).forEach(x => {
      const key = `${norm(x.sport)}|||${norm(x.tier)}`;
      (groups[key] ||= []).push(x);
    });

    Object.values(groups).forEach(group => group.sort((a, b) => activeTab === "racketlon"
      ? b.points - a.points || a.player.localeCompare(b.player)
      : b.wins - a.wins || a.losses - b.losses || b.pd - a.pd || a.player.localeCompare(b.player)
    ));

    const head = $("playerScoresHead");
    if (head) {
      head.innerHTML = activeTab === "racketlon"
        ? "<tr><th>Sport</th><th>Tier</th><th>Player Name</th><th>Total Points</th></tr>"
        : "<tr><th>Sport</th><th>Tier</th><th>Player Name</th><th>Matches Won</th><th>Games Lost</th><th>Point Difference</th></tr>";
    }

    const body = $("playerScoresBody");
    const rows = Object.keys(groups).sort((a, b) => a.localeCompare(b)).flatMap(k => groups[k]);
    const top = new Set(Object.values(groups).map(g => g[0]?.player).filter(Boolean));
    body.innerHTML = rows.length ? rows.map(x => {
      const cls = top.has(x.player) ? "racketlon-top-player" : "";
      return activeTab === "racketlon"
        ? `<tr class="${cls}"><td>${esc(x.sport)}</td><td>${esc(x.tier)}</td><td>${esc(x.player)}</td><td>${x.points}</td></tr>`
        : `<tr class="${cls}"><td>${esc(x.sport)}</td><td>${esc(x.tier)}</td><td>${esc(x.player)}</td><td>${x.wins}</td><td>${x.losses}</td><td>${x.pd > 0 ? "+" : ""}${x.pd}</td></tr>`;
    }).join("") : `<tr><td colspan="${activeTab === "racketlon" ? 4 : 6}">No player scores available.</td></tr>`;

    $("playerScoresTable")?.classList.remove("hidden");
    const msg = $("playerScoresMessage");
    if (msg) msg.textContent = activeTab === "racketlon"
      ? `${rows.length} Racketlon player result(s) shown. Ranking: Total Points.`
      : `${rows.length} non-Racketlon player result(s) shown. Ranking: Matches Won → fewer Games Lost → Point Difference.`;
  }

  function render() {
    refreshFilters();
    renderTeamResults();
    renderPlayerResults();
  }

  function bindTabs() {
    const r = $("playerScoresRacketlonTab");
    const n = $("playerScoresNonRacketlonTab");
    r?.addEventListener("click", () => {
      tierFilters[activeTab] = $("resultPlayerTierFilter")?.value || "";
      activeTab = "racketlon";
      r.classList.add("active"); r.setAttribute("aria-selected", "true");
      n?.classList.remove("active"); n?.setAttribute("aria-selected", "false");
      render();
    });
    n?.addEventListener("click", () => {
      tierFilters[activeTab] = $("resultPlayerTierFilter")?.value || "";
      activeTab = "nonRacketlon";
      n.classList.add("active"); n.setAttribute("aria-selected", "true");
      r?.classList.remove("active"); r?.setAttribute("aria-selected", "false");
      render();
    });
    $("resultPlayerSportFilter")?.addEventListener("change", render);
    $("resultPlayerTierFilter")?.addEventListener("change", () => {
      tierFilters[activeTab] = $("resultPlayerTierFilter")?.value || "";
      render();
    });
  }

  async function load() {
    let jsonShown = false;

    // 1) JSON FIRST — use the fixture snapshot, because Results are calculated
    // from FIXTURES in the benchmark file, not from a separate RESULTS table.
    try {
      const [fx, tm] = await Promise.all([
        loadJsonDataset("fixtures"),
        loadJsonDataset("teams").catch(() => ({ data: [] }))
      ]);
      fixtureHeaders = fx.headers || (Array.isArray(fx.data) && fx.data.length ? Object.keys(fx.data[0]) : []);
      fixtureRows = fx.headers ? (fx.data || []) : headersFromObjects(fx.data || []).rows;
      if (!fx.headers && Array.isArray(fx.data) && fx.data.length) fixtureHeaders = Object.keys(fx.data[0]);
      teamsData = tm.data || [];
      render();
      await loadJsonFreshness();
      setStatus("JSON data");
      jsonShown = true;
    } catch (_) {}

    // 2) LIVE — replace JSON only when the live response succeeds.
    try {
      const d = await live("data");
      if (Array.isArray(d.fixtures)) {
        const converted = headersFromObjects(d.fixtures);
        fixtureHeaders = converted.headers;
        fixtureRows = converted.rows;
      } else if (Array.isArray(d.results)) {
        // Compatibility only. The benchmark calculates from fixtures, so do not
        // prefer a separate RESULTS table when FIXTURES is available.
        const converted = headersFromObjects(d.results);
        fixtureHeaders = converted.headers;
        fixtureRows = converted.rows;
      }
      if (Array.isArray(d.teams)) teamsData = d.teams;
      render();
      setStatus("LIVE · Google Sheet");
    } catch (_) {
      if (!jsonShown) setStatus("JSON data unavailable", true);
    }
  }

  bindTabs();
  await load();
  setInterval(() => { if (!document.hidden) load(); }, 30000);
});
