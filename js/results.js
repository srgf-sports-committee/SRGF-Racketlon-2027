document.addEventListener("DOMContentLoaded", async ()=>{
  const {loadJsonDataset,$,esc,setStatus,loadJsonFreshness,nav,live,C}=SRGF;
  SRGFAuth.init();
  nav("results");

  let fixtureData={headers:[],rows:[]};
  let teams=[];
  let players=[];
  window.activePlayerScoreTab="racketlon";
  window.playerScoreTierFilters=window.playerScoreTierFilters || {racketlon:"", nonRacketlon:""};

  const norm=s=>String(s??"").trim().toLowerCase().replace(/[^a-z0-9]+/g,"");
  const parseScore=raw=>{
    const m=String(raw??"").match(/^\s*(-?\d+(?:\.\d+)?)\s*-\s*(-?\d+(?:\.\d+)?)\s*$/);
    return m ? [Number(m[1]),Number(m[2])] : null;
  };
  const isRacketlon=s=>norm(s)==="racketlon";

  function makeFixtureData(data){
    if(data && Array.isArray(data.headers) && Array.isArray(data.rows)) return {headers:data.headers,rows:data.rows};
    if(Array.isArray(data) && data.length){
      const headers=Object.keys(data[0]||{});
      return {headers,rows:data.map(r=>headers.map(h=>r[h]??""))};
    }
    return {headers:[],rows:[]};
  }

  function headerIndex(headers,name){
    const wanted=norm(name);
    let i=headers.findIndex(h=>norm(h)===wanted);
    if(i>=0) return i;
    i=headers.findIndex(h=>norm(h).startsWith(wanted));
    return i;
  }

  function value(row,headers,name){
    const i=headerIndex(headers,name);
    return i<0 ? "" : String(row[i]??"").trim();
  }

  function fixtureTeamName(v){
    const s=String(v??"").trim();
    if(!s) return "";
    const m=s.match(/^team\s*[-_]?\s*(\d+)$/i);
    if(m) return `Team ${m[1]}`;
    const t=s.match(/^t\s*[-_]?\s*(\d+)$/i);
    if(t) return `T${t[1]}`;
    return s;
  }

  function teamKey(v){
    const s=norm(v);
    const m=s.match(/(?:team|t)(\d+)$/);
    return m ? `t${m[1]}` : s;
  }

  function playerTeam(playerName){
    const target=norm(playerName);
    if(!target) return "";
    const p=players.find(x=>norm(x.name||x["Player Name"]||x.Player||x["Name"])===target);
    return p ? (p.team||p["Team"]||p["Team Name"]||p.teamName||"") : "";
  }

  function matchTeams(row,headers){
    for(let i=0;i<headers.length;i++){
      if(!/^(match|fixture)$/i.test(String(headers[i]||"").trim())) continue;
      const raw=String(row[i]??"").trim();
      if(!raw) continue;
      let parts=raw.split(/\s+(?:vs|v)\s+/i).map(x=>x.trim()).filter(Boolean);
      if(parts.length<2) parts=raw.split(/(?:vs|v)/i).map(x=>x.trim()).filter(Boolean);
      if(parts.length>=2) return [fixtureTeamName(parts[0]),fixtureTeamName(parts[1])];
    }
    const team1=value(row,headers,"team 1") || value(row,headers,"team1");
    const team2=value(row,headers,"team 2") || value(row,headers,"team2");
    if(team1 || team2) return [fixtureTeamName(team1),fixtureTeamName(team2)];
    return [fixtureTeamName(playerTeam(value(row,headers,"player 1"))),fixtureTeamName(playerTeam(value(row,headers,"player 2")))];
  }

  function refreshSportFilter(){
    const select=$("resultPlayerSportFilter");
    if(!select) return;
    const current=select.value;
    const i=headerIndex(fixtureData.headers,"sport");
    const sports=i>=0 ? [...new Set(fixtureData.rows.map(r=>String(r[i]??"").trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b)) : [];
    select.innerHTML='<option value="">All Sports</option>'+sports.map(s=>`<option value="${esc(s)}">${esc(s)}</option>`).join("");
    if(sports.includes(current)) select.value=current;
  }

  function refreshTierFilter(){
    const select=$("resultPlayerTierFilter");
    if(!select) return;
    const active=window.activePlayerScoreTab;
    const saved=window.playerScoreTierFilters[active]||"";
    const i=headerIndex(fixtureData.headers,"tier");
    const tiers=i>=0 ? [...new Set(fixtureData.rows.map(r=>String(r[i]??"").trim()).filter(Boolean))].sort((a,b)=>{
      const na=Number((a.match(/\d+(?:\.\d+)?/)||[])[0]);
      const nb=Number((b.match(/\d+(?:\.\d+)?/)||[])[0]);
      return Number.isFinite(na)&&Number.isFinite(nb) ? na-nb : a.localeCompare(b);
    }) : [];
    select.innerHTML='<option value="">All Tiers</option>'+tiers.map(t=>`<option value="${esc(t)}">${esc(t)}</option>`).join("");
    select.value=tiers.includes(saved)?saved:"";
  }

  function syncTier(){
    const select=$("resultPlayerTierFilter");
    if(select) window.playerScoreTierFilters[window.activePlayerScoreTab]=String(select.value||"");
  }

  function render(){
    const rows=fixtureData.rows||[];
    const headers=fixtureData.headers||[];
    const teamBody=$("teamPointsBody"), teamTable=$("teamPointsTable"), teamMsg=$("teamPointsMessage");
    const playerBody=$("playerScoresBody"), playerTable=$("playerScoresTable"), playerMsg=$("playerScoresMessage");

    refreshSportFilter();
    refreshTierFilter();

    if(!rows.length || !headers.length){
      teamBody.innerHTML='<tr><td colspan="5" class="notice">No fixture results available.</td></tr>';
      teamTable.classList.remove("hidden");
      teamMsg.textContent="Results will appear here after fixture scores are entered.";
      playerBody.innerHTML='<tr><td colspan="6" class="notice">No player scores available.</td></tr>';
      playerTable.classList.remove("hidden");
      playerMsg.textContent=window.activePlayerScoreTab==="racketlon" ? "Racketlon Player Scores are calculated from the sum of points." : "Non Racketlon player scores are calculated from fixture results.";
      return;
    }

    const teamStats={};
    const ensureTeam=name=>{
      const clean=String(name||"").trim();
      if(!clean) return null;
      if(!teamStats[clean]) teamStats[clean]={score:0,wins:0,losses:0,pd:0};
      return teamStats[clean];
    };

    rows.forEach(row=>{
      const winner=fixtureTeamName(value(row,headers,"winning team"));
      const pointsRaw=value(row,headers,"points");
      const pm=pointsRaw.replace(/,/g,"").match(/-?\d+(?:\.\d+)?/);
      const points=pm?Number(pm[0]):0;
      const [a,b]=matchTeams(row,headers);
      if(a) ensureTeam(a); if(b) ensureTeam(b);
      if(winner && Number.isFinite(points)) ensureTeam(winner).score+=points;
      if(winner){
        const wk=teamKey(winner);
        if(a && teamKey(a)===wk) ensureTeam(a).wins++;
        else if(b && teamKey(b)===wk) ensureTeam(b).wins++;
      }
      headers.forEach((h,i)=>{
        if(!/^(game|set)\d+/.test(norm(h))) return;
        const sc=parseScore(row[i]); if(!sc) return;
        if(a){ensureTeam(a).pd+=sc[0]-sc[1]; if(sc[0]<sc[1]) ensureTeam(a).losses++;}
        if(b){ensureTeam(b).pd+=sc[1]-sc[0]; if(sc[1]<sc[0]) ensureTeam(b).losses++;}
      });
    });

    teams.forEach(t=>{const name=String(t.name||t["Team Name"]||t.Team||t.id||t["Team ID"]||"").trim(); if(name) ensureTeam(name);});
    const teamEntries=Object.entries(teamStats).sort((a,b)=>b[1].score-a[1].score||b[1].wins-a[1].wins||a[1].losses-b[1].losses||b[1].pd-a[1].pd||a[0].localeCompare(b[0]));
    teamBody.innerHTML=teamEntries.length ? teamEntries.map(([name,s],i)=>`<tr class="${i===0?"team-top-row":""}"><td>${esc(name)}</td><td class="result-total">${s.score}</td><td>${s.wins}</td><td>${s.losses}</td><td>${s.pd>0?"+":""}${s.pd}</td></tr>`).join("") : '<tr><td colspan="5" class="notice">No winning teams recorded yet.</td></tr>';
    teamTable.classList.remove("hidden");
    teamMsg.textContent=teamEntries.length?`${teamEntries.length} team(s) shown.`:"Results will appear here after fixture scores are entered.";

    const active=window.activePlayerScoreTab;
    const sportWrap=$("playerScoreSportFilterWrap");
    const filterBox=$("playerScoreFilters");
    if(sportWrap) sportWrap.classList.toggle("hidden",active!=="nonRacketlon");
    if(filterBox){filterBox.classList.toggle("player-score-filters-racketlon",active==="racketlon");filterBox.classList.toggle("player-score-filters-non-racketlon",active!=="racketlon");}
    const sportFilter=active==="nonRacketlon" ? norm($("resultPlayerSportFilter")?.value) : "";
    const tierFilter=norm($("resultPlayerTierFilter")?.value);

    const playerStats={};
    const ensurePlayer=(sport,tier,name)=>{
      const key=`${sport}|||${tier}|||${name}`;
      if(!playerStats[key]) playerStats[key]={sport,tier,name,points:0,wins:0,lost:0,diff:0};
      return playerStats[key];
    };

    rows.forEach(row=>{
      const sport=value(row,headers,"sport");
      const tier=value(row,headers,"tier");
      const p1=value(row,headers,"player 1");
      const p2=value(row,headers,"player 2");
      if(!sport||!tier||(!p1&&!p2)) return;
      const rack=isRacketlon(sport);
      if(active==="racketlon" && !rack) return;
      if(active==="nonRacketlon" && rack) return;
      if(sportFilter && norm(sport)!==sportFilter) return;
      if(tierFilter && norm(tier)!==tierFilter) return;
      const a=p1?ensurePlayer(sport,tier,p1):null, b=p2?ensurePlayer(sport,tier,p2):null;

      for(let n=1;n<=4;n++){
        const idx=headerIndex(headers,`game ${n}`)>=0?headerIndex(headers,`game ${n}`):headerIndex(headers,`set ${n}`);
        const sc=idx>=0?parseScore(row[idx]):null;
        if(!sc) continue;
        if(rack){ if(a)a.points+=sc[0]; if(b)b.points+=sc[1]; }
        else { if(sc[0]>sc[1]){if(b)b.lost++;} else if(sc[1]>sc[0]){if(a)a.lost++;} }
      }

      if(!rack){
        const winner=fixtureTeamName(value(row,headers,"winning team"));
        const wk=teamKey(winner); const [ta,tb]=matchTeams(row,headers);
        if(wk){if(a && ta && teamKey(ta)===wk)a.wins++; if(b && tb && teamKey(tb)===wk)b.wins++;}
        let d1=0,d2=0;
        headers.forEach((h,i)=>{if(!/^(game|set)\d+/.test(norm(h)))return;const sc=parseScore(row[i]);if(!sc)return;d1+=sc[0]-sc[1];d2+=sc[1]-sc[0];});
        if(a)a.diff+=d1;if(b)b.diff+=d2;
      }
    });

    const entries=Object.values(playerStats);
    const groups={};
    entries.forEach(x=>{const key=`${norm(x.sport)}|||${norm(x.tier)}`;(groups[key]??=[]).push(x);});
    Object.values(groups).forEach(g=>g.sort((a,b)=>active==="racketlon" ? b.points-a.points||a.name.localeCompare(b.name) : b.wins-a.wins||a.lost-b.lost||b.diff-a.diff||a.name.localeCompare(b.name)));
    const sorted=Object.keys(groups).sort().flatMap(k=>groups[k]);
    const tops={};Object.entries(groups).forEach(([k,g])=>{if(g[0])tops[k]=g[0].name;});

    const head=$("playerScoresHead");
    if(head) head.innerHTML=active==="racketlon" ? '<tr><th>Sport</th><th>Tier</th><th>Player Name</th><th>Total Points</th></tr>' : '<tr><th>Sport</th><th>Tier</th><th>Player Name</th><th>Matches Won</th><th>Games Lost</th><th>Point Difference</th></tr>';
    playerBody.innerHTML=sorted.length ? sorted.map(x=>{const key=`${norm(x.sport)}|||${norm(x.tier)}`,top=tops[key]===x.name;return active==="racketlon"?`<tr class="${top?"racketlon-top-player":""}"><td>${esc(x.sport)}</td><td>${esc(x.tier)}</td><td>${esc(x.name)}</td><td class="result-total">${x.points}</td></tr>`:`<tr class="${top?"racketlon-top-player":""}"><td>${esc(x.sport)}</td><td>${esc(x.tier)}</td><td>${esc(x.name)}</td><td class="result-total">${x.wins}</td><td>${x.lost}</td><td>${x.diff>0?"+":""}${x.diff}</td></tr>`;}).join(""):`<tr><td colspan="${active==="racketlon"?4:6}" class="notice">No player scores entered yet.</td></tr>`;
    playerTable.classList.remove("hidden");
    playerMsg.textContent=active==="racketlon" ? `${sorted.length} Racketlon player result(s) shown. Ranking: Sum Points.` : `${sorted.length} non-Racketlon player result(s) shown. Ranking: Matches Won → fewer Games Lost → Point Difference.`;
  }

  async function load(){
    let haveJson=false;
    try{
      const [f,t,p]=await Promise.all([loadJsonDataset("fixtures"),loadJsonDataset("teams"),loadJsonDataset("players")]);
      fixtureData=makeFixtureData(f); teams=t.data||[]; players=p.data||[]; render(); haveJson=fixtureData.rows.length>0; await loadJsonFreshness(); setStatus("JSON data");
    }catch(_){ }

    try{
      const d=await live("data");
      if(Array.isArray(d.fixtures)) fixtureData=makeFixtureData(d.fixtures);
      if(Array.isArray(d.teams)) teams=d.teams;
      if(Array.isArray(d.players)) players=d.players;
      render(); setStatus("LIVE · Google Sheet");
    }catch(_){
      if(!haveJson) setStatus("JSON data unavailable",true);
    }
  }

  $("playerScoresRacketlonTab")?.addEventListener("click",()=>{
    syncTier(); window.activePlayerScoreTab="racketlon";
    $("playerScoresRacketlonTab").classList.add("active"); $("playerScoresRacketlonTab").setAttribute("aria-selected","true");
    $("playerScoresNonRacketlonTab").classList.remove("active"); $("playerScoresNonRacketlonTab").setAttribute("aria-selected","false"); render();
  });
  $("playerScoresNonRacketlonTab")?.addEventListener("click",()=>{
    syncTier(); window.activePlayerScoreTab="nonRacketlon";
    $("playerScoresNonRacketlonTab").classList.add("active"); $("playerScoresNonRacketlonTab").setAttribute("aria-selected","true");
    $("playerScoresRacketlonTab").classList.remove("active"); $("playerScoresRacketlonTab").setAttribute("aria-selected","false"); render();
  });
  $("resultPlayerSportFilter")?.addEventListener("change",render);
  $("resultPlayerTierFilter")?.addEventListener("change",()=>{syncTier();render();});

  await load();
  setInterval(()=>{if(!document.hidden)load();},C.REFRESH_MS||30*60*1000);
});
