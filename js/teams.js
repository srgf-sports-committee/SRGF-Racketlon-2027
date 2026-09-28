document.addEventListener("DOMContentLoaded", async ()=>{
  const {loadJsonDataset,live,$,esc,money,setStatus,loadJsonFreshness,nav}=SRGF; SRGFAuth.init(); nav("teams");
  function render(teams,auction,players,source,error=false){
    $("teamsBoard").innerHTML=teams.slice(0,4).map(t=>{const id=t["Team ID"]||t.id||"",name=t["Team Name"]||t.name||id,sales=auction.filter(a=>String(a["Team ID"]||a.teamId)===String(id));return `<div class="team-column"><div class="team-title">${esc(name)}</div>${sales.length?sales.map(a=>{const pid=a["Player ID"]||a.playerId,p=players.find(x=>String(x["Player ID"]||x.id)===String(pid));return `<div class="team-player">${esc(a["Player Name"]||a.player||p?.Name||p?.name||pid)} <span>${money(a.Amount||a.amount)}</span></div>`}).join(""):`<div class="team-player team-empty">No players</div>`}</div>`;}).join("")||`<div class="notice">No team data available.</div>`; setStatus(source,error);
  }
  let shown=false;
  try{const [td,ad,pd]=await Promise.all([loadJsonDataset("teams"),loadJsonDataset("auction"),loadJsonDataset("players")]);render(td.data||[],ad.data||[],pd.data||[],"JSON data");await loadJsonFreshness();shown=true;}catch(_){}
  try{const d=await live("data");render(d.teams||[],d.auction||[],d.players||[],"LIVE · Google Sheet");}catch(e){if(!shown)setStatus("JSON data unavailable",true);}
  $("refreshBtn")?.addEventListener("click",()=>location.reload()); setInterval(()=>{if(!document.hidden)location.reload()},SRGF_CONFIG.REFRESH_MS);
});
