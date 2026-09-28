document.addEventListener("DOMContentLoaded", async ()=>{
  const {loadLiveFirstAll,$,esc,setStatus,loadJsonFreshness,showLiveFreshness,nav}=SRGF; SRGFAuth.init(); nav("players");
  try{
    const liveData=await loadLiveFirstAll();
    let players=[], auction=[], teams=[];
    if(liveData.live){
      players=liveData.data.players||[]; auction=liveData.data.auction||[]; teams=liveData.data.teams||[];
      showLiveFreshness(liveData.updatedAt);
    }else{
      const [pd,ad,td]=await Promise.all([SRGF.loadJsonDataset("players"),SRGF.loadJsonDataset("auction"),SRGF.loadJsonDataset("teams")]);
      players=pd.data||[]; auction=ad.data||[]; teams=td.data||[];
      await loadJsonFreshness();
    }
    const teamName=id=>teams.find(t=>String(t["Team ID"]||t.id)===String(id))?.["Team Name"]||teams.find(t=>String(t.id)===String(id))?.name||id||"";
    $("playersBody").innerHTML=players.filter(p=>p["Name"]||p.name).map(p=>{
      const name=p["Name"]||p.name||"", id=p["Player ID"]||p.id||"";
      const teamId=p["Team ID"]||p.team||auction.find(a=>String(a["Player ID"]||a.playerId)===String(id))?.["Team ID"]||"";
      return `<tr><td>${esc(id)}</td><td>${esc(name)}</td><td>${esc(p["Preferred Category"]||p.category||"")}</td><td>${esc(p["Badminton Level"]||p.badminton||"")}</td><td>${esc(p["Table Tennis Level"]||p.tt||"")}</td><td>${esc(p["Lawn Tennis Level"]||p.tennis||"")}</td><td>${esc(p["Pickle Ball Level"]||p.pickle||"")}</td><td>${esc(teamName(teamId))}</td></tr>`;
    }).join("") || `<tr><td colspan="8">No players available.</td></tr>`;
    await loadJsonFreshness();
    setStatus(liveData.live?"LIVE · Google Sheet":"JSON data · live unavailable",!liveData.live);
  }catch(e){setStatus("JSON data unavailable",true);}
  $("refreshBtn")?.addEventListener("click",()=>location.reload());
  setInterval(()=>{if(!document.hidden)location.reload()},30000);
});
