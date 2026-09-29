document.addEventListener("DOMContentLoaded", async ()=>{
  const {C,$,loadLiveFirstAll,loadJsonDataset,setStatus,nav}=window.SRGF;
  window.SRGFAuth.init(); nav("home");
  try{
    const liveData=await loadLiveFirstAll();
    let players=[], teams=[], auction=[];
    if(liveData.live){
      players=liveData.data.players||[]; teams=liveData.data.teams||[]; auction=liveData.data.auction||[];
          }else{
      const [p,t,a]=await Promise.all([loadJsonDataset("players"),loadJsonDataset("teams"),loadJsonDataset("auction")]);
      players=p.data||[]; teams=t.data||[]; auction=a.data||[];
          }
    const registeredPlayers=players.filter(x=>x?.["Name"]||x?.name);
    $("mPlayers").textContent=registeredPlayers.length;
    $("mTeams").textContent=teams.length;
    $("mAuctioned").textContent=auction.length;
    $("mSports").textContent="4";
        setStatus(liveData.live?"LIVE · Google Sheet":"JSON data · live unavailable",!liveData.live);
  }catch(e){setStatus("JSON data unavailable",true);}
  $("refreshBtn")?.addEventListener("click",()=>location.reload());
  setInterval(()=>{if(!document.hidden)location.reload()},30000);
});
