(() => {
  const C = window.SRGF_CONFIG;
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? "").replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const money = n => "₹" + Math.round(Number(n)||0).toLocaleString("en-IN");
  const norm = s => String(s??"").trim().toLowerCase().replace(/[^a-z0-9]+/g,"");
  const sleep = ms => new Promise(r=>setTimeout(r,ms));

  async function fetchTimeout(url, opts={}, ms=15000){
    const ctrl = new AbortController();
    const timer = setTimeout(()=>ctrl.abort(), ms);
    try {
      return await fetch(url, {...opts, signal:ctrl.signal, cache:"no-store"});
    } catch(e) {
      if(e?.name === "AbortError") throw new Error("Live data timed out");
      throw e;
    } finally { clearTimeout(timer); }
  }

  async function jsonFile(name){
    const sep = String(C.JSON_BASE).includes("?") ? "&" : "?";
    const r = await fetch(`${C.JSON_BASE}${name}${sep}t=${Date.now()}`, {cache:"no-store"});
    if(!r.ok) throw new Error(`Could not read ${name}`);
    return await r.json();
  }

  async function live(action="data", token=""){
    let url = `${C.API_URL}?action=${encodeURIComponent(action)}&t=${Date.now()}`;
    if(token) url += `&token=${encodeURIComponent(token)}`;
    const r = await fetchTimeout(url, {}, 10000);
    if(!r.ok) throw new Error(`Apps Script HTTP ${r.status}`);
    const j = await r.json();
    if(!j.ok) throw new Error(j.error || "Live data error");
    return j;
  }

  // Public/report pages use the cloud-synced JSON snapshot directly.
  async function loadJsonDataset(name){
    const file = await jsonFile(`${name}.json`);
    return {data:file.rows ?? file, updatedAt:file.updatedAt || "", headers:file.headers || null, live:false};
  }

  // LIVE FIRST: try the Apps Script master data first. If it is slow,
  // unavailable, or returns an error, immediately fall back to the latest
  // successful GitHub JSON snapshot. A valid empty array is still treated
  // as live data and is never replaced by the cache.
  async function loadLiveFirstDataset(name, timeoutMs=10000){
    try{
      const oldTimeout = fetchTimeout;
      // The live() helper uses the shared timeout. Keep this call simple and
      // use the normal live endpoint; the Apps Script cache is only 5 seconds.
      const j = await live("data");
      const data = Array.isArray(j[name]) ? j[name] : [];
      return {data, updatedAt:j.updatedAt || new Date().toISOString(), headers:null, live:true, source:"Google Sheets"};
    }catch(e){
      const file = await jsonFile(`${name}.json`);
      return {data:file.rows ?? file, updatedAt:file.updatedAt || "", headers:file.headers || null, live:false, source:"GitHub JSON", liveError:e};
    }
  }

  // Same live-first behavior, but returns the complete combined payload.
  // This lets Home/other pages make only ONE Apps Script request per refresh.
  async function loadLiveFirstAll(){
    try{
      const j = await live("data");
      return {data:j, updatedAt:j.updatedAt || new Date().toISOString(), live:true, source:"Google Sheets"};
    }catch(e){
      return {data:null, updatedAt:"", live:false, source:"GitHub JSON", liveError:e};
    }
  }

  // Compatibility helper. New public pages should use loadLiveFirstDataset().
  async function loadDataset(name, action){
    return loadLiveFirstDataset(name);
  }

  function setStatus(text,error=false){
    const el=$("status");
    if(el){ el.textContent=text; el.className="status"+(error?" error":""); }
  }

  function nav(active){
    const items = [
      ["registration.html","Registration Form","registration"],
      ["players.html","Players","players"],
      ["teams.html","Teams","teams"],
      ["fixtures.html","Fixtures","fixtures"],
      ["results.html","Results","results"],
      ["important-links.html","Important Links","importantLinks"],
      ["auction.html","Auction","auction"]
    ];
    const n=document.querySelector(".page-nav");
    if(!n) return;
    n.innerHTML=items.map(([href,label,key])=>{
      if(key==="auction" && !window.SRGFAuth?.canAuction()) return "";
      return `<a href="${href}" class="${active===key?"active":""}">${label}</a>`;
    }).join("");
  }

  document.addEventListener("DOMContentLoaded",()=>{
    const brand=document.querySelector(".brand-wrap");
    if(brand){
      brand.style.cursor="pointer";
      brand.addEventListener("click",(e)=>{
        if(e.target.closest("a")) return;
        window.location.href="index.html";
      });
    }
  });

  window.SRGF = {
    C,$,esc,money,norm,sleep,fetchTimeout,jsonFile,live,
    loadJsonDataset,loadLiveFirstDataset,loadLiveFirstAll,loadDataset,setStatus,nav
  };
})();
