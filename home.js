document.addEventListener("DOMContentLoaded", async ()=>{
  const {C,$,loadJsonDataset,loadJsonFreshness,live,setStatus,nav}=window.SRGF;
  window.SRGFAuth.init(); nav("home");
  let shown=false;
  function render(players,teams,auction,source,error=false){
    const registeredPlayers=players.filter(x=>x?.["Name"]||x?.name);
    $("mPlayers").textContent=registeredPlayers.length; $("mTeams").textContent=teams.length;
    $("mAuctioned").textContent=auction.length; $("mSports").textContent="4"; setStatus(source,error);
  }
  try{ const [p,t,a]=await Promise.all([loadJsonDataset("players"),loadJsonDataset("teams"),loadJsonDataset("auction")]); render(p.data||[],t.data||[],a.data||[],"JSON data"); await loadJsonFreshness(); shown=true; }catch(_){}
  try{ const d=await live("data"); render(d.players||[],d.teams||[],d.auction||[],"LIVE · Google Sheet"); }catch(e){ if(!shown) render([],[],[],"JSON data unavailable",true); }
  $("refreshBtn")?.addEventListener("click",()=>location.reload());
  setInterval(()=>{if(!document.hidden)location.reload()},C.REFRESH_MS);
});
