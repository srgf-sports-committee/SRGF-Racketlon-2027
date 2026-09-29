document.addEventListener("DOMContentLoaded", async ()=>{
  const {C,$,loadLiveFirstAll,loadJsonDataset,loadJsonFreshness,showLiveFreshness,setStatus,nav}=window.SRGF;
  window.SRGFAuth.init(); nav("home");
  try{
    const liveData=await loadLiveFirstAll();
    let players=[], teams=[], auction=[];
    if(liveData.live){
      players=liveData.data.players||[]; teams=liveData.data.teams||[]; auction=liveData.data.auction||[];
      showLiveFreshness(liveData.updatedAt);
    }else{
      const [p,t,a]=await Promise.all([loadJsonDataset("players"),loadJsonDataset("teams"),loadJsonDataset("auction")]);
      players=p.data||[]; teams=t.data||[]; auction=a.data||[];
      await loadJsonFreshness();
    }
    const registeredPlayers=players.filter(x=>x?.["Name"]||x?.name);
    $("mPlayers").textContent=registeredPlayers.length;
    $("mTeams").textContent=teams.length;
    $("mAuctioned").textContent=auction.length;
    $("mSports").textContent="4";
    await loadJsonFreshness();
    setStatus(liveData.live?"LIVE · Google Sheet":"JSON data · live unavailable",!liveData.live);
  }catch(e){setStatus("JSON data unavailable",true);}
  if(liveData?.retryPromise && !sessionStorage.getItem("SRGF_RETRY_RELOAD_DONE")){ liveData.retryPromise.then(()=>{ sessionStorage.setItem("SRGF_RETRY_RELOAD_DONE","1"); location.reload(); }).catch(()=>{}); }
  else if(sessionStorage.getItem("SRGF_RETRY_RELOAD_DONE")){ sessionStorage.removeItem("SRGF_RETRY_RELOAD_DONE"); }
  $("refreshBtn")?.addEventListener("click",()=>location.reload());
});
