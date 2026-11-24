document.addEventListener("DOMContentLoaded", async () => {
  const { $, esc, setStatus, loadLiveFirstAll, nav } = SRGF;
  SRGFAuth.init();
  nav("results");

  let fixtureHeaders = [];
  let fixtureRows = [];
  let teamsData = [];
  let activeTab = "racketlon";
  let playerScoresView = "table";
  let selectedPlayerKey = "";
  const playerScoreFilterState = {
    racketlon: { sport: "", tier: "" },
    nonRacketlon: { sport: "", tier: "" }
  };

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

  // Convert live/cached Apps Script data into the row format used by Results.
  // A successful empty Fixtures response remains empty; it is not treated as failure.
  function applyLiveData_(data) {
    const rawFixtures = data?.fixtures ?? [];
    const rawTeams = data?.teams ?? [];

    if (Array.isArray(rawFixtures)) {
      if (rawFixtures.length && Array.isArray(rawFixtures[0])) {
        fixtureHeaders = Array.isArray(data?.fixturesHeaders) ? data.fixturesHeaders.map(String) : [];
        fixtureRows = rawFixtures.map(r => Array.isArray(r) ? r : []);
      } else {
        const converted = headersFromObjects(rawFixtures);
        fixtureHeaders = converted.headers.map(String);
        fixtureRows = converted.rows;
      }
    } else if (rawFixtures && typeof rawFixtures === 'object') {
      const headers = Array.isArray(rawFixtures.headers) ? rawFixtures.headers.map(String) : [];
      const rows = Array.isArray(rawFixtures.rows) ? rawFixtures.rows : [];
      if (headers.length) {
        fixtureHeaders = headers;
        fixtureRows = rows.map(r => Array.isArray(r) ? r : []);
      } else if (rows.length) {
        const converted = headersFromObjects(rows);
        fixtureHeaders = converted.headers.map(String);
        fixtureRows = converted.rows;
      } else {
        fixtureHeaders = [];
        fixtureRows = [];
      }
    } else {
      fixtureHeaders = [];
      fixtureRows = [];
    }

    teamsData = Array.isArray(rawTeams) ? rawTeams : [];
  }

  function capturePlayerScoreFilterState() {
    const sport = String($("resultPlayerSportFilter")?.value || "").trim();
    const tier = String($("resultPlayerTierFilter")?.value || "").trim();
    playerScoreFilterState[activeTab].sport = sport;
    playerScoreFilterState[activeTab].tier = tier;
  }

  function restoreSelectValue(select, options, saved) {
    if (!select) return;
    const wanted = norm(saved);
    const match = options.find(v => norm(v) === wanted);
    select.value = match ?? "";
  }

  function refreshFilters() {
    const sportSelect = $("resultPlayerSportFilter");
    const tierSelect = $("resultPlayerTierFilter");
    const sportWrap = $("playerScoreSportFilterWrap");
    const savedState = playerScoreFilterState[activeTab] || { sport: "", tier: "" };

    const sports = [...new Set(fixtureRows.map(r => value(r, ["Sport"]).trim()).filter(Boolean))]
      .filter(s => !isRacketlon(s))
      .sort((a, b) => a.localeCompare(b));
    if (sportSelect) {
      sportSelect.innerHTML = '<option value="">All Sports</option>' + sports.map(s => `<option value="${esc(s)}">${esc(s)}</option>`).join("");
      restoreSelectValue(sportSelect, sports, savedState.sport);
    }

    const tiers = [...new Set(fixtureRows.map(r => value(r, ["Tier"]).trim()).filter(Boolean))].sort((a, b) => {
      const na = Number((a.match(/\d+(?:\.\d+)?/) || [])[0]);
      const nb = Number((b.match(/\d+(?:\.\d+)?/) || [])[0]);
      return Number.isFinite(na) && Number.isFinite(nb) ? na - nb : a.localeCompare(b);
    });
    if (tierSelect) {
      tierSelect.innerHTML = '<option value="">All Tiers</option>' + tiers.map(t => `<option value="${esc(t)}">${esc(t)}</option>`).join("");
      restoreSelectValue(tierSelect, tiers, savedState.tier);
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
    const racketlonTierFixtureCounts = {};
    const racketlonTierCompletedCounts = {};
    const racketlonTierTeamPoints = {};
    const racketlonTierPlayerPoints = {};
    const individualTierFixtureCounts = {};
    const individualTierCompletedCounts = {};
    const individualTierPlayerStats = {};
    const ensure = name => {
      const clean = resolveTeamName(name);
      if (!clean) return null;
      const key = teamKey(clean);
      if (!stats[key]) stats[key] = { name: clean, score: 0, wins: 0, gamesWon: 0, losses: 0, pd: 0 };
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

      if (isRacketlon(value(row, ["Sport"]))) {
        const tierMatch = value(row, ["Tier"]).match(/\d+/);
        const tierNumber = tierMatch ? Number(tierMatch[0]) : 0;
        if (tierNumber >= 1 && tierNumber <= 9) {
          const tierKey = String(tierNumber);
          racketlonTierFixtureCounts[tierKey] = (racketlonTierFixtureCounts[tierKey] || 0) + 1;
          if (winnerKey) {
            racketlonTierCompletedCounts[tierKey] = (racketlonTierCompletedCounts[tierKey] || 0) + 1;
          }
        }
      } else {
        const sportName = value(row, ["Sport"]);
        const tierName = value(row, ["Tier"]);
        if (sportName && tierName && (value(row, ["Player 1", "Player1", "Player 1 Name", "Player1Name"]) || value(row, ["Player 2", "Player2", "Player 2 Name", "Player2Name"]))) {
          const groupKey = `${norm(sportName)}|||${norm(tierName)}`;
          individualTierFixtureCounts[groupKey] = individualTierFixtureCounts[groupKey] || { sport: sportName, tier: tierName, count: 0 };
          individualTierFixtureCounts[groupKey].count++;
          if (winnerKey) individualTierCompletedCounts[groupKey] = (individualTierCompletedCounts[groupKey] || 0) + 1;
        }
      }

      const racketlonRow = isRacketlon(value(row, ["Sport"]));
      const tierMatch = value(row, ["Tier"]).match(/\d+/);
      const tierNumber = tierMatch ? Number(tierMatch[0]) : 0;
      const tierKey = String(tierNumber);
      const p1 = value(row, ["Player 1", "Player1", "Player 1 Name", "Player1Name"]);
      const p2 = value(row, ["Player 2", "Player2", "Player 2 Name", "Player2Name"]);
      const teamA = resolveTeamName(playerTeam(p1) || a);
      const teamB = resolveTeamName(playerTeam(p2) || b);

      if (!racketlonRow && (p1 || p2) && value(row, ["Sport"]) && value(row, ["Tier"])) {
        const sportName = value(row, ["Sport"]);
        const tierName = value(row, ["Tier"]);
        const groupKey = `${norm(sportName)}|||${norm(tierName)}`;
        const players = individualTierPlayerStats[groupKey] ||= {};
        const addPlayer = (playerName, playerTeamName) => {
          const key = norm(playerName);
          if (!key) return null;
          players[key] ||= { name: playerName, team: playerTeamName || "", wins: 0, gamesWon: 0, losses: 0, pd: 0 };
          if (!players[key].team && playerTeamName) players[key].team = playerTeamName;
          return players[key];
        };
        addPlayer(p1, teamA);
        if (p2) addPlayer(p2, teamB);
      }

      fixtureHeaders.forEach((h, i) => {
        if (!/^(?:game|set)\d+/.test(norm(h))) return;
        const parsed = parseScore(row[i]);
        if (!parsed) return;
        if (!racketlonRow) {
          const sportName = value(row, ["Sport"]);
          const tierName = value(row, ["Tier"]);
          const groupKey = `${norm(sportName)}|||${norm(tierName)}`;
          const players = individualTierPlayerStats[groupKey] ||= {};
          const playerA = p1 ? (players[norm(p1)] ||= { name: p1, team: teamA, wins: 0, gamesWon: 0, losses: 0, pd: 0 }) : null;
          const playerB = p2 ? (players[norm(p2)] ||= { name: p2, team: teamB, wins: 0, gamesWon: 0, losses: 0, pd: 0 }) : null;
          if (playerA) { playerA.pd += parsed[0] - parsed[1]; if (parsed[0] > parsed[1]) playerA.gamesWon++; else if (parsed[0] < parsed[1]) playerA.losses++; }
          if (playerB) { playerB.pd += parsed[1] - parsed[0]; if (parsed[1] > parsed[0]) playerB.gamesWon++; else if (parsed[1] < parsed[0]) playerB.losses++; }
        }
        if (a) {
          ensure(a).pd += parsed[0] - parsed[1];
          if (parsed[0] > parsed[1]) ensure(a).gamesWon++;
          else if (parsed[0] < parsed[1]) ensure(a).losses++;
        }
        if (b) {
          ensure(b).pd += parsed[1] - parsed[0];
          if (parsed[1] > parsed[0]) ensure(b).gamesWon++;
          else if (parsed[1] < parsed[0]) ensure(b).losses++;
        }

        // Mirror Racketlon Player Scores: sum each side's entered game points,
        // then combine the player totals by their team for this tier.
        if (racketlonRow && tierNumber >= 1 && tierNumber <= 9 && (p1 || p2)) {
          const tierTeams = racketlonTierTeamPoints[tierKey] ||= {};
          if (teamA) tierTeams[teamKey(teamA)] = tierTeams[teamKey(teamA)] || { name: teamA, points: 0 };
          if (teamB) tierTeams[teamKey(teamB)] = tierTeams[teamKey(teamB)] || { name: teamB, points: 0 };
          if (teamA && p1) tierTeams[teamKey(teamA)].points += parsed[0];
          if (teamB && p2) tierTeams[teamKey(teamB)].points += parsed[1];

          // Keep each player's tier total as well, so equal team totals can
          // be resolved using the same individual ranking criteria.
          const tierPlayers = racketlonTierPlayerPoints[tierKey] ||= {};
          if (p1) {
            const playerKey = norm(p1);
            tierPlayers[playerKey] ||= { name: p1, team: teamA, points: 0, tier: value(row, ["Tier"]) };
            if (!tierPlayers[playerKey].team && teamA) tierPlayers[playerKey].team = teamA;
            tierPlayers[playerKey].points += parsed[0];
          }
          if (p2) {
            const playerKey = norm(p2);
            tierPlayers[playerKey] ||= { name: p2, team: teamB, points: 0, tier: value(row, ["Tier"]) };
            if (!tierPlayers[playerKey].team && teamB) tierPlayers[playerKey].team = teamB;
            tierPlayers[playerKey].points += parsed[1];
          }
        }
      });

      if (!racketlonRow && winnerKey) {
        const sportName = value(row, ["Sport"]);
        const tierName = value(row, ["Tier"]);
        const groupKey = `${norm(sportName)}|||${norm(tierName)}`;
        const players = individualTierPlayerStats[groupKey] ||= {};
        if (p1 && teamKey(teamA) === winnerKey) {
          const player = players[norm(p1)] ||= { name: p1, team: teamA, wins: 0, gamesWon: 0, losses: 0, pd: 0 };
          player.wins++;
        }
        if (p2 && teamKey(teamB) === winnerKey) {
          const player = players[norm(p2)] ||= { name: p2, team: teamB, wins: 0, gamesWon: 0, losses: 0, pd: 0 };
          player.wins++;
        }
      }
    });

    const racketlonTierIssues = [];
    const individualTierIssues = [];
    Object.entries(racketlonTierFixtureCounts).forEach(([tier, fixtureCount]) => {
      const completedCount = racketlonTierCompletedCounts[tier] || 0;
      if (completedCount < fixtureCount) {
        racketlonTierIssues.push(`Tier ${tier}: ${completedCount}/${fixtureCount} fixtures have a winning team`);
        return;
      }

      const teams = Object.values(racketlonTierTeamPoints[tier] || {});
      if (!teams.length) {
        racketlonTierIssues.push(`Tier ${tier}: no Racketlon player scores available`);
        return;
      }

      const players = Object.values(racketlonTierPlayerPoints[tier] || {});
      const headToHeadPoints = new Map();
      const playersByTotal = new Map();

      // Match the existing Racketlon Player Scores tie-break: Total Points,
      // then head-to-head points within each equal-Total-Points group.
      players.forEach(player => {
        const scoreKey = String(player.points);
        if (!playersByTotal.has(scoreKey)) playersByTotal.set(scoreKey, []);
        playersByTotal.get(scoreKey).push(player);
      });

      playersByTotal.forEach(tiedPlayers => {
        if (tiedPlayers.length < 2) return;
        const tiedPlayerKeys = new Set(tiedPlayers.map(player => norm(player.name)));
        tiedPlayerKeys.forEach(key => headToHeadPoints.set(key, 0));

        fixtureRows.forEach(row => {
          if (!isRacketlon(value(row, ["Sport"]))) return;
          if (norm(value(row, ["Tier"])) !== norm(tiedPlayers[0]?.tier)) return;
          const p1 = value(row, ["Player 1", "Player1", "Player 1 Name", "Player1Name"]);
          const p2 = value(row, ["Player 2", "Player2", "Player 2 Name", "Player2Name"]);
          const key1 = norm(p1);
          const key2 = norm(p2);
          if (!p1 || !p2 || !tiedPlayerKeys.has(key1) || !tiedPlayerKeys.has(key2) || key1 === key2) return;

          fixtureHeaders.forEach((header, index) => {
            if (!/^(?:game|set)\\d+/.test(norm(header))) return;
            const parsed = parseScore(row[index]);
            if (!parsed) return;
            headToHeadPoints.set(key1, (headToHeadPoints.get(key1) || 0) + parsed[0]);
            headToHeadPoints.set(key2, (headToHeadPoints.get(key2) || 0) + parsed[1]);
          });
        });
      });

      const playerRank = (a, b) =>
        b.points - a.points ||
        (headToHeadPoints.get(norm(b.name)) || 0) - (headToHeadPoints.get(norm(a.name)) || 0) ||
        a.name.localeCompare(b.name);

      // Each team is represented by its highest-ranked Racketlon player.
      // This applies the same head-to-head ranking when team game-score
      // totals are tied, while still ranking every team in the tier.
      const teamLeader = new Map();
      teams.forEach(team => {
        const leader = players
          .filter(player => player.team && teamKey(player.team) === teamKey(team.name))
          .sort(playerRank)[0];
        if (leader) teamLeader.set(teamKey(team.name), leader);
      });

      teams.sort((a, b) => {
        const scoreDifference = b.points - a.points;
        if (scoreDifference) return scoreDifference;
        const leaderA = teamLeader.get(teamKey(a.name));
        const leaderB = teamLeader.get(teamKey(b.name));
        if (leaderA && leaderB) return playerRank(leaderA, leaderB);
        if (leaderA) return -1;
        if (leaderB) return 1;
        return a.name.localeCompare(b.name);
      });

      [6, 4, 2, 1].forEach((points, index) => {
        const team = teams[index];
        if (team) ensure(team.name).score += points;
      });
    });

    Object.entries(individualTierFixtureCounts).forEach(([groupKey, group]) => {
      const completed = individualTierCompletedCounts[groupKey] || 0;
      if (completed < group.count) {
        individualTierIssues.push(`${group.sport} ${group.tier}: ${completed}/${group.count} fixtures have a winning team`);
        return;
      }
      const rankedPlayers = Object.values(individualTierPlayerStats[groupKey] || {}).sort((a, b) =>
        b.wins - a.wins ||
        (b.gamesWon - b.losses) - (a.gamesWon - a.losses) ||
        b.pd - a.pd ||
        a.name.localeCompare(b.name)
      );
      if (!rankedPlayers.length) {
        individualTierIssues.push(`${group.sport} ${group.tier}: no Individual player results available`);
        return;
      }
      [6, 4, 2, 1].forEach((points, index) => {
        const player = rankedPlayers[index];
        if (player?.team) ensure(player.team).score += points;
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
      b.score - a.score ||
      b.wins - a.wins ||
      (b.gamesWon - b.losses) - (a.gamesWon - a.losses) ||
      b.pd - a.pd || a.name.localeCompare(b.name)
    );

    body.innerHTML = entries.length
      ? entries.map((x, i) => `<tr class="${i === 0 ? "team-top-row" : ""}"><td>${esc(x.name)}</td><td>${x.score}</td><td>${x.wins}</td><td>${x.gamesWon}</td><td>${x.losses}</td><td>${x.gamesWon - x.losses > 0 ? "+" : ""}${x.gamesWon - x.losses}</td><td>${x.pd > 0 ? "+" : ""}${x.pd}</td></tr>`).join("")
      : '<tr><td colspan="7">No team results available.</td></tr>';
    table.classList.remove("hidden");
    if (msg) msg.textContent = entries.length
      ? `${entries.length} team(s) shown.${racketlonTierIssues.length ? " Racketlon tier points: " + racketlonTierIssues.join("; ") + "." : ""}${individualTierIssues.length ? " Individual tier points: " + individualTierIssues.join("; ") + "." : ""}`
      : "Results will appear here after fixture scores are entered.";
  }

  function renderPlayerResults() {
    const sport = activeTab === "nonRacketlon" ? norm(playerScoreFilterState[activeTab].sport) : "";
    const tier = norm(playerScoreFilterState[activeTab].tier);

    const playerScores = {};
    const ensure = (sportName, tierName, player, team) => {
      const key = `${norm(sportName)}|||${norm(tierName)}|||${norm(player)}`;
      if (!playerScores[key]) playerScores[key] = { sport: sportName, tier: tierName, player, team: "", points: 0, wins: 0, gamesWon: 0, losses: 0, pd: 0 };
      if (team && !playerScores[key].team) playerScores[key].team = resolveTeamName(team);
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

      const [fixtureTeamA, fixtureTeamB] = matchTeams(row);
      const teamA = resolveTeamName(playerTeam(p1) || fixtureTeamA);
      const teamB = resolveTeamName(playerTeam(p2) || fixtureTeamB);
      const a = p1 ? ensure(sportName, tierName, p1, teamA) : null;
      const b = p2 ? ensure(sportName, tierName, p2, teamB) : null;
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
          if (parsed[0] > parsed[1] && a) a.gamesWon++;
          if (parsed[1] > parsed[0] && b) b.gamesWon++;
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

    Object.values(groups).forEach(group => {
      if (activeTab === "racketlon") {
        // Apply head-to-head separately to every Total Points tie group.
        const headToHeadPoints = new Map();
        const tiedScoreGroups = new Map();
        group.forEach(player => {
          const scoreKey = String(player.points);
          (tiedScoreGroups.get(scoreKey) || tiedScoreGroups.set(scoreKey, []).get(scoreKey)).push(player);
        });

        tiedScoreGroups.forEach(tiedGroup => {
          if (tiedGroup.length < 2) return;
          const tiedPlayers = new Set(tiedGroup.map(x => norm(x.player)));
          tiedPlayers.forEach(player => headToHeadPoints.set(player, 0));

          fixtureRows.forEach(row => {
            if (!isRacketlon(value(row, ["Sport"]))) return;
            if (norm(value(row, ["Tier"])) !== norm(tiedGroup[0]?.tier)) return;

            const p1 = value(row, ["Player 1", "Player1", "Player 1 Name", "Player1Name"]);
            const p2 = value(row, ["Player 2", "Player2", "Player 2 Name", "Player2Name"]);
            const key1 = norm(p1);
            const key2 = norm(p2);
            if (!p1 || !p2 || !tiedPlayers.has(key1) || !tiedPlayers.has(key2) || key1 === key2) return;

            fixtureHeaders.forEach((h, i) => {
              if (!/^(?:game|set)\d+/.test(norm(h))) return;
              const parsed = parseScore(row[i]);
              if (!parsed) return;
              headToHeadPoints.set(key1, (headToHeadPoints.get(key1) || 0) + parsed[0]);
              headToHeadPoints.set(key2, (headToHeadPoints.get(key2) || 0) + parsed[1]);
            });
          });
        });

        group.sort((a, b) =>
          b.points - a.points ||
          (headToHeadPoints.get(norm(b.player)) || 0) - (headToHeadPoints.get(norm(a.player)) || 0) ||
          a.player.localeCompare(b.player)
        );
      } else {
        group.sort((a, b) =>
          b.wins - a.wins ||
          (b.gamesWon - b.losses) - (a.gamesWon - a.losses) ||
          b.pd - a.pd ||
          a.player.localeCompare(b.player)
        );
      }
    });

    const head = $("playerScoresHead");
    if (head) {
      head.innerHTML = activeTab === "racketlon"
        ? "<tr><th>Sport</th><th>Tier</th><th>Player Name</th><th>Team</th><th>Total Points</th></tr>"
        : "<tr><th>Sport</th><th>Tier</th><th>Player Name</th><th>Team</th><th>Matches Won</th><th>Games Won</th><th>Games Lost</th><th>Net Game Difference</th><th>Point Difference</th></tr>";
    }

    const body = $("playerScoresBody");
    const groupKeys = Object.keys(groups).sort((a, b) => {
      const tierA = groups[a]?.[0]?.tier || "";
      const tierB = groups[b]?.[0]?.tier || "";
      const isDblA = norm(tierA) === "dbl";
      const isDblB = norm(tierB) === "dbl";
      if (isDblA !== isDblB) return isDblA ? 1 : -1;

      const numA = Number((String(tierA).match(/\\d+(?:\\.\\d+)?/) || [])[0]);
      const numB = Number((String(tierB).match(/\\d+(?:\\.\\d+)?/) || [])[0]);
      const hasNumA = Number.isFinite(numA);
      const hasNumB = Number.isFinite(numB);
      if (hasNumA && hasNumB && numA !== numB) return numA - numB;
      if (hasNumA !== hasNumB) return hasNumA ? -1 : 1;

      return a.localeCompare(b);
    });
    const rows = groupKeys.flatMap(k => groups[k]);
    const top = new Set(Object.values(groups).map(g => g[0]?.player).filter(Boolean));
    body.innerHTML = rows.length ? rows.map(x => {
      const key = norm(x.sport) + "|||" + norm(x.tier) + "|||" + norm(x.player);
      const cls = [top.has(x.player) ? "racketlon-top-player" : "", selectedPlayerKey === key ? "player-score-selected-row" : ""].filter(Boolean).join(" ");
      return activeTab === "racketlon"
        ? `<tr class="${cls}" data-player-key="${esc(key)}" tabindex="0"><td>${esc(x.sport)}</td><td>${esc(x.tier)}</td><td>${esc(x.player)}</td><td>${esc(x.team || "—")}</td><td>${x.points}</td></tr>`
        : `<tr class="${cls}" data-player-key="${esc(key)}" tabindex="0"><td>${esc(x.sport)}</td><td>${esc(x.tier)}</td><td>${esc(x.player)}</td><td>${esc(x.team || "—")}</td><td>${x.wins}</td><td>${x.gamesWon}</td><td>${x.losses}</td><td>${x.gamesWon - x.losses > 0 ? "+" : ""}${x.gamesWon - x.losses}</td><td>${x.pd > 0 ? "+" : ""}${x.pd}</td></tr>`;
    }).join("") : `<tr><td colspan="${activeTab === "racketlon" ? 5 : 9}">No player scores available.</td></tr>`;

    $("playerScoresTable")?.classList.remove("hidden");
    renderPlayerScoreView(rows);
    const msg = $("playerScoresMessage");
    if (msg) msg.textContent = activeTab === "racketlon"
      ? `${rows.length} Racketlon player result(s) shown. Ranking: Total Points → Head-to-head points (sum of entered game scores against the other tied player(s)).`
      : `${rows.length} non-Racketlon player result(s) shown. Ranking: Matches Won → Net Game Difference (Games Won − Games Lost) → Point Difference.`;
  }

  function renderPlayerScoreView(rows) {
    const tableWrap = $("playerScoresTableWrap");
    const treeWrap = $("playerScoresTreeView");
    $("playerScoresTableViewBtn")?.classList.toggle("active", playerScoresView === "table");
    $("playerScoresTreeViewBtn")?.classList.toggle("active", playerScoresView === "tree");
    $("playerScoresTableViewBtn")?.setAttribute("aria-pressed", String(playerScoresView === "table"));
    $("playerScoresTreeViewBtn")?.setAttribute("aria-pressed", String(playerScoresView === "tree"));
    tableWrap?.classList.toggle("hidden", playerScoresView !== "table");
    treeWrap?.classList.toggle("hidden", playerScoresView !== "tree");
    if (playerScoresView !== "tree" || !treeWrap) return;

    const selected = rows.find(x => norm(x.sport) + "|||" + norm(x.tier) + "|||" + norm(x.player) === selectedPlayerKey);
    if (!selected) {
      treeWrap.innerHTML = '<div class="player-score-tree-empty">Select a player from the table first, then choose Tree View to see all their recorded matches.</div>';
      return;
    }

    const selectedTeam = resolveTeamName(selected.team || playerTeam(selected.player));
    const matches = [];
    fixtureRows.forEach((row, index) => {
      const sportName = value(row, ["Sport"]), tierName = value(row, ["Tier"]);
      if (norm(sportName) !== norm(selected.sport) || norm(tierName) !== norm(selected.tier)) return;
      if (activeTab === "racketlon" && !isRacketlon(sportName)) return;
      if (activeTab === "nonRacketlon" && isRacketlon(sportName)) return;
      const p1 = value(row, ["Player 1", "Player1", "Player 1 Name", "Player1Name"]);
      const p2 = value(row, ["Player 2", "Player2", "Player 2 Name", "Player2Name"]);
      if (norm(p1) !== norm(selected.player) && norm(p2) !== norm(selected.player)) return;

      const opponent = norm(p1) === norm(selected.player) ? p2 : p1;
      const team1 = resolveTeamName(playerTeam(p1)), team2 = resolveTeamName(playerTeam(p2));
      const opponentTeam = norm(p1) === norm(selected.player) ? team2 : team1;
      const winningTeam = resolveTeamName(value(row, ["Winning Team", "Winner Team", "Winner"]));
      const gameDetails = [];

      if (isRacketlon(sportName)) {
        [
          { label: "Badminton", index: 7 },
          { label: "Lawn Tennis", index: 8 },
          { label: "Table Tennis", index: 9 },
          { label: "Pickleball", index: 10 }
        ].forEach(game => {
          const raw = String(row[game.index] ?? "").trim();
          if (!raw) return;
          const score = parseScore(raw);
          const gameWinner = score ? (score[0] > score[1] ? p1 : score[1] > score[0] ? p2 : "Draw") : "";
          gameDetails.push({ label: game.label, score: raw, winner: gameWinner });
        });
      } else {
        fixtureHeaders.forEach((header, i) => {
          if (!/^(?:game|set)\d+/i.test(norm(header))) return;
          const raw = String(row[i] ?? "").trim();
          if (!raw) return;
          const score = parseScore(raw);
          const gameWinner = score ? (score[0] > score[1] ? p1 : score[1] > score[0] ? p2 : "Draw") : "";
          gameDetails.push({ label: header, score: raw, winner: gameWinner });
        });
      }

      let winnerName = "";
      if (gameDetails.length) {
        const p1Wins = gameDetails.filter(g => norm(g.winner) === norm(p1)).length;
        const p2Wins = gameDetails.filter(g => norm(g.winner) === norm(p2)).length;
        if (p1Wins > p2Wins) winnerName = p1;
        else if (p2Wins > p1Wins) winnerName = p2;
      }
      if (!winnerName && winningTeam) {
        if (team1 && teamKey(team1) === teamKey(winningTeam)) winnerName = p1;
        else if (team2 && teamKey(team2) === teamKey(winningTeam)) winnerName = p2;
      }

      matches.push({
        opponent, opponentTeam, winnerName, winningTeam,
        date: value(row, ["Date", "Match Date", "Fixture Date"]),
        gameDetails
      });
    });

    const matchItems = matches.length ? matches.map((m, i) => {
      const details = [];
      if (m.date) details.push('<span><strong>Date:</strong> ' + esc(m.date) + '</span>');
      if (m.gameDetails.length) {
        m.gameDetails.forEach(game => {
          details.push('<span class="player-score-tree-game"><strong>' + esc(game.label) + ':</strong> ' + esc(game.score) +
            (game.winner ? ' <span class="player-score-tree-game-winner">· Winner: ' + esc(game.winner) + '</span>' : '') + '</span>');
        });
      } else {
        details.push('<span>' + (m.winningTeam ? 'Result recorded for ' + esc(m.winningTeam) : 'No result entered yet') + '</span>');
      }
      return '<li class="player-score-tree-match"><span class="player-score-tree-dot"></span>' +
        '<div class="player-score-tree-match-title">Match ' + (i + 1) + '</div>' +
        '<div class="player-score-tree-match-meta">' +
        '<span><strong>Against:</strong> ' + esc(m.opponent || "—") + (m.opponentTeam ? ' (' + esc(m.opponentTeam) + ')' : '') + '</span>' +
        '<span><strong>Winner:</strong> ' + esc(m.winnerName || (m.winningTeam ? m.winningTeam : "Not recorded")) + '</span>' +
        details.join("") + '</div></li>';
    }).join("") : '<li class="player-score-tree-match">No matching fixtures found for this player in the selected sport and tier.</li>';

    treeWrap.innerHTML = '<div class="player-score-tree-player">👤 ' + esc(selected.player) +
      '<span>' + esc(selected.sport) + ' · ' + esc(selected.tier) + ' · ' + esc(selectedTeam || "Team not available") + '</span></div>' +
      '<ol class="player-score-tree-list">' + matchItems + '</ol>';
  }

  function render() {
    refreshFilters();
    renderTeamResults();
    renderPlayerResults();
  }


  // Admin-only export in the SRGF Sports match-upload CSV format.
  // Player values are names from FIXTURES columns E and F (not player IDs).
  function updateExportButtonVisibility() {
    const button = $("exportResultsBtn");
    if (!button) return;
    button.classList.toggle("hidden", !SRGFAuth.canAuction());
  }

  function csvCell(value) {
    const text = String(value ?? "");
    return /[",\\r\\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
  }

  function exportResultsCsv() {
    if (!SRGFAuth.canAuction()) return;

    const headers = [
      "Match ID", "Match Date", "Sport", "Format",
      "Player 1 ID", "Player 2 ID", "Player 3 ID", "Player 4 ID",
      "Result", "Status", "Notes"
    ];
    const exportDate = new Date();
    const dateText = [
      exportDate.getFullYear(),
      String(exportDate.getMonth() + 1).padStart(2, "0"),
      String(exportDate.getDate()).padStart(2, "0")
    ].join("-");
    const records = [];
    let matchNumber = 0;

    function addRecord(sport, p1, p2, result) {
      if (!p1 || !p2 || !result) return;
      matchNumber += 1;
      records.push([
        "E0001M" + String(matchNumber).padStart(4, "0"),
        dateText,
        sport,
        "Singles",
        p1,
        p2,
        "",
        "",
        result,
        "Completed",
        ""
      ]);
    }

    fixtureRows.forEach(row => {
      const sport = String(row[0] ?? "").trim();
      const p1 = String(row[4] ?? "").trim();
      const p2 = String(row[5] ?? "").trim();
      if (!sport || !p1 || !p2) return;

      if (isRacketlon(sport)) {
        // FIXTURES score columns: H=Badminton, I=Lawn Tennis,
        // J=Table Tennis, K=Pickleball.
        [
          { sport: "Bad", column: 7 },
          { sport: "TT", column: 9 },
          { sport: "LT", column: 8 },
          { sport: "PB", column: 10 }
        ].forEach(item => {
          const scoreText = String(row[item.column] ?? "").trim();
          if (!scoreText) return;
          const score = parseScore(scoreText);
          if (!score) return;
          const result = score[0] > score[1]
            ? "Side 1 Win"
            : score[0] < score[1] ? "Side 2 Win" : "Draw";
          addRecord(item.sport, p1, p2, result);
        });
        return;
      }

      // For non-Racketlon fixtures, Column G stores the winning team.
      const winningTeam = resolveTeamName(String(row[6] ?? "").trim());
      if (!winningTeam) return;
      const team1 = resolveTeamName(playerTeam(p1));
      const team2 = resolveTeamName(playerTeam(p2));
      let result = "";
      if (team1 && teamKey(team1) === teamKey(winningTeam)) result = "Side 1 Win";
      else if (team2 && teamKey(team2) === teamKey(winningTeam)) result = "Side 2 Win";
      else {
        // Fallback to the fixture's explicit team fields if player-team
        // membership is not present in the Teams payload.
        const fixtureTeams = matchTeams(row);
        if (fixtureTeams[0] && teamKey(fixtureTeams[0]) === teamKey(winningTeam)) result = "Side 1";
        else if (fixtureTeams[1] && teamKey(fixtureTeams[1]) === teamKey(winningTeam)) result = "Side 2";
      }
      if (result) addRecord(sport, p1, p2, result);
    });

    if (!records.length) {
      alert("No completed fixture results are available to export.");
      return;
    }

    const csv = "\uFEFF" + [headers, ...records]
      .map(row => row.map(csvCell).join(","))
      .join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "SRGF_Racketlon_2027_Results_" + dateText + ".csv";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function bindTabs() {
    $("playerScoresTableViewBtn")?.addEventListener("click", () => { playerScoresView = "table"; render(); });
    $("playerScoresBody")?.addEventListener("click", event => {
      const row = event.target.closest("tr[data-player-key]");
      if (!row) return;
      selectedPlayerKey = row.dataset.playerKey || "";
      // Update selection styling without rebuilding the table. Rebuilding on
      // the first click removes the row before the browser can emit dblclick.
      $("playerScoresBody")?.querySelectorAll("tr[data-player-key]").forEach(item => {
        item.classList.toggle("player-score-selected-row", item === row);
      });
    });
    $("playerScoresBody")?.addEventListener("dblclick", event => {
      const row = event.target.closest("tr[data-player-key]");
      if (!row) return;
      selectedPlayerKey = row.dataset.playerKey || "";
      playerScoresView = "tree";
      render();
    });
    $("playerScoresBody")?.addEventListener("keydown", event => {
      if (event.key !== "Enter" && event.key !== " ") return;
      const row = event.target.closest("tr[data-player-key]");
      if (!row) return;
      event.preventDefault();
      selectedPlayerKey = row.dataset.playerKey || "";
      render();
    });
    const r = $("playerScoresRacketlonTab");
    const n = $("playerScoresNonRacketlonTab");
    r?.addEventListener("click", () => {
      capturePlayerScoreFilterState();
      activeTab = "racketlon";
      r.classList.add("active"); r.setAttribute("aria-selected", "true");
      n?.classList.remove("active"); n?.setAttribute("aria-selected", "false");
      render();
    });
    n?.addEventListener("click", () => {
      capturePlayerScoreFilterState();
      activeTab = "nonRacketlon";
      n.classList.add("active"); n.setAttribute("aria-selected", "true");
      r?.classList.remove("active"); r?.setAttribute("aria-selected", "false");
      render();
    });
    $("resultPlayerSportFilter")?.addEventListener("change", () => {
      playerScoreFilterState[activeTab].sport = $("resultPlayerSportFilter")?.value || "";
      render();
    });
    $("resultPlayerTierFilter")?.addEventListener("change", () => {
      playerScoreFilterState[activeTab].tier = $("resultPlayerTierFilter")?.value || "";
      render();
    });
  }

  async function load() {
    capturePlayerScoreFilterState();

    try {
      const d = await loadLiveFirstAll();
      applyLiveData_(d.data || {});
      render();

      if (d.live) {
        setStatus("LIVE · Google Sheet");
      } else {
        setStatus("Connecting to Google Sheets…");
      }

      // If the page started from browser cache or GitHub JSON, keep retrying
      // in the background. As soon as Google Sheets is reachable, replace the
      // displayed data without requiring another page refresh.
      if (d.retryPromise) {
        d.retryPromise.then(latest => {
          applyLiveData_(latest.data || {});
          render();
          setStatus("LIVE · Google Sheet");
        }).catch(() => {});
      }
    } catch (e) {
      setStatus("Waiting for Google Sheets…", true);
    }
  }

  bindTabs();
  updateExportButtonVisibility();
  window.addEventListener("srgf-auth-change", updateExportButtonVisibility);
  $("exportResultsBtn")?.addEventListener("click", exportResultsCsv);
  await load();
});
