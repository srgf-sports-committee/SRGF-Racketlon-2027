document.addEventListener("DOMContentLoaded", async ()=>{
  const {loadJsonDataset,$,esc,setStatus,loadJsonFreshness,nav}=SRGF; SRGFAuth.init(); nav("results");
  let results=[];
  function n(v){return Number(v)||0}
  function fields(r){return {team:r["Team"]||r["Winning Team"]||r["Winner Team"]||"",player:r["Player"]||r["Player Name"]||"",sport:r["Sport"]||"",tier:r["Tier"]||"",points:n(r["Points"]||r["Score"]||r["Sum Points"]),gw:n(r["Games Won"]||r["Games won"]),gl:n(r["Games Lost"]||r["Games lost"]),pd:n(r["Point Difference"]||r["Points Difference"])}}
  function render(){
    const sports=[...new Set(results.map(r=>fields(r).sport).filter(Boolean))].sort();
    const tiers=[...new Set(results.map(r=>fields(r).tier).filter(Boolean))].sort();
    $("resultPlayerSportFilter").innerHTML='<option value="">All Sports</option>'+sports.map(x=>`<option>${esc(x)}</option>`).join("");
    $("resultPlayerTierFilter").innerHTML='<option value="">All Tiers</option>'+tiers.map(x=>`<option>${esc(x)}</option>`).join("");
    const sport=$("resultPlayerSportFilter").value,tier=$("resultPlayerTierFilter").value;
    const playerRows=results.map(fields).filter(x=>(!sport||x.sport===sport)&&(!tier||x.tier===tier)).sort((a,b)=>b.points-a.points||b.gw-a.gw||a.gl-b.gl||b.pd-a.pd);
    const grouped={};playerRows.forEach(x=>(grouped[x.tier||""]??=[]).push(x));
    const body=[];Object.values(grouped).forEach(group=>group.forEach((x,i)=>body.push(`<tr class="${i===0?"player-top-row":""}"><td>${esc(x.tier)}</td><td>${esc(x.player)}</td><td>${x.points}</td></tr>`)));
    $("playerScoresBody").innerHTML=body.join("")||`<tr><td colspan="3">No player scores available.</td></tr>`;
    $("playerScoresTable").classList.remove("hidden");
    const team={};results.map(fields).forEach(x=>{if(!x.team)return;(team[x.team]??={score:0,gw:0,gl:0,pd:0});team[x.team].score+=x.points;team[x.team].gw+=x.gw;team[x.team].gl+=x.gl;team[x.team].pd+=x.pd});
    const teams=Object.entries(team).sort((a,b)=>b[1].score-a[1].score||b[1].gw-a[1].gw||a[1].gl-b[1].gl||b[1].pd-a[1].pd);
    $("teamPointsBody").innerHTML=teams.map(([t,x],i)=>`<tr class="${i===0?"team-top-row":""}"><td>${esc(t)}</td><td>${x.score}</td><td>${x.gw}</td><td>${x.gl}</td><td>${x.pd>0?"+":""}${x.pd}</td></tr>`).join("")||`<tr><td colspan="5">No team results available.</td></tr>`;
    $("teamPointsTable").classList.remove("hidden");
  }
  async function load(){
    let shown=false;
    try{const d=await SRGF.loadJsonDataset("results");results=d.data||[];render();await loadJsonFreshness();setStatus("JSON data");shown=true;}catch(_){}
    try{const d=await SRGF.live("data");results=d.results||[];render();setStatus("LIVE · Google Sheet");}catch(_){if(!shown)setStatus("JSON data unavailable",true)}
  }
  await load();
  $("resultPlayerSportFilter")?.addEventListener("change",render);
  $("resultPlayerTierFilter")?.addEventListener("change",render);
  setInterval(()=>{if(!document.hidden)load()},30000);
});