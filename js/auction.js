document.addEventListener("DOMContentLoaded", async ()=>{
  const {live,$,esc,money,setStatus,nav}=SRGF; SRGFAuth.init();
  if(!SRGFAuth.canAuction()){nav("home");$("auctionAccess")?.classList.remove("hidden");return;}
  nav("auction");
  let players=[],teams=[],auction=[],config={};
  function stats(tid){const s=auction.filter(a=>String(a["Team ID"]||a.teamId)===String(tid)),spent=s.reduce((x,a)=>x+Number(a.Amount||a.amount||0),0);const budget=Number(config["Initial Budget"]||5000000),min=Number(config["Minimum Players"]||15),reserve=Number(config["Reserve Per Slot"]||100000),left=Math.max(0,budget-spent),remaining=Math.max(0,min-s.length),max=Math.max(0,left-(remaining>0?(remaining-1)*reserve:0));return {s,spent,left,max}}
  function render(){
    $("teamSelect").innerHTML='<option value="">Select Team</option>'+teams.map(t=>`<option value="${esc(t["Team ID"]||t.id)}">${esc(t["Team Name"]||t.name)}</option>`).join("");
    $("playerSelect").innerHTML='<option value="">Select Player</option>'+players.filter(p=>!auction.some(a=>String(a["Player ID"]||a.playerId)===String(p["Player ID"]||p.id))).map(p=>`<option value="${esc(p["Player ID"]||p.id)}">${esc(p["Name"]||p.name)}</option>`).join("");
    $("historyBody").innerHTML=auction.map(a=>`<tr><td>${esc(a["Player Name"]||a.player)}</td><td>${esc(a["Team Name"]||a.team)}</td><td>${money(a.Amount||a.amount)}</td><td>${esc(a.Timestamp||a.time||"")}</td></tr>`).join("")||`<tr><td colspan="4">No auction sales.</td></tr>`;
    $("teamMetrics").innerHTML=teams.map(t=>{const x=stats(t["Team ID"]||t.id);return `<div class="metric"><label>${esc(t["Team Name"]||t.name)}</label><strong>${x.s.length} players</strong><span>Spent ${money(x.spent)} · Left ${money(x.left)} · Max ${money(x.max)}</span></div>`}).join("");
    $("auctionTeamsBoard").innerHTML=teams.map(t=>{const x=stats(t["Team ID"]||t.id);return `<div class="team-column"><div class="team-title">${esc(t["Team Name"]||t.name)}</div>${x.s.map(a=>`<div class="team-player">${esc(a["Player Name"]||a.player)}</div>`).join("")||'<div class="team-player team-empty">No players</div>'}</div>`}).join("");
  }
  $("sellBtn")?.addEventListener("click",async()=>{
    const pid=$("playerSelect").value,tid=$("teamSelect").value,raw=$("bidInput").value.trim();
    if(!pid||!tid||!raw){$("auctionMessage").textContent="Select player, team and bid amount.";return}
    const amount=Number(raw)*100000;if(!Number.isFinite(amount)||amount<100000||amount>9900000){$("auctionMessage").textContent="Enter a value from 1 to 99.";return}
    const t=teams.find(x=>String(x["Team ID"]||x.id)===String(tid));const x=stats(tid);
    if(amount>x.max){$("auctionMessage").textContent=`Maximum allowed bid is ${money(x.max)}.`;return}
    const p=players.find(x=>String(x["Player ID"]||x.id)===String(pid));
    try{
      $("sellBtn").disabled=true;
      const body=new URLSearchParams({action:"sellPlayer",playerId:pid,teamId:tid,amount:String(amount),token:SRGFAuth.token()});
      const r=await SRGF.fetchTimeout(SRGF_CONFIG.API_URL,{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded;charset=UTF-8"},body},20000);
      const j=await r.json();if(!j.ok)throw new Error(j.error||"Auction save failed");
      $("auctionMessage").textContent=`${p?.Name||pid} sold successfully. Refreshing…`;
      await load();
    }catch(e){$("auctionMessage").textContent=e.message||String(e)}finally{$("sellBtn").disabled=false}
  });
  $("bidInput")?.addEventListener("input",()=>{$("bidInput").value=$("bidInput").value.replace(/[^\d.]/g,"").slice(0,4)});
  async function load(){
    try{const d=await live("data");players=d.players||[];teams=d.teams||[];auction=d.auction||[];(d.config||[]).forEach(r=>config[r.Parameter]=r.Value);render();setStatus("LIVE · "+new Date().toLocaleTimeString())}
    catch(e){setStatus(e.message,true)}
  }
  $("refreshBtn")?.addEventListener("click",load);await load();setInterval(()=>{if(!document.hidden)load()},15000);
});