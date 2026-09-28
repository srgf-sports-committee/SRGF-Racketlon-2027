document.addEventListener("DOMContentLoaded", async ()=>{
  const {C,$,live,setStatus,nav,jsonFile}=window.SRGF; window.SRGFAuth.init(); nav("home");
  function render(players,teams,auction,source){$("mPlayers").textContent=players.length;$("mTeams").textContent=teams.length;$("mAuctioned").textContent=auction.length;$("mSports").textContent="4";setStatus(`${source} · `+new Date().toLocaleTimeString(),source!=="LIVE");}
  let shown=false;
  try{const [p,t,a]=await Promise.all([jsonFile("players.json"),jsonFile("teams.json"),jsonFile("auction.json")]);render(p.rows||[],t.rows||[],a.rows||[],"JSON data");shown=true;}catch(_){}
  try{const d=await live("data");render(d.players||[],d.teams||[],d.auction||[],"LIVE");}catch(e){if(!shown)setStatus("No data available",true);}
  setInterval(async()=>{if(document.hidden)return;try{const d=await live("data");render(d.players||[],d.teams||[],d.auction||[],"LIVE")}catch(_){}},SRGF_CONFIG.REFRESH_MS);
});