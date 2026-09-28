document.addEventListener("DOMContentLoaded", async ()=>{
  const {live,$,esc,norm,setStatus,nav}=SRGF;
  SRGFAuth.init();
  nav("fixtures");

  let headers=[], rows=[], filtered=[];
  const roleCanEdit=()=>SRGFAuth.canEditFixtures();

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
      const m=norm(h).match(/^(?:game|set)([1-4])/);
      if(m)a[+m[1]-1]=i;
    });
    return a;
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

    // If the fixture sheet uses one generic Team column, the code above still
    // catches it. If there is no team column at all, fall back to TEAMS JSON.
    if(!teams.length && Array.isArray(window.__SRGF_TEAMS)){
      teams=window.__SRGF_TEAMS.map(t=>String(t.name||t.id||"").trim()).filter(Boolean);
    }

    select.innerHTML='<option value="">All Teams</option>'+teams.map(t=>
      `<option value="${esc(t)}">${esc(t)}</option>`
    ).join("");

    if(teams.some(t=>norm(t)===norm(current))) select.value=current;
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

  function rowMatchesTeam(r,selected){
    if(!selected)return true;
    const wanted=norm(selected);
    return teamIndexes().some(i=>norm(r[i])===wanted);
  }

  function rowMatchesPlayer(r,selected){
    if(!selected)return true;
    const wanted=norm(selected);
    return playerIndexes().some(i=>norm(r[i])===wanted);
  }

  function render(){
    refreshTeamFilter();
    refreshSportFilter();
    refreshPlayerFilter();

    const status=$("fixtureStatusFilter")?.value||"";
    const team=$("fixtureTeamFilter")?.value||"";
    const sport=($("fixtureSportFilter")?.value||"").toLowerCase();
    const player=$("fixturePlayerFilter")?.value||"";

    filtered=rows.map((r,i)=>({r,i})).filter(x=>{
      if(status==="completed"&&!done(x.r))return false;
      if(status==="pending"&&done(x.r))return false;
      if(team&&!rowMatchesTeam(x.r,team))return false;
      if(sport&&val(x.r,["Sport"]).toLowerCase()!==sport)return false;
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
    $("fixtureFilterMessage").textContent=`Showing ${filtered.length} of ${rows.length} fixture(s)`;
    document.querySelectorAll(".edit-result").forEach(b=>b.onclick=()=>openModal(+b.dataset.i));
  }

  function openModal(i){
    const r=rows[i], gi=gameIdx();
    const p1=val(r,["Player 1","Player1","Player 1 Name","Player1Name"])||"Player 1";
    const p2=val(r,["Player 2","Player2","Player 2 Name","Player2Name"])||"Player 2";
    const modal=$("resultModal");
    if(!modal)return;
    modal.querySelector(".modal-title").textContent=`${p1} vs ${p2}`;
    const games=modal.querySelector(".games");
    games.innerHTML=[1,2,3,4].map(g=>{
      const raw=gi[g-1]===undefined?"":String(r[gi[g-1]]||"");
      const m=raw.match(/(\d+)\s*[-:]\s*(\d+)/);
      return `<div class="game"><h3>Game ${g}</h3><div class="labels"><label>${esc(p1)}<input class="g1" data-g="${g}" type="number" min="0" value="${m?m[1]:""}"></label><label>${esc(p2)}<input class="g2" data-g="${g}" type="number" min="0" value="${m?m[2]:""}"></label></div></div>`;
    }).join("");
    modal.classList.remove("hidden");

    modal.querySelector("#saveFixtureBtn").onclick=async()=>{
      const scores=[];
      for(let g=1;g<=4;g++){
        const a=modal.querySelector(`.g1[data-g="${g}"]`).value;
        const b=modal.querySelector(`.g2[data-g="${g}"]`).value;
        if((a==="")!==(b==="")){alert(`Enter both scores for Game ${g}.`);return;}
        if(a!==""&&b!=="")scores.push({game:g,player1:Number(a),player2:Number(b)});
      }
      if(!scores.length){alert("Enter at least one game result.");return;}
      try{
        const body=new URLSearchParams({action:"saveFixtureResult",sheet:"FIXTURES",rowNumber:String(i+2),scores:JSON.stringify(scores),token:SRGFAuth.token()});
        const res=await SRGF.fetchTimeout(SRGF_CONFIG.API_URL,{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded;charset=UTF-8"},body},20000);
        const j=await res.json();
        if(!j.ok)throw new Error(j.error||"Save failed");
        modal.classList.add("hidden");
        await load();
      }catch(e){alert(e.message||e);}
    };
    modal.querySelector("#closeResultBtn").onclick=()=>modal.classList.add("hidden");
  }

  async function load(){
    // JSON is the immediate display source. This keeps the previous good data
    // visible while the live Apps Script request is loading.
    let shown=false;
    try{
      const d=await SRGF.jsonFile("fixtures.json");
      const f=d.rows||[];
      headers=d.headers||Object.keys(f[0]||{});
      rows=f.map(x=>Array.isArray(x)?x:headers.map(h=>x[h]??""));
      try{
        const t=await SRGF.jsonFile("teams.json");
        window.__SRGF_TEAMS=t.rows||t.teams||[];
      }catch(_){window.__SRGF_TEAMS=[];}
      render();
      setStatus("JSON data · "+new Date().toLocaleTimeString());
      shown=true;
    }catch(e){}

    // Refresh live after the old JSON is already visible.
    try{
      const d=await live("data");
      const f=Array.isArray(d.fixtures)?d.fixtures:[];
      const t=Array.isArray(d.teams)?d.teams:[];
      window.__SRGF_TEAMS=t;
      if(!f.length){headers=[];rows=[];}
      else{headers=Object.keys(f[0]);rows=f.map(o=>headers.map(h=>o[h]??""));}
      render();
      setStatus("LIVE · "+new Date().toLocaleTimeString());
    }catch(e){
      if(!shown){headers=[];rows=[];render();setStatus("No fixture data available",true);}
      // If JSON was shown, keep it. Never replace good old data with blank data.
    }
  }

  ["fixtureStatusFilter","fixtureTeamFilter","fixtureSportFilter","fixturePlayerFilter"].forEach(id=>$(id)?.addEventListener("change",()=>{
    // Player selection clears Team, matching the working reference.
    if(id==="fixturePlayerFilter"){
      const team=$("fixtureTeamFilter");
      if(team)team.value="";
    }
    render();
  }));

  setupPlayerDropdown();
  $("refreshBtn")?.addEventListener("click",load);
  await load();
  setInterval(()=>{if(!document.hidden)load()},SRGF_CONFIG.REFRESH_MS);
});
