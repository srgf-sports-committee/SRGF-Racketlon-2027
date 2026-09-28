document.addEventListener("DOMContentLoaded", async ()=>{
  const {live,$,esc,money,setStatus,nav,jsonFile}=SRGF; SRGFAuth.init(); nav("teams");
  function render(teams,auction,players,source){
    $("teamsBoard").innerHTML=teams.slice(0,4).map(t=>{
      const id=t["Team ID"]||t.id||"", name=t["Team Name"]||t.name||id;
      const sales=auction.filter(a=>String(a["Team ID"]||a.teamId)===String(id));
      return `<div class="team-column"><div class="team-title">${esc(name)}</div>${sales.length?sales.map(a=>{const pid=a["Player ID"]||a.playerId,p=players.find(x=>String(x["Player ID"]||x.id)===String(pid));return `<div class="team-player">${esc(a["Player Name"]||a.player||p?.Name||p?.name||pid)} <span>${money(a.Amount||a.amount)}</span></div>`}).join(""):`<div class="team-player team-empty">No players</div>`}</div>`;
    }).join("") || `<div class="notice">No team data available.</div>`;
    setStatus(`${source} · `+new Date().toLocaleTimeString(), source!=="LIVE");
  }
  function exportTeams(){
    const rows=[["Team","Player ID","Player Name","Amount"]];
    // Export uses the currently loaded JSON/live data from the page.
    // The data is kept in these temporary globals for the export button.
    const teamsNow=window.__SRGF_TEAMS_EXPORT||[];
    const auctionNow=window.__SRGF_AUCTION_EXPORT||[];
    auctionNow.forEach(a=>rows.push([a["Team Name"]||a.team||"",a["Player ID"]||a.playerId||"",a["Player Name"]||a.player||"",a.Amount||a.amount||0]));
    const csv="\uFEFF"+rows.map(r=>r.map(v=>`"${String(v??"").replace(/"/g,'""')}"`).join(",")).join("\r\n");
    const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv"}));a.download="SRGF_Racketlon_2027_Teams.csv";a.click();
  }
  async function load(){
    let shown=false;
    try{const [t,a,p]=await Promise.all([jsonFile("teams.json"),jsonFile("auction.json"),jsonFile("players.json")]);window.__SRGF_TEAMS_EXPORT=t.rows||[];window.__SRGF_AUCTION_EXPORT=a.rows||[];render(t.rows||[],a.rows||[],p.rows||[],"JSON data");shown=true;}catch(_){}
    try{const d=await live("data");window.__SRGF_TEAMS_EXPORT=d.teams||[];window.__SRGF_AUCTION_EXPORT=d.auction||[];render(d.teams||[],d.auction||[],d.players||[],"LIVE");}catch(e){if(!shown)setStatus(e.message,true);}
  }
  $("exportTeamsBtn")?.addEventListener("click",exportTeams);
  $("refreshBtn")?.addEventListener("click",load); await load();
  setInterval(()=>{if(!document.hidden)load()},SRGF_CONFIG.REFRESH_MS);
});
