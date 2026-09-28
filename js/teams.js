document.addEventListener("DOMContentLoaded", async ()=>{
  const {loadJsonDataset,$,esc,money,setStatus,loadJsonFreshness,nav}=SRGF; SRGFAuth.init(); nav("teams");
  try{
    const [td,ad,pd]=await Promise.all([loadJsonDataset("teams"),loadJsonDataset("auction"),loadJsonDataset("players")]);
    const teams=td.data||[], auction=ad.data||[], players=pd.data||[];
    $("teamsBoard").innerHTML=teams.slice(0,4).map(t=>{
      const id=t["Team ID"]||t.id||"", name=t["Team Name"]||t.name||id;
      const sales=auction.filter(a=>String(a["Team ID"]||a.teamId)===String(id));
      return `<div class="team-column"><div class="team-title">${esc(name)}</div>${sales.length?sales.map(a=>{
        const pid=a["Player ID"]||a.playerId, p=players.find(x=>String(x["Player ID"]||x.id)===String(pid));
        return `<div class="team-player">${esc(a["Player Name"]||a.player||p?.Name||p?.name||pid)} <span>${money(a.Amount||a.amount)}</span></div>`;
      }).join(""):`<div class="team-player team-empty">No players</div>`}</div>`;
    }).join("") || `<div class="notice">No team data available.</div>`;
    $("exportTeamsBtn")?.addEventListener("click",()=>{
      const rows=[["Team","Player ID","Player Name","Amount"]];
      auction.forEach(a=>rows.push([a["Team Name"]||a.team||"",a["Player ID"]||a.playerId||"",a["Player Name"]||a.player||"",a.Amount||a.amount||0]));
      downloadCSV(rows,"SRGF_Racketlon_2027_Teams.csv");
    });
    await loadJsonFreshness();
    setStatus("JSON data");
  }catch(e){setStatus("JSON data unavailable",true);}
  $("refreshBtn")?.addEventListener("click",()=>location.reload());
  setInterval(()=>{if(!document.hidden)location.reload()},30000);
});
function downloadCSV(rows,name){
  const csv="\uFEFF"+rows.map(r=>r.map(v=>`"${String(v??"").replace(/"/g,'""')}"`).join(",")).join("\r\n");
  const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv"}));a.download=name;a.click();
}
