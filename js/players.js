document.addEventListener("DOMContentLoaded", async ()=>{
  const {loadJsonDataset,$,esc,setStatus,loadJsonFreshness,nav}=SRGF; SRGFAuth.init(); nav("players");
  try{
    const [pd,ad,td]=await Promise.all([loadJsonDataset("players"),loadJsonDataset("auction"),loadJsonDataset("teams")]);
    const players=pd.data||[], auction=ad.data||[], teams=td.data||[];
    const teamName=id=>teams.find(t=>String(t["Team ID"]||t.id)===String(id))?.["Team Name"]||teams.find(t=>String(t.id)===String(id))?.name||id||"";
    $("playersBody").innerHTML=players.filter(p=>p["Name"]||p.name).map(p=>{
      const name=p["Name"]||p.name||"", id=p["Player ID"]||p.id||"";
      const teamId=p["Team ID"]||p.team||auction.find(a=>String(a["Player ID"]||a.playerId)===String(id))?.["Team ID"]||"";
      return `<tr><td>${esc(id)}</td><td>${esc(name)}</td><td>${esc(p["Preferred Category"]||p.category||"")}</td><td>${esc(p["Badminton Level"]||p.badminton||"")}</td><td>${esc(p["Table Tennis Level"]||p.tt||"")}</td><td>${esc(p["Lawn Tennis Level"]||p.tennis||"")}</td><td>${esc(p["Pickle Ball Level"]||p.pickle||"")}</td><td>${esc(teamName(teamId))}</td></tr>`;
    }).join("") || `<tr><td colspan="8">No players available.</td></tr>`;
    await loadJsonFreshness();
    setStatus("JSON data");
  }catch(e){setStatus("JSON data unavailable",true);}
  $("refreshBtn")?.addEventListener("click",()=>location.reload());
  setInterval(()=>{if(!document.hidden)location.reload()},30000);
});
