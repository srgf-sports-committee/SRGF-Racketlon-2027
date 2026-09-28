document.addEventListener("DOMContentLoaded", async ()=>{
  const {C,$,live,setStatus,nav}=window.SRGF;
  window.SRGFAuth.init(); nav("home");
  try{
    const d=await live("data");
    const players=d.players||[], teams=d.teams||[], auction=d.auction||[];
    const registeredPlayers=players.filter(p=>p?.["Name"]||p?.name);
    $("mPlayers").textContent=registeredPlayers.length;
    $("mTeams").textContent=teams.length;
    $("mAuctioned").textContent=auction.length;
    $("mSports").textContent="4";
    setStatus("LIVE · "+new Date().toLocaleTimeString());
  }catch(e){
    try{
      const [p,t,a]=await Promise.all([SRGF.jsonFile("players.json"),SRGF.jsonFile("teams.json"),SRGF.jsonFile("auction.json")]);
      const playerRows=p.rows||[];
      const registeredPlayers=playerRows.filter(row=>row?.["Name"]||row?.name);
      $("mPlayers").textContent=registeredPlayers.length;
      $("mTeams").textContent=(t.rows||[]).length;
      $("mAuctioned").textContent=(a.rows||[]).length;
      $("mSports").textContent="4";
      setStatus("JSON fallback · "+new Date().toLocaleTimeString(),true);
    }catch(_){setStatus("No data available",true);}
  }
});