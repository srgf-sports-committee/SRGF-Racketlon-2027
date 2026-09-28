document.addEventListener("DOMContentLoaded", async ()=>{
  const {C,$,loadJsonDataset,loadJsonFreshness,setStatus,nav}=window.SRGF;
  window.SRGFAuth.init(); nav("home");
  try{
    const [p,t,a]=await Promise.all([loadJsonDataset("players"),loadJsonDataset("teams"),loadJsonDataset("auction")]);
    const players=p.data||[], teams=t.data||[], auction=a.data||[];
    const registeredPlayers=players.filter(x=>x?.["Name"]||x?.name);
    $("mPlayers").textContent=registeredPlayers.length;
    $("mTeams").textContent=teams.length;
    $("mAuctioned").textContent=auction.length;
    $("mSports").textContent="4";
    await loadJsonFreshness();
    setStatus("JSON data");
  }catch(e){setStatus("JSON data unavailable",true);}
  $("refreshBtn")?.addEventListener("click",()=>location.reload());
  setInterval(()=>{if(!document.hidden)location.reload()},30000);
});
