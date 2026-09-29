document.addEventListener("DOMContentLoaded", async ()=>{
  const {live,$,esc,norm,setStatus,loadLiveFirstDataset,loadJsonDataset,nav}=SRGF;
  SRGFAuth.init();
  nav("fixtures");

  let headers=[], rows=[], filtered=[];
  const PENDING_KEY="SRGF_PENDING_FIXTURE_RESULTS_V1";
  let pendingResults={};
  const roleCanEdit=()=>SRGFAuth.canEditFixtures();

  function loadPending(){
    try{pendingResults=JSON.parse(localStorage.getItem(PENDING_KEY)||"{}")||{};}catch(_){pendingResults={};}
  }
  function savePending(){try{localStorage.setItem(PENDING_KEY,JSON.stringify(pendingResults));}catch(_){}}
  function applyPending(){
    Object.keys(pendingResults).forEach(key=>{
      const p=pendingResults[key], i=Number(key);
      if(!Number.isInteger(i)||!rows[i]||!p)return;
      if(p.winningTeam!==undefined&&p.winningTeam!==""){
        const wi=findHeaderIndex([/^winningteam/]);
        if(wi>=0)rows[i][wi]=p.winningTeam;
      }
      (p.scores||[]).forEach(s=>{
        const gi=gameIdx()[Number(s.game)-1];
        if(gi!==undefined)rows[i][gi]=`${s.player1} - ${s.player2}`;
      });
    });
  }

  // Header lookup is intentionally tolerant because Google Sheets headers may
  // be written as "Team 1", "Team1", "Player 1 Name", etc.
  function idx(names){
    const wanted=names.map(norm);
    for(const w of wanted){
      const i=headers.findIndex(h=>norm(h)===w);
      if(i>=0)return i;
    }
    return -1;
  }

  function findHeaderIndex(patterns){
    for(let i=0;i<headers.length;i++){
      const h=norm(headers[i]);
      if(patterns.some(p=>p.test(h))) return i;
    }
    return -1;
  }

  function val(r,names){
    const i=idx(names);
    return i<0?"":String(r[i]??"").trim();
  }

  function teamIndexes(){
    const result=[];
    headers.forEach((h,i)=>{
      const n=norm(h);
      if(
        n==="team" ||
        n==="team1" || n==="team2" ||
        n==="teama" || n==="teamb" ||
        /^team[12](name)?$/.test(n) ||
        /^team(name)?[12]$/.test(n)
      ) result.push(i);
    });
    return [...new Set(result)];
  }

  function playerIndexes(){
    const result=[];
    headers.forEach((h,i)=>{
      const n=norm(h);
      if(
        n==="player1" || n==="player2" ||
        n==="player1name" || n==="player2name" ||
        /player1/.test(n) || /player2/.test(n)
      ) result.push(i);
    });
    return [...new Set(result)];
  }

  function gameIdx(){
    const a=[];
    headers.forEach((h,i)=>{
      // Normalize the Sheet header first. Examples:
      // Game 1 (BD) -> game1bd
      // Game 2(LT)  -> game2lt
      // Game 3(TT)  -> game3tt
      // Game 4(PB)  -> game4pb
      const n=norm(h);
      const m=n.match(/^(?:game|set)([1-4])/);
      if(m)a[Number(m[1])-1]=i;
    });
    return a;
  }

  function parseScore(raw){
    const s=String(raw??"").trim();
    if(!s)return null;
    const m=s.match(/^(\d+)\s*[-:]\s*(\d+)$/);
    return m ? [m[1],m[2]] : null;
  }

  function done(r){
    // Match the reference behaviour: a result exists when any Game/Set,
    // Winning Team or Points field contains a value.
    let has=false;
    headers.forEach((h,i)=>{
      const n=norm(h);
      if(!String(r[i]??"").trim())return;
      if(/^(?:game|set)\d+/.test(n) || n==="winningteam" || n==="points") has=true;
    });
    return has;
  }

  function formatSchedule(v){
    const raw=String(v??"").trim();
    if(!raw)return "";
    const d=new Date(raw);
    if(!Number.isNaN(d.getTime())){
      try{
        const parts=new Intl.DateTimeFormat("en-IN",{
          timeZone:"Asia/Kolkata",
          day:"2-digit",month:"short",year:"numeric",
          hour:"2-digit",minute:"2-digit",hour12:true
        }).formatToParts(d);
        const get=t=>parts.find(x=>x.type===t)?.value||"";
        return `${get("day")} ${get("month")} ${get("year")} · ${get("hour").replace(/^0(?=\d)/,"")}:${get("minute")} ${get("dayPeriod")}`;
      }catch(e){}
    }
    return raw.replace(/\.000Z$/i,"").replace(/T/," · ");
  }

  function uniqueValuesFromColumns(indexes){
    const map=new Map();
    rows.forEach(r=>indexes.forEach(i=>{
      const raw=String(r[i]??"").trim();
      if(!raw)return;
      const key=norm(raw);
      if(!key || map.has(key))return;
      map.set(key,raw);
    }));
    return [...map.values()].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true,sensitivity:"base"}));
  }

  function refreshTeamFilter(){
    const select=$("fixtureTeamFilter");
    if(!select)return;
    const current=select.value;

    // IMPORTANT: derive teams from the FIXTURES sheet itself first. This is
    // what makes the filter work even if TEAMS has different headers or is
    // temporarily unavailable.
    let teams=uniqueValuesFromColumns(teamIndexes());

    // Many fixture sheets store the two teams in a Match column
    // (for example "T1 Vs T2") rather than separate Team 1 / Team 2 columns.
    // Extract both sides so every team present in the fixtures appears.
    if(!teams.length){
      const matchIndexes=[];
      headers.forEach((h,i)=>{
        const n=norm(h);
        if(n==="match" || n==="fixture")matchIndexes.push(i);
      });
      const found=new Map();
      rows.forEach(r=>matchIndexes.forEach(i=>{
        const raw=String(r[i]??"").trim();
        raw.split(/\s+(?:vs|v)\s+|\s+-\s+/i).map(x=>x.trim()).filter(Boolean).forEach(t=>{
          const key=norm(t);
          if(key&&!found.has(key))found.set(key,t);
        });
      }));
      teams=[...found.values()];
    }

    // Display the actual Team Name from TEAMS mapping, while keeping the
    // underlying Team ID/value for filtering. This means the dropdown shows
    // "T1 Team1", "T2 Team 2", etc. today, and will automatically show the
    // future names when the TEAMS sheet is renamed.
    const mappedTeams=[];
    const teamMap=Array.isArray(window.__SRGF_TEAMS)?window.__SRGF_TEAMS:[];
    teams.forEach(t=>{
      const found=teamMap.find(tm=>{
        const id=String(tm?.id??"").trim();
        const name=String(tm?.name??"").trim();
        return norm(id)===norm(t) || norm(name)===norm(t);
      });
      const display=found?String(found.name||found.id||t).trim():String(t).trim();
      const value=found?String(found.id||found.name||t).trim():String(t).trim();
      if(display&&!mappedTeams.some(x=>norm(x.display)===norm(display))){
        mappedTeams.push({display,value});
      }
    });

    // If the fixture sheet has no team names/IDs, fall back to TEAMS JSON.
    if(!mappedTeams.length && Array.isArray(window.__SRGF_TEAMS)){
      window.__SRGF_TEAMS.forEach(t=>{
        const display=String(t?.name||t?.id||"").trim();
        const value=String(t?.id||t?.name||"").trim();
        if(display&&!mappedTeams.some(x=>norm(x.display)===norm(display))){
          mappedTeams.push({display,value});
        }
      });
    }

    mappedTeams.sort((a,b)=>a.display.localeCompare(b.display,undefined,{numeric:true,sensitivity:"base"}));

    select.innerHTML='<option value="">All Teams</option>'+mappedTeams.map(t=>
      `<option value="${esc(t.value)}">${esc(t.display)}</option>`
    ).join("");

    const selected=current && mappedTeams.find(t=>norm(t.value)===norm(current) || norm(t.display)===norm(current));
    if(selected) select.value=selected.value;
  }

  function refreshSportFilter(){
    const select=$("fixtureSportFilter");
    if(!select)return;
    const current=select.value;
    const sportIndex=idx(["Sport"]);
    const sports=sportIndex<0?[]:[...new Set(rows.map(r=>String(r[sportIndex]??"").trim()).filter(Boolean))]
      .filter(s=>norm(s)!=="racketlon")
      .sort((a,b)=>a.localeCompare(b));
    select.innerHTML='<option value="">All Sports</option>'+sports.map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join("");
    if(sports.some(x=>x===current))select.value=current;
  }

  function refreshTierFilter(){
    const select=$("fixtureTierFilter");
    if(!select)return;
    const current=select.value;
    const tierIndex=idx(["Tier"]);
    const tiers=tierIndex<0?[]:[...new Set(rows.map(r=>String(r[tierIndex]??"").trim()).filter(Boolean))]
      .sort((a,b)=>a.localeCompare(b,undefined,{numeric:true,sensitivity:"base"}));
    select.innerHTML='<option value="">All Tiers</option>'+tiers.map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join("");
    if(tiers.some(x=>norm(x)===norm(current)))select.value=current;
  }

  function refreshPlayerFilter(){
    const select=$("fixturePlayerFilter");
    if(!select)return;
    const current=select.value;
    const names=uniqueValuesFromColumns(playerIndexes());

    select.innerHTML='<option value="">All Players</option>'+names.map(x=>
      `<option value="${esc(x)}">${esc(x)}</option>`
    ).join("");

    if(names.some(x=>norm(x)===norm(current)))select.value=current;
    syncPlayerDropdown();
  }

  function syncPlayerDropdown(){
    const select=$("fixturePlayerFilter");
    const button=$("fixturePlayerFilterButton");
    const dropdown=$("fixturePlayerDropdown");
    const optionsBox=$("fixturePlayerOptions");
    const search=$("fixturePlayerSearch");
    if(!select || !button || !dropdown || !optionsBox)return;

    const current=select.value;
    const query=String(search?.value||"").trim().toLowerCase();
    const options=[...select.options].filter(o=>!query || o.textContent.toLowerCase().includes(query));
    const selected=select.options[select.selectedIndex]?.textContent || "All Players";
    button.innerHTML=esc(selected)+" <span class=\"fixture-player-chevron\">⌄</span>";
    optionsBox.innerHTML=options.length
      ? options.map(o=>`<button type="button" class="fixture-player-option${o.value===current?" active":""}" data-value="${esc(o.value)}">${esc(o.textContent)}</button>`).join("")
      : `<div class="fixture-player-no-match">No matching players</div>`;

    optionsBox.querySelectorAll(".fixture-player-option").forEach(b=>b.onclick=()=>{
      select.value=b.dataset.value||"";
      if(search)search.value="";
      dropdown.classList.add("hidden");
      button.setAttribute("aria-expanded","false");
      // Per the working reference, selecting a player clears Team.
      const team=$("fixtureTeamFilter");
      if(team)team.value="";
      render();
    });
  }

  function setupPlayerDropdown(){
    const button=$("fixturePlayerFilterButton");
    const dropdown=$("fixturePlayerDropdown");
    const search=$("fixturePlayerSearch");
    if(!button || !dropdown)return;
    button.onclick=()=>{
      const hidden=dropdown.classList.toggle("hidden");
      button.setAttribute("aria-expanded",String(!hidden));
      if(!hidden){syncPlayerDropdown();setTimeout(()=>search?.focus(),0);}
    };
    search?.addEventListener("input",syncPlayerDropdown);
    document.addEventListener("click",e=>{
      if(!dropdown.contains(e.target) && e.target!==button){
        dropdown.classList.add("hidden");
        button.setAttribute("aria-expanded","false");
      }
    });
  }

  function teamKey(value){
    const raw=String(value??"").trim().toLowerCase();
    if(!raw)return "";

    // Treat T1, Team 1, Team-1, Team_1 and similar forms as the same team.
    const compact=raw.replace(/[^a-z0-9]+/g,"");
    const m=compact.match(/^(?:team|t)0*(\d+)$/);
    if(m)return `t${Number(m[1])}`;

    // If the value is a known team ID/name, use the canonical ID.
    const teams=Array.isArray(window.__SRGF_TEAMS)?window.__SRGF_TEAMS:[];
    const found=teams.find(t=>{
      const id=String(t?.id??"").trim().toLowerCase();
      const name=String(t?.name??"").trim().toLowerCase();
      return raw===id || raw===name;
    });
    if(found){
      const id=String(found.id||found.name||raw).trim().toLowerCase();
      const tm=id.replace(/[^a-z0-9]+/g,"").match(/^(?:team|t)0*(\d+)$/);
      return tm?`t${Number(tm[1])}`:id;
    }
    return raw.replace(/\s+/g," ");
  }

  function playerTeamFromFixtureCell(value){
    const raw=String(value??"").trim().toLowerCase();
    if(!raw)return "";
    const players=Array.isArray(window.__SRGF_PLAYERS)?window.__SRGF_PLAYERS:[];
    const p=players.find(x=>{
      const id=String(x?.id??"").trim().toLowerCase();
      const name=String(x?.name??"").trim().toLowerCase();
      return raw===id || raw===name || (id && raw.includes(id)) || (name && raw.includes(name));
    });
    return p ? String(p.team||p.teamName||p.teamId||"") : "";
  }

  function rowMatchesTeam(r,selected){
    if(!selected)return true;
    const wanted=teamKey(selected);
    if(!wanted)return true;
    const headersLocal=headers||[];

    // 1) Check every Team-related column. This includes Team 1, Team 2,
    // Team A/B and Winning Team, so a team is found in both wins and losses.
    for(let i=0;i<headersLocal.length;i++){
      const h=String(headersLocal[i]??"").trim().toLowerCase();
      const cell=String(r[i]??"").trim();
      if(h.includes("team") && cell && teamKey(cell)===wanted)return true;
    }

    // 2) Some fixture sheets store the two teams in a Match/Fixture column,
    // e.g. "T1 vs T2". Check both sides.
    for(let i=0;i<headersLocal.length;i++){
      const h=String(headersLocal[i]??"").trim().toLowerCase();
      const raw=String(r[i]??"").trim();
      if(!raw || !/^(match|fixture|game)$/.test(h))continue;
      const parts=raw.split(/\s+(?:vs|v)\s+|\s*-\s*/i).map(x=>x.trim()).filter(Boolean);
      if(parts.some(part=>teamKey(part)===wanted))return true;
    }

    // 3) Final fallback: resolve Player 1 / Player 2 to their team.
    for(const i of playerIndexes()){
      const pteam=playerTeamFromFixtureCell(r[i]);
      if(pteam && teamKey(pteam)===wanted)return true;
    }
    return false;
  }

  function rowMatchesPlayer(r,selected){
    if(!selected)return true;
    const wanted=norm(selected);
    return playerIndexes().some(i=>norm(r[i])===wanted);
  }

  function render(){
    refreshTeamFilter();
    refreshSportFilter();
    refreshTierFilter();
    refreshPlayerFilter();

    const status=$("fixtureStatusFilter")?.value||"";
    const team=$("fixtureTeamFilter")?.value||"";
    const sport=($("fixtureSportFilter")?.value||"").toLowerCase();
    const tier=($("fixtureTierFilter")?.value||"").toLowerCase();
    const player=$("fixturePlayerFilter")?.value||"";

    filtered=rows.map((r,i)=>({r,i})).filter(x=>{
      if(status==="completed"&&!done(x.r))return false;
      if(status==="pending"&&done(x.r))return false;
      if(team&&!rowMatchesTeam(x.r,team))return false;
      if(sport&&val(x.r,["Sport"]).toLowerCase()!==sport)return false;
      if(tier&&val(x.r,["Tier"]).toLowerCase()!==tier)return false;
      if(player&&!rowMatchesPlayer(x.r,player))return false;
      return true;
    });

    const completed=rows.filter(done).length;
    $("fixtureCompletedCount").textContent=completed;
    $("fixturePendingCount").textContent=rows.length-completed;

    $("fixturesHead").innerHTML=headers.length
      ? `<tr>${headers.map(h=>`<th>${esc(h)}</th>`).join("")}${roleCanEdit()?"<th>Action</th>":""}</tr>`
      : "";

    $("fixturesBody").innerHTML=filtered.length
      ? filtered.map(x=>{
          const cells=x.r.map((v,i)=>{
            let out=String(v??"");
            if(norm(headers[i])==="schedule")out=formatSchedule(out);
            return `<td>${esc(out)}</td>`;
          }).join("");
          return `<tr>${cells}${roleCanEdit()?`<td><button class="secondary edit-result" data-i="${x.i}">${done(x.r)?"Edit Result":"Enter Result"}</button></td>`:""}</tr>`;
        }).join("")
      : `<tr><td colspan="${headers.length+(roleCanEdit()?1:0)||1}">No fixtures found.</td></tr>`;

    $("fixtureMessage").textContent=`Showing ${filtered.length} of ${rows.length} fixture(s).`;
    document.querySelectorAll(".edit-result").forEach(b=>b.onclick=()=>openModal(Number(b.dataset.i)));
  }

  function openModal(i){
    const r=rows[i], gi=gameIdx();
    const fixtureSport=val(r,["Sport"]);
    const isRacketlon=norm(fixtureSport)==="racketlon";
    const gameLabels=isRacketlon?["Badminton","Table Tennis","Lawn Tennis","Pickle Ball"]:["Game 1","Game 2","Game 3"];
    const gameCount=gameLabels.length;
    const p1=val(r,["Player 1","Player1","Player 1 Name","Player1Name"])||"Player 1";
    const p2=val(r,["Player 2","Player2","Player 2 Name","Player2Name"])||"Player 2";
    const modal=$("resultModal"); if(!modal)return;
    const editing=done(r);
    modal.querySelector(".modal-title").textContent=p1+" vs "+p2;
    const saveBtn=modal.querySelector("#saveFixtureBtn");
    if(saveBtn){
      // Reset the button every time the modal is opened. A previous save
      // temporarily disables it while the Google Sheets request is running;
      // that disabled state must not carry over to the next edit.
      saveBtn.disabled=false;
      saveBtn.textContent=editing?"Update Result":"Save Result";
    }
    const winningTeamIndex=findHeaderIndex([/^winningteam/]);
    const currentWinner=winningTeamIndex>=0?String(r[winningTeamIndex]??"").trim():"";
    let teamValues=[];
    for(const ti of teamIndexes()){
      const v=String(r[ti]??"").trim();
      if(v&&!teamValues.some(x=>norm(x)===norm(v)))teamValues.push(v);
    }

    // This fixture format stores the two teams in Match (for example
    // "T1 Vs T2"), so resolve those IDs through the TEAMS mapping.
    if(!teamValues.length){
      const matchIndexes=[];
      headers.forEach((h,idx)=>{
        const n=norm(h);
        if(n==="match" || n==="fixture")matchIndexes.push(idx);
      });
      for(const mi of matchIndexes){
        const raw=String(r[mi]??"").trim();
        raw.split(/\s+(?:vs|v)\s+|\s+-\s+/i).map(x=>x.trim()).filter(Boolean).forEach(v=>{
          if(v&&!teamValues.some(x=>norm(x)===norm(v)))teamValues.push(v);
        });
      }
    }

    const teamMap=Array.isArray(window.__SRGF_TEAMS)?window.__SRGF_TEAMS:[];
    const fixtureTeams=[];
    teamValues.slice(0,2).forEach(v=>{
      const found=teamMap.find(tm=>norm(tm?.id)===norm(v)||norm(tm?.name)===norm(v));
      const display=found?String(found.name||found.id||v).trim():String(v).trim();
      if(display&&!fixtureTeams.some(x=>norm(x)===norm(display)))fixtureTeams.push(display);
    });
    if(currentWinner&&!fixtureTeams.some(x=>norm(x)===norm(currentWinner))){
      const found=teamMap.find(tm=>norm(tm?.id)===norm(currentWinner)||norm(tm?.name)===norm(currentWinner));
      fixtureTeams.push(found?String(found.name||found.id||currentWinner).trim():currentWinner);
    }

    const games=modal.querySelector(".games");
    const winnerOptions='<option value="">Select winning team</option>'+fixtureTeams.map(v=>'<option value="'+esc(v)+'"'+(norm(v)===norm(currentWinner)?" selected":"")+'>'+esc(v)+'</option>').join("");
    games.innerHTML='<div class="fixture-result-winner"><label><strong>Winning Team</strong><select id="fixtureWinningTeam" class="fixture-winning-team-select">'+winnerOptions+'</select></label><div class="notice">Select the winning team from the two teams in this fixture. You can also update any one game, several games, or all '+gameCount+' games.</div></div>'+
      gameLabels.map((label,index)=>{const g=index+1;const raw=gi[g-1]===undefined?"":String(r[gi[g-1]]??"").trim();const m=parseScore(raw);return '<div class="game"><h3>'+esc(label)+'</h3><div class="labels"><label>'+esc(p1)+'<input class="g1" data-g="'+g+'" type="number" min="0" step="1" inputmode="numeric" value="'+(m?m[0]:"")+'"></label><label>'+esc(p2)+'<input class="g2" data-g="'+g+'" type="number" min="0" step="1" inputmode="numeric" value="'+(m?m[1]:"")+'"></label></div></div>';}).join("");
    modal.classList.remove("hidden");
    saveBtn.onclick=async()=>{
      if(saveBtn.disabled)return;
      const scores=[];
      for(let g=1;g<=gameCount;g++){const av=modal.querySelector('.g1[data-g="'+g+'"]').value.trim(),bv=modal.querySelector('.g2[data-g="'+g+'"]').value.trim();if((av==="")!==(bv==="")){alert("Enter both scores for "+gameLabels[g-1]+", or leave both blank to keep the existing result.");return;}if(av!==""&&bv!=="")scores.push({game:g,player1:Number(av),player2:Number(bv)});}
      const winner=modal.querySelector("#fixtureWinningTeam")?.value.trim()||"";
      if(!winner&&!scores.length){alert("Enter at least one field to update.");return;}
      // Show the result immediately. Do not wait for Google Sheets.
      // Keep it as a local pending change until Apps Script confirms the write.
      saveBtn.disabled=true;
      saveBtn.textContent="Saving...";
      pendingResults[String(i)]={scores,winningTeam:winner,savedAt:Date.now()};
      savePending();
      applyPending();
      render();
      modal.classList.add("hidden");
      setStatus("Result updated on screen · saving to Google Sheets…",true);

      // Save in the background. The fixture page remains usable while the
      // Google Sheets request is in progress.
      try{
        const body=new URLSearchParams({
          action:"saveFixtureResult",
          sheet:"FIXTURES",
          rowNumber:String(i+2),
          scores:JSON.stringify(scores),
          winningTeam:winner,
          token:SRGFAuth.token()
        });
        const res=await SRGF.fetchTimeout(SRGF_CONFIG.API_URL,{
          method:"POST",
          headers:{"Content-Type":"application/x-www-form-urlencoded;charset=UTF-8"},
          body
        },20000);
        const j=await res.json();
        if(!j.ok)throw new Error(j.error||"Save failed");
        delete pendingResults[String(i)];
        savePending();
        setStatus("✓ Result saved to Google Sheets",false);
        await load();
      }catch(e){
        saveBtn.disabled=false;
        saveBtn.textContent=editing?"Update Result":"Save Result";
        setStatus("Result shown locally · Google Sheets save pending",true);
      }
    };
    modal.querySelector("#closeResultBtn").onclick=()=>modal.classList.add("hidden");
  }
  async function load(){
    // Editors use the same cache-first/live-retry loader as viewers.
    // This prevents a temporary Google Sheets/API failure from blanking the
    // fixture page. Saving a result still goes directly to Apps Script.
    if(roleCanEdit()){
      try{
        const d=await loadLiveFirstDataset("fixtures");
        const f=d.data||[];
        headers=d.headers||Object.keys(f[0]||{});
        rows=f.map(x=>Array.isArray(x)?x:headers.map(h=>x[h]??""));
        applyPending();
        applyPending();
        try{
          const td=await loadJsonDataset("teams");
          window.__SRGF_TEAMS=(td.data||[]).map(x=>({
            id:x.id??x["Team ID"]??x.TeamID??x.ID,
            name:x.name??x["Team Name"]??x.TeamName??x.Name
          }));
        }catch(_){ }
        render();
        setStatus(d.live?"LIVE · Google Sheet":(d.source==="Browser cache"?"CACHED · retrying Google Sheet":"GitHub backup · retrying Google Sheet"),!d.live);

        if(d.retryPromise){
          d.retryPromise.then(latest=>{
            const f2=latest.data?.fixtures||[];
            headers=Object.keys(f2[0]||{});
            rows=f2.map(x=>Array.isArray(x)?x:headers.map(h=>x[h]??""));
        applyPending();
        applyPending();
            render();
            setStatus("LIVE · Google Sheet");
          }).catch(()=>{});
        }
      }catch(e){
        setStatus("No fixture data available",true);
      }
      return;
    }

    try{
      const d=await loadLiveFirstDataset("fixtures");
      const f=d.data||[];
      headers=d.headers||Object.keys(f[0]||{});
      rows=f.map(x=>Array.isArray(x)?x:headers.map(h=>x[h]??""));
      try{
        const td=await loadJsonDataset("teams");
        window.__SRGF_TEAMS=(td.data||[]).map(x=>({id:x.id??x["Team ID"]??x.TeamID??x.ID,name:x.name??x["Team Name"]??x.TeamName??x.Name}));
      }catch(_){ }
      try{
        const pd=await loadJsonDataset("players");
        window.__SRGF_PLAYERS=(pd.data||[]).map(x=>({id:x.id??x["Player ID"]??x.PlayerID??x.ID,name:x.name??x.Name??x["Player Name"]??x.PlayerName,team:x.team??x["Team ID"]??x.TeamID??x["Team Name"]??x.TeamName}));
      }catch(_){ }
      render();
      setStatus(d.live?"LIVE · Google Sheet":"Connecting to Google Sheets…",!d.live);

      if(d.retryPromise){
        d.retryPromise.then(latest=>{
          const f2=latest.data?.fixtures||[];
          headers=Object.keys(f2[0]||{});
          rows=f2.map(x=>Array.isArray(x)?x:headers.map(h=>x[h]??""));
          render();
          setStatus("LIVE · Google Sheet");
        }).catch(()=>{});
      }
    }catch(e){
      try{
        const d=await loadJsonDataset("fixtures");
        const f=d.data||[];
        headers=d.headers||Object.keys(f[0]||{});
        rows=f.map(x=>Array.isArray(x)?x:headers.map(h=>x[h]??""));
        applyPending();
        render();
        setStatus("Connecting to Google Sheets…",true);
      }catch(_){setStatus("No fixture data available",true);}
    }
  }

  ["fixtureStatusFilter","fixtureTeamFilter","fixtureSportFilter","fixtureTierFilter","fixturePlayerFilter"].forEach(id=>$(id)?.addEventListener("change",()=>{
    // Player selection clears Team, matching the working reference.
    if(id==="fixturePlayerFilter"){
      const team=$("fixtureTeamFilter");
      if(team)team.value="";
    }
    render();
  }));

  loadPending();
  setupPlayerDropdown();
  $("refreshBtn")?.addEventListener("click",load);
  await load();
});
