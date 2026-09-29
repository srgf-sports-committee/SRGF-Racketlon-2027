document.addEventListener("DOMContentLoaded", async ()=>{
  const {C,$,loadLiveFirstAll,setStatus,nav}=SRGF;
  window.SRGFAuth.init(); nav("home");
  function render(data){
    const players=data?.players||[], teams=data?.teams||[], auction=data?.auction||[];
    const registeredPlayers=players.filter(x=>x?.["Name"]||x?.name);
    $("mPlayers").textContent=registeredPlayers.length;
    $("mTeams").textContent=teams.length;
    $("mAuctioned").textContent=auction.length;
    $("mSports").textContent="4";
  }
  try{
    const liveData=await loadLiveFirstAll();
    render(liveData.data||{});
    setStatus(liveData.live?"LIVE · Google Sheet":"Connecting to Google Sheets…",!liveData.live);
    if(liveData.retryPromise){
      liveData.retryPromise.then(r=>{render(r.data||{});setStatus("LIVE · Google Sheet");}).catch(()=>{});
    }
  }catch(e){setStatus("Connecting to Google Sheets…",true);}
  $("refreshBtn")?.addEventListener("click",()=>location.reload());
});
