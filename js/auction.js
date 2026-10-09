document.addEventListener("DOMContentLoaded",async()=>{
  const $=SRGF.$, esc=SRGF.esc, money=SRGF.money;
  await SRGFAuth.init();
  if(!SRGFAuth.canAuction()){
    $("auctionAccess")?.classList.remove("hidden");
    $("auctionAccess").textContent="Auction access requires the authorized Admin Google account. If your login session expired, please log in again.";
    SRGF.setStatus("Admin login required",true);
    return;
  }
  SRGF.nav("auction");

  const CACHE_KEY="SRGF_RACKETLON_2027_AUCTION_STATE_V2";
  const API=SRGF_CONFIG.API_URL;
  const STATIC_PROFILE_URL="data/player-profiles.json";
  const REFRESH_MS=15000;
  let state={players:[],teams:[],auction:[],config:{},pending:[],pendingDeletes:[]};
  let loadPromise=null,autoBusy=false,timer=null;

  const first=(r,names)=>{
    for(const n of names) if(r[n]!==undefined&&r[n]!==null&&String(r[n]).trim()!=="") return String(r[n]).trim();
    return "";
  };
  const normalizePlayers=rows=>(Array.isArray(rows)?rows:[]).filter(r=>first(r,["Name"])).map((r,i)=>({
    id:first(r,["Player ID"])||("P"+String(i+1).padStart(3,"0")),name:first(r,["Name"]),
    category:first(r,["Preferred Category"]),badminton:first(r,["Badminton Level"]),
    tt:first(r,["Table Tennis Level"]),tennis:first(r,["Lawn Tennis Level"]),
    pickle:first(r,["Pickle Ball Level"]),priorityChart:first(r,["Priority Chart"]),team:first(r,["Team ID"]),amount:Number(first(r,["Auction Amount"])||0),
    active:String(first(r,["Active"])||"TRUE").toUpperCase()!=="FALSE",
    image:(()=>{const v=first(r,["Photo","Photo URL","Image URL","Profile Photo","Player Photo","Image","Profile Image","Picture","Photo Link","Image Link"]);if(!v)return "";if(v.startsWith("drive:"))return v;const m=v.match(/(?:id=|\/d\/|file\/d\/)([A-Za-z0-9_-]{20,})/);if(m)return "drive:"+m[1];if(/^[A-Za-z0-9_-]{25,}$/.test(v))return "drive:"+v;return v;})()
  }));
  const normalizeTeams=rows=>{
    const a=(Array.isArray(rows)?rows:[]).map(r=>({id:first(r,["Team ID"]),name:first(r,["Team Name"])||first(r,["Team ID"]),budget:Number(first(r,["Initial Budget"])||5000000)})).filter(x=>x.id);
    return a.length?a:Array.from({length:4},(_,i)=>({id:"T"+(i+1),name:"Team "+(i+1),budget:5000000}));
  };
  const normalizeAuction=rows=>(Array.isArray(rows)?rows:[]).filter(r=>first(r,["Player ID","Player Name"])).map(r=>({
    id:first(r,["Auction ID"]),playerId:first(r,["Player ID"]),player:first(r,["Player Name"]),
    teamId:first(r,["Team ID"]),team:first(r,["Team Name"])||first(r,["Team ID"]),
    amount:Number(first(r,["Amount"])||0),time:first(r,["Timestamp"]),notes:first(r,["Notes"])
  }));
  const key=a=>String(a.playerId||a.id||"");

  function saveCache(){try{localStorage.setItem(CACHE_KEY,JSON.stringify({...state,savedAt:new Date().toISOString()}));}catch(_){}}
  function readCache(){try{const c=JSON.parse(localStorage.getItem(CACHE_KEY)||"null");return c&&Array.isArray(c.auction)?c:null;}catch(_){return null;}}
  function profileMap(rows){
    const m=new Map();
    (Array.isArray(rows)?rows:[]).forEach(p=>{if(p&&p.id)m.set(String(p.id),p);});
    return m;
  }
  async function loadStaticProfiles(){
    const merged=new Map();
    const urls=[STATIC_PROFILE_URL,"data/players.json"];
    for(const url of urls){
      try{
        const r=await fetch(url+"?v="+Date.now(),{cache:"no-store"});
        if(!r.ok)continue;
        const d=await r.json();
        const rows=Array.isArray(d?.players)?d.players:(Array.isArray(d?.rows)?normalizePlayers(d.rows):[]);
        rows.forEach(p=>{
          if(!p||!p.id)return;
          const old=merged.get(String(p.id))||{};
          merged.set(String(p.id),{...old,...p,image:String(p.image||old.image||"").trim()});
        });
      }catch(_){}
    }
    return [...merged.values()];
  }
  function mergeStaticProfiles(staticPlayers,allowAdd){
    const profiles=profileMap(staticPlayers);
    if(!profiles.size)return false;
    const existing=profileMap(state.players);
    state.players=state.players.map(p=>{
      const s=profiles.get(String(p.id));
      if(!s)return p;
      const out={...p};
      ["name","category","badminton","tt","tennis","pickle","image","priorityChart"].forEach(k=>{
        // GitHub is the static profile/photo backup. Prefer its photo whenever
        // one exists, even if the live Sheet still contains a Drive reference.
        if(k==="image"){
          if(String(s[k]??"").trim())out[k]=s[k];
        }else if(!String(out[k]??"").trim()&&String(s[k]??"").trim()){
          out[k]=s[k];
        }
      });
      return out;
    });
    if(allowAdd){
      profiles.forEach((s,id)=>{
        if(!existing.has(id)&&s.name)state.players.push({...s});
      });
    }
    return true;
  }
  function applyCache(){
    const c=readCache();if(!c)return false;
    state={players:Array.isArray(c.players)?c.players:[],teams:Array.isArray(c.teams)?c.teams:[],auction:Array.isArray(c.auction)?c.auction:[],config:c.config||{},pending:Array.isArray(c.pending)?c.pending:[],pendingDeletes:Array.isArray(c.pendingDeletes)?c.pendingDeletes:[]};
    render();return true;
  }
  function stats(id){
    const sales=state.auction.filter(a=>String(a.teamId)===String(id));
    const team=state.teams.find(t=>String(t.id)===String(id));
    const budget=Number(state.config["Initial Budget"]||team?.budget||5000000);
    const min=Number(state.config["Minimum Players"]||15),reserve=Number(state.config["Reserve Per Slot"]||100000);
    const spent=sales.reduce((s,a)=>s+Number(a.amount||0),0),left=budget-spent,remaining=Math.max(0,min-sales.length);
    return {sales,budget,spent,left,maxBid:Math.max(0,left-Math.max(0,remaining-1)*reserve),players:sales.length};
  }
  function scaleInfo(){
    const budget=Math.max(1,Math.round(Number(state.config["Initial Budget"]||5000000)));
    return {scale:Math.pow(10,Math.max(0,String(budget).replace(/[^0-9]/g,"").length-2))};
  }
  function refreshBidUI(){
    const s=scaleInfo();
    $("bidSuffix").value="× "+money(s.scale);
    $("bidAmountHint").textContent="Enter 1–99.9; one decimal place is allowed. Scale: "+money(s.scale)+".";
  }
  function validateBid(){
    const el=$("bidInput");if(!el)return;
    let v=String(el.value||"").replace(/[^0-9.]/g,""),d=v.indexOf(".");
    if(d>=0)v=v.slice(0,d+1)+v.slice(d+1).replace(/\./g,"").slice(0,1);
    v=(v.match(/^(\d{0,2})(?:\.(\d?))?/)||["",""])[0];el.value=v;
    const n=Number(v);el.setCustomValidity(v&&Number.isFinite(n)&&n>=1&&n<=99.9?"":"Enter a number from 1 to 99.9 (one decimal place).");
  }
  function bidAmount(){
    const v=String($("bidInput").value||"").trim();if(!/^\d{1,2}(?:\.\d)?$/.test(v))return 0;
    const n=Number(v);return n>=1&&n<=99.9?Math.round(n*scaleInfo().scale):0;
  }
  function initials(name){return String(name||"?").trim().split(/\s+/).slice(0,2).map(x=>x[0]||"").join("").toUpperCase()||"?";}
  function priorityChartBadges(value){
    const parts=String(value||"").split(/\s*\|\s*/).map(x=>x.trim());
    const labels=["P1","P2","P3","P4"];
    const colors=["#245B85","#23765B","#8A5A20","#67469A"];
    if(parts.length!==4||!parts.every((part,i)=>new RegExp("^"+labels[i]+"\\s*:","i").test(part)))return esc(value||"");
    return '<span style="display:inline-flex;flex-wrap:wrap;align-items:center;justify-content:flex-end;gap:4px">'+parts.map((part,i)=>'<span style="display:inline-block;background:'+colors[i]+';color:#fff;border-radius:5px;padding:3px 6px;white-space:nowrap;font-family:Inter,Arial,sans-serif;font-size:14px;font-weight:500">'+esc(part)+'</span>').join("")+'</span>';
  }

  function playerOptions(q){
    const avail=state.players.filter(p=>p.active&&!state.auction.some(a=>String(a.playerId)===String(p.id)));
    const x=String(q||"").trim().toLowerCase(),matches=x?avail.filter(p=>[p.name,p.id,p.category].some(v=>String(v||"").toLowerCase().includes(x))):avail;
    const selected=String($("playerSelect").value||"");
    $("playerDropdownOptions").innerHTML=matches.length?matches.map(p=>'<button type="button" class="player-dropdown-option'+(String(p.id)===selected?" active":"")+'" data-player-id="'+esc(p.id)+'" role="option">'+esc(p.name)+' <span style="color:var(--muted)">— '+esc(p.category)+'</span></button>').join(""):'<div class="player-dropdown-empty">'+(x?"No matching players":"No available players")+"</div>";
    document.querySelectorAll(".player-dropdown-option").forEach(b=>b.addEventListener("click",()=>{
      $("playerSelect").value=b.dataset.playerId;$("playerDropdownSearch").value="";$("playerDropdown").classList.add("hidden");$("playerSelectDisplay").setAttribute("aria-expanded","false");$("playerSelect").dispatchEvent(new Event("change",{bubbles:true}));
    }));
  }

  async function playerPhoto(p){
    const img=$("selectedPlayerPhoto"),ph=$("selectedPlayerInitials"),z=$("photoZoomBtn");if(!img||!ph||!z)return;
    const v=String(p?.image||"").trim();if(!v){img.style.display="none";ph.style.display="flex";ph.textContent=initials(p?.name);z.style.display="none";return;}
    try{
      let src=v;
      if(v.startsWith("drive:")){
        const id=v.slice(6);
        try{
          const r=await SRGF.fetchTimeout(API+"?action=photo&id="+encodeURIComponent(id)+"&t="+Date.now(),{},15000),d=await r.json();
          if(d.ok&&d.base64)src="data:"+d.mimeType+";base64,"+d.base64;
          else throw new Error(d.error||"Photo endpoint unavailable");
        }catch(_){
          src="https://drive.google.com/thumbnail?id="+encodeURIComponent(id)+"&sz=w1000";
        }
      }
      // Bust browser cache for GitHub-hosted profile photos so a newly synced
      // photo is displayed immediately even when the filename is unchanged.
      if(/^assets\//i.test(src))src += (src.includes("?")?"&":"?")+"v="+Date.now();
      img.src=src;img.style.display="block";ph.style.display="none";z.style.display="block";z.dataset.photoSrc=src;z.dataset.photoName=p.name;
      img.onerror=()=>{img.style.display="none";ph.style.display="flex";ph.textContent=initials(p.name);z.style.display="none";};
    }catch(_){img.style.display="none";ph.style.display="flex";ph.textContent=initials(p.name);z.style.display="none";}
  }
  function renderPlayerDetails(selectedPlayer){
    const p=selectedPlayer||state.players.find(x=>String(x.id)===String($("playerSelect").value)),box=$("playerDetails");
    if(!p){box.className="player-details-empty";box.innerHTML="Select a player to view player details.";return;}
    box.className="player-details";
    box.innerHTML='<div class="player-photo-wrap"><img id="selectedPlayerPhoto" class="player-photo" src="" alt="'+esc(p.name)+'" style="display:none"><div id="selectedPlayerInitials" class="player-photo-placeholder">'+esc(initials(p.name))+'</div><button type="button" id="photoZoomBtn" class="photo-zoom-btn" style="display:none">🔍 Zoom</button></div><div><div class="player-name" style="display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:12px"><span>'+esc(p.name)+'</span><span class="priority-chart-value" style="margin-left:auto;text-align:right;font-weight:700;white-space:nowrap">'+priorityChartBadges(p.priorityChart||"")+'</span></div><div class="player-info"><div class="player-info-item"><label>Player ID</label><strong>'+esc(p.id)+'</strong></div><div class="player-info-item"><label>Category</label><strong>'+esc(p.category||"—")+'</strong></div><div class="player-info-item"><label>Badminton</label><strong>'+esc(p.badminton||"—")+'</strong></div><div class="player-info-item"><label>Table Tennis</label><strong>'+esc(p.tt||"—")+'</strong></div><div class="player-info-item"><label>Lawn Tennis</label><strong>'+esc(p.tennis||"—")+'</strong></div><div class="player-info-item"><label>Pickleball</label><strong>'+esc(p.pickle||"—")+'</strong></div></div></div>';
    playerPhoto(p);
  }
  function renderTeamsBoard(){
    const board=$("auctionTeamsBoard");
    if(!board)return;
    board.innerHTML=state.teams.map(t=>{
      const players=state.auction
        .filter(a=>String(a.teamId)===String(t.id))
        .sort((a,b)=>String(a.player||"").localeCompare(String(b.player||"")));
      return '<div class="team-column"><div class="team-title">'+esc(t.name)+'</div>'+
        (players.length
          ? players.map(a=>'<div class="team-player">'+esc(a.player)+'</div>').join("")
          : '<div class="team-player team-empty">No players sold</div>')+
        '</div>';
    }).join("");
  }

  function render(){
    refreshBidUI();
    const sp=String($("playerSelect").value||""),st=String($("teamSelect").value||"");
    $("teamMetrics").innerHTML=state.teams.map(t=>{const s=stats(t.id);return '<div class="metric"><label>'+esc(t.name)+'</label><strong>'+money(s.left)+'</strong><div class="notice">'+s.players+' players · max '+money(s.maxBid)+'</div></div>';}).join("");
    renderTeamsBoard();
    const avail=state.players.filter(p=>p.active&&!state.auction.some(a=>String(a.playerId)===String(p.id)));
    $("playerSelect").innerHTML=avail.length?avail.map(p=>'<option value="'+esc(p.id)+'">'+esc(p.name)+' — '+esc(p.category)+'</option>').join(""):'<option value="">No available players</option>';
    if(avail.some(p=>String(p.id)===sp))$("playerSelect").value=sp;else $("playerSelect").value=avail[0]?.id||"";
    const cp=avail.find(p=>String(p.id)===String($("playerSelect").value));$("playerSelectDisplay").textContent=cp?cp.name+" — "+cp.category:(avail.length?"Select Player":"No available players");playerOptions("");
    $("teamSelect").innerHTML='<option value="">Select Team</option>'+state.teams.map(t=>'<option value="'+esc(t.id)+'">'+esc(t.name)+'</option>').join("");
    if(state.teams.some(t=>String(t.id)===st))$("teamSelect").value=st;
    renderPlayerDetails();
    $("historyBody").innerHTML=state.auction.length?[...state.auction].reverse().map(a=>'<tr><td>'+esc(a.player)+'</td><td>'+esc(a.team)+'</td><td>'+money(a.amount)+'</td><td>'+esc(a.time)+'</td><td><button class="danger remove-sale" data-player-id="'+esc(a.playerId)+'">Remove</button></td></tr>').join(""):'<tr><td colspan="5" class="notice">No auction sales yet.</td></tr>';
    document.querySelectorAll(".remove-sale").forEach(b=>b.addEventListener("click",()=>removeSale(b.dataset.playerId)));
  }
  function mergeLive(players,teams,auction){
    const oldPlayers=state.players||[];
    const oldMap=profileMap(oldPlayers);
    const deleted=new Set((state.pendingDeletes||[]).map(String)),remote=auction.filter(a=>!deleted.has(String(a.playerId))),keys=new Set(remote.map(key));
    const pending=(state.pending||[]).filter(a=>!keys.has(key(a)));
    state.players=players.map(p=>{
      const old=oldMap.get(String(p.id));
      const out={...p};
      ["name","category","badminton","tt","tennis","pickle","image"].forEach(k=>{
        if(!String(out[k]??"").trim()&&String(old?.[k]??"").trim())out[k]=old[k];
      });
      return out;
    });
    state.teams=teams;state.auction=remote.concat(pending);state.pending=pending;
  }
  async function apiData(){
    let last;for(let i=0;i<2;i++){try{return await SRGF.live("data");}catch(e){last=e;if(i===0)await new Promise(r=>setTimeout(r,1200));}}throw last||new Error("Could not read live Google Sheet data");
  }
  async function saveSaleDirect(sale){
    let last;
    for(let attempt=1;attempt<=2;attempt++){
      try{
        const body=new URLSearchParams({
          action:"sellplayer",
          token:SRGFAuth.token(),
          playerId:String(sale.playerId),
          teamId:String(sale.teamId),
          amount:String(Number(sale.amount)),
          notes:sale.notes||""
        });
        const r=await SRGF.fetchTimeout(API,{
          method:"POST",
          headers:{"Content-Type":"application/x-www-form-urlencoded;charset=UTF-8"},
          body
        },20000);
        const d=await r.json();
        if(!d.ok)throw new Error(d.error||"Google Sheet save failed.");
        return {ok:true,result:d.result||{}};
      }catch(e){
        last=e;
        if(attempt<2)await new Promise(r=>setTimeout(r,1200));
      }
    }
    return {ok:false,errorMessage:last?.message||String(last)};
  }

  async function syncChanges(){
    const sales=[...state.pending],deletes=[...new Set((state.pendingDeletes||[]).map(String))];
    if(!sales.length&&!deletes.length)return {synced:0,deleted:0,remainingSales:0,remainingDeletes:0};

    // Use the protected single-operation endpoints for pending changes.
    // This avoids depending on the bulk syncChanges action being present in
    // an older Apps Script deployment.
    let synced=0,deleted=0,errors=[];
    const savedSales=[];
    for(const sale of sales){
      const r=await saveSaleDirect(sale);
      if(r.ok){
        synced++;
        savedSales.push(String(sale.playerId));
      }else{
        errors.push({type:"sellPlayer",playerId:String(sale.playerId),error:r.errorMessage||"Google Sheet save failed."});
      }
    }

    const removedIds=[];
    for(const playerId of deletes){
      let last="";
      let ok=false;
      for(let attempt=1;attempt<=2;attempt++){
        try{
          const body=new URLSearchParams({
            action:"removeplayer",
            token:SRGFAuth.token(),
            playerId:String(playerId)
          });
          const r=await SRGF.fetchTimeout(API,{
            method:"POST",
            headers:{"Content-Type":"application/x-www-form-urlencoded;charset=UTF-8"},
            body
          },20000);
          const d=await r.json();
          if(!d.ok)throw new Error(d.error||"Google Sheet removal failed.");
          ok=true;break;
        }catch(e){
          last=e?.message||String(e);
          if(attempt<2)await new Promise(r=>setTimeout(r,1200));
        }
      }
      if(ok){
        deleted++;
        removedIds.push(String(playerId));
      }else{
        errors.push({type:"removePlayer",playerId:String(playerId),error:last||"Google Sheet removal failed."});
      }
    }

    const savedSet=new Set(savedSales),removedSet=new Set(removedIds);
    state.pending=sales.filter(s=>!savedSet.has(String(s.playerId)));
    state.pendingDeletes=deletes.filter(id=>!removedSet.has(String(id)));
    saveCache();

    return {
      synced,
      deleted,
      remainingSales:state.pending.length,
      remainingDeletes:state.pendingDeletes.length,
      errors,
      errorMessage:errors.length?errors.map(e=>e.error).join(" | "):""
    };
  }

  async function removeSale(pid){
    const sale=state.auction.find(a=>String(a.playerId)===String(pid));if(!sale)return;
    if(!confirm("Remove "+sale.player+" from the auction history?\n\nThis will free the player to be added to the auction again."))return;
    state.auction=state.auction.filter(a=>String(a.playerId)!==String(pid));state.pending=state.pending.filter(a=>String(a.playerId)!==String(pid));
    if(!state.pendingDeletes.includes(String(pid)))state.pendingDeletes.push(String(pid));
    const p=state.players.find(x=>String(x.id)===String(pid));if(p){p.team="";p.amount=0;}
    saveCache();render();$("auctionMessage").textContent=sale.player+" removed locally. Saving the change to Google Sheet…";
    const r=await syncChanges();if(r.remainingDeletes===0){$("auctionMessage").textContent=sale.player+" removed successfully. The player is available to auction again.";SRGF.setStatus("LIVE · Google Sheet · "+new Date().toLocaleTimeString());}
    else{$("auctionMessage").textContent=sale.player+" removed locally. Sheet unavailable — the removal is safely queued and will retry until saved.";SRGF.setStatus("Sheet update failed · retrying every 15s",true);startRetry();}render();
  }
  async function sell(){
    const pid=$("playerSelect").value,tid=$("teamSelect").value;validateBid();const amount=bidAmount();
    const p=state.players.find(x=>String(x.id)===String(pid)),t=state.teams.find(x=>String(x.id)===String(tid));
    if(!p||!t||amount<=0){$("auctionMessage").textContent="Select a player, team and a bid amount from 1 to 99.9.";return;}
    const s=stats(tid);if(amount>s.maxBid){$("auctionMessage").textContent="Bid exceeds "+t.name+"'s current max bid of "+money(s.maxBid)+".";return;}
    const sale={id:"LOCAL-"+Date.now(),playerId:pid,player:p.name,teamId:tid,team:t.name,amount:amount,time:new Date().toISOString(),notes:""};
    state.auction.push(sale);state.pending.push(sale);p.team=tid;p.amount=amount;saveCache();render();$("bidInput").value="";
    $("auctionMessage").textContent="Sold locally: "+p.name+" → "+t.name+" for "+money(amount)+". Saving to Google Sheet…";$("sellBtn").disabled=false;
    // Save the sale directly through the protected sellplayer endpoint.
    // This avoids depending on the bulk sync endpoint for the normal sale flow.
    const r=await saveSaleDirect(sale);
    if(r.ok){
      state.pending=state.pending.filter(x=>String(x.playerId)!==String(sale.playerId));
      saveCache();
      stopRetry();
      $("auctionMessage").textContent="Sold: "+p.name+" → "+t.name+" for "+money(amount)+". Data saved to Google Sheet.";
      SRGF.setStatus("LIVE · Google Sheet · "+new Date().toLocaleTimeString());
      await load();
    }else{
      $("auctionMessage").textContent="Sold locally: "+p.name+" → "+t.name+" for "+money(amount)+". Google Sheet save failed: "+r.errorMessage+" — retrying every 15s.";
      SRGF.setStatus("Sheet save failed · retrying every 15s",true);
      render();
      startRetry();
    }
  }
  async function load(){
    if(loadPromise)return loadPromise;
    loadPromise=(async()=>{
      const hadCache=applyCache();if(hadCache)SRGF.setStatus("Refreshing… showing saved auction data");
      const staticProfiles=await loadStaticProfiles();
      if(staticProfiles.length){
        mergeStaticProfiles(staticProfiles,!hadCache);
        saveCache();
        render();
        if(hadCache)SRGF.setStatus("Refreshing… saved data + GitHub profile backup");
      }
      try{
        SRGF.setStatus("Refreshing from Google Sheet…");
        const d=await apiData();state.config={};(d.config||[]).forEach(r=>{if(r["Parameter"]!==undefined)state.config[String(r["Parameter"])]=r["Value"];});
        mergeLive(normalizePlayers(d.players),normalizeTeams(d.teams),normalizeAuction(d.auction));
        // Re-apply the GitHub static profile after live Sheet data so a Drive
        // photo value from the Sheet cannot replace the GitHub photo.
        mergeStaticProfiles(staticProfiles,false);
        render();saveCache();
        const pending=state.pending.length+state.pendingDeletes.length;SRGF.setStatus(pending?"LIVE · Sheet + "+pending+" pending":"LIVE · Google Sheet · "+new Date().toLocaleTimeString(),!!pending);
      }catch(e){
        startRetry();
        if(staticProfiles.length){
          mergeStaticProfiles(staticProfiles,!hadCache);
          render();
          saveCache();
        }
        if(hadCache||staticProfiles.length){
          SRGF.setStatus("OFFLINE · using saved + GitHub profile data",true);
          $("auctionMessage").textContent="Live Sheet refresh failed. Existing auction data was preserved; player profile information is being served from the browser cache/GitHub backup. Background sync will retry every 15 seconds.";
        }
        else{SRGF.setStatus(e.message||String(e),true);$("auctionMessage").textContent=(e.message||String(e))+" — no saved auction state or GitHub player profile backup is available yet.";}
      }finally{loadPromise=null;}
    })();return loadPromise;
  }
  function stopRetry(){
    if(retryTimer){clearInterval(retryTimer);retryTimer=null;}
    retryBusy=false;
  }
  function startRetry(){
    if(retryTimer)return;
    retryTimer=setInterval(async()=>{
      if(document.hidden||retryBusy)return;
      retryBusy=true;
      try{
        if(state.pending.length||state.pendingDeletes.length){
          const r=await syncChanges();
          const n=r.remainingSales+r.remainingDeletes;
          if(n){
            SRGF.setStatus("RETRYING · "+n+" pending change(s)",true);
            return;
          }
        }
        await load();
        stopRetry();
      }finally{retryBusy=false;}
    },15000);
  }
  function startAuto(){if(timer){clearInterval(timer);timer=null;}}


  $("bidInput")?.addEventListener("input",validateBid);$("bidInput")?.addEventListener("blur",validateBid);
  $("playerSelectDisplay")?.addEventListener("click",()=>{const open=$("playerDropdown").classList.contains("hidden");$("playerDropdown").classList.toggle("hidden",!open);$("playerSelectDisplay").setAttribute("aria-expanded",String(open));if(open){playerOptions($("playerDropdownSearch").value);setTimeout(()=>$("playerDropdownSearch").focus(),0);}});
  $("playerDropdownSearch")?.addEventListener("input",()=>playerOptions($("playerDropdownSearch").value));
  $("playerSelect")?.addEventListener("change",async()=>{
    $("teamSelect").value="";
    const p=state.players.find(x=>String(x.id)===String($("playerSelect").value));
    $("playerSelectDisplay").textContent=p?p.name+" — "+p.category:"Select Player";
    playerOptions("");renderPlayerDetails(p);
    // Refresh live data whenever a player is selected, while preserving the
    // selected player/profile from cache or GitHub if the Sheet is slow.
    await load();
  });
  $("sellBtn")?.addEventListener("click",sell);
  $("refreshBtn")?.addEventListener("click",()=>load());
  $("testSheetBtn")?.addEventListener("click",async()=>{const b=$("testSheetBtn");b.disabled=true;try{await SRGF.live("ping");$("auctionMessage").textContent="Google Apps Script connection is working. Backend is reachable.";SRGF.setStatus("LIVE · Apps Script reachable · "+new Date().toLocaleTimeString());}catch(e){$("auctionMessage").textContent="Apps Script connection failed: "+(e.message||e);SRGF.setStatus("Sheet connection failed",true);}finally{b.disabled=false;}});
  $("syncBtn")?.addEventListener("click",async()=>{
    const b=$("syncBtn");b.disabled=true;
    try{
      const r=await syncChanges(),n=r.remainingSales+r.remainingDeletes;
      if(n){
        const detail=r.errorMessage || (r.errors&&r.errors.length ? r.errors.map(e=>e.error||String(e)).join(" | ") : "");
        $("auctionMessage").textContent=r.synced+" sale(s) and "+r.deleted+" removal(s) synced. "+n+" change(s) still pending."+(detail?" Reason: "+detail:"");
        SRGF.setStatus("Sheet update failed · retrying every 15s",true);
        render();startRetry();
      }else{
        stopRetry();
        $("auctionMessage").textContent=r.synced+" sale(s) and "+r.deleted+" removal(s) synced to Google Sheets successfully. Refreshing…";
        await load();
      }
    }finally{b.disabled=false;}
  });
  document.addEventListener("click",e=>{
    const wrap=$("playerSelectDisplay")?.closest(".player-combobox");if(wrap&&!wrap.contains(e.target)){$("playerDropdown").classList.add("hidden");$("playerSelectDisplay").setAttribute("aria-expanded","false");}
    if(e.target?.id==="photoZoomBtn"){const z=e.target,m=document.createElement("div");m.className="photo-modal";m.innerHTML='<button class="photo-modal-close">×</button><img src="'+esc(z.dataset.photoSrc||"")+'" alt="'+esc(z.dataset.photoName||"Player photo")+'"><div class="photo-modal-caption">'+esc(z.dataset.photoName||"")+"</div>";document.body.appendChild(m);m.addEventListener("click",ev=>{if(ev.target===m||ev.target.classList.contains("photo-modal-close"))m.remove();});}
  });
  $("exportAuctionBtn")?.addEventListener("click",()=>{
    const rows=[["Auction ID","Player ID","Player Name","Team ID","Team Name","Amount","Timestamp","Notes"]].concat([...state.auction].sort((a,b)=>String(a.time||"").localeCompare(String(b.time||""))).map(a=>[a.id,a.playerId,a.player,a.teamId,a.team,a.amount,a.time,a.notes||""]));
    const csv=rows.map(r=>r.map(v=>'"'+String(v??"").replace(/"/g,'""')+'"').join(",")).join("\r\n"),a=document.createElement("a"),u=URL.createObjectURL(new Blob(["\uFEFF"+csv],{type:"text/csv;charset=utf-8;"}));
    a.href=u;a.download="SRGF_Racketlon_2027_Auction_"+new Date().toISOString().replace(/[:.]/g,"-").slice(0,19)+".csv";document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(u);
  });

  await load();
});