document.addEventListener("DOMContentLoaded", async ()=>{
  const {loadLiveFirstAll,$,esc,money,setStatus,nav}=SRGF; SRGFAuth.init(); nav("teams");
  function render(data){
    const teams=data?.teams||[], auction=data?.auction||[], players=data?.players||[];
    $("teamsBoard").innerHTML=teams.slice(0,4).map(t=>{
      const id=t["Team ID"]||t.id||"", name=t["Team Name"]||t.name||id;
      const sales=auction.filter(a=>String(a["Team ID"]||a.teamId)===String(id));
      return `<div class="team-column"><div class="team-title">${esc(name)}</div>${sales.length?sales.map(a=>{
        const pid=a["Player ID"]||a.playerId, p=players.find(x=>String(x["Player ID"]||x.id)===String(pid));
        return `<div class="team-player">${esc(a["Player Name"]||a.player||p?.Name||p?.name||pid)} <span>${money(a.Amount||a.amount)}</span></div>`;
      }).join(""):`<div class="team-player team-empty">No players</div>`}</div>`;
    }).join("") || `<div class="notice">Waiting for data from Google Sheets…</div>`;
  }
  try{
    const d=await loadLiveFirstAll();
    window.__SRGF_LAST_DATA=d.data||{};
    render(d.data||{});
    setStatus(d.live?"LIVE · Google Sheet":"Connecting to Google Sheets…",!d.live);
    if(d.retryPromise)d.retryPromise.then(r=>{render(r.data||{});setStatus("LIVE · Google Sheet");}).catch(()=>{});
  }catch(e){setStatus("Connecting to Google Sheets…",true);}
  $("exportTeamsBtn")?.addEventListener("click",()=>{
    const d=window.__SRGF_LAST_DATA||{}; const auction=d.auction||[];
    const rows=[["Team","Player ID","Player Name","Amount"]];
    auction.forEach(a=>rows.push([a["Team Name"]||a.team||"",a["Player ID"]||a.playerId||"",a["Player Name"]||a.player||"",a.Amount||a.amount||0]));
    downloadCSV(rows,"SRGF_Racketlon_2027_Teams.csv");
  });
  window.addEventListener("srgf-live-success",e=>{window.__SRGF_LAST_DATA=e.detail.data||{};});
});
function downloadCSV(rows,name){const csv="\uFEFF"+rows.map(r=>r.map(v=>`"${String(v??"").replace(/"/g,'""')}"`).join(",")).join("\r\n");const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv"}));a.download=name;a.click();}
