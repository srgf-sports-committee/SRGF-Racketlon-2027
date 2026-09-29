(() => {
  const C = window.SRGF_CONFIG;
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? "").replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const money = n => "₹" + Math.round(Number(n)||0).toLocaleString("en-IN");
  const norm = s => String(s??"").trim().toLowerCase().replace(/[^a-z0-9]+/g,"");
  const sleep = ms => new Promise(r=>setTimeout(r,ms));

  // Browser-side last-known-good cache. This cache is deliberately separate
  // from the GitHub JSON copy so a newer successful live read can never be
  // replaced by an older GitHub snapshot after a later live failure.
  const BROWSER_CACHE_PREFIX = "SRGF_RACKETLON_2027_LKG_V2_";

  function safeJsonParse_(value){
    try{return value ? JSON.parse(value) : null;}catch(_){return null;}
  }

  function sourceTime_(obj){
    const t = Date.parse(obj?.sourceUpdatedAt || obj?.updatedAt || obj?.savedAt || "");
    return Number.isFinite(t) ? t : 0;
  }

  function cacheKey_(name){ return BROWSER_CACHE_PREFIX + String(name); }

  function readBrowserCache_(name){
    try{
      const item=safeJsonParse_(localStorage.getItem(cacheKey_(name)));
      if(!item || !Array.isArray(item.data)) return null;
      return item;
    }catch(_){return null;}
  }

  function writeBrowserCache_(name,data,sourceUpdatedAt){
    if(!Array.isArray(data)) return;
    const item={
      version:2,
      name,
      sourceUpdatedAt:sourceUpdatedAt || new Date().toISOString(),
      savedAt:new Date().toISOString(),
      data
    };
    try{
      localStorage.setItem(cacheKey_(name),JSON.stringify(item));
    }catch(_){
      // If browser storage is full, keep the normal JSON fallback working.
      try{localStorage.removeItem(cacheKey_(name));}catch(__){}
    }
  }

  function cacheLiveResponse_(j,action){
    if(!j || typeof j!=="object") return;
    const stamp=j.sourceUpdatedAt || j.updatedAt || new Date().toISOString();
    const names=["players","teams","auction","fixtures","results","config"];
    names.forEach(name=>{
      if(Array.isArray(j[name])) writeBrowserCache_(name,j[name],stamp);
    });
    // Page-specific responses only contain one dataset, so the loop above
    // already handles them. The action is kept here for clarity/future use.
    void action;
  }

  async function fetchTimeout(url, opts={}, ms=15000){
    const ctrl = new AbortController();
    const timer = setTimeout(()=>ctrl.abort(),ms);
    try{
      return await fetch(url,{...opts,signal:ctrl.signal,cache:"no-store"});
    }catch(e){
      if(e?.name === "AbortError") throw new Error("Live data timed out");
      throw e;
    }finally{clearTimeout(timer);}
  }

  async function jsonFile(name){
    const sep=String(C.JSON_BASE).includes("?") ? "&" : "?";
    const r=await fetch(`${C.JSON_BASE}${name}${sep}t=${Date.now()}`,{cache:"no-store"});
    if(!r.ok) throw new Error(`Could not read ${name}`);
    return await r.json();
  }

  async function live(action="data",token=""){
    let url=`${C.API_URL}?action=${encodeURIComponent(action)}&t=${Date.now()}`;
    if(token) url += `&token=${encodeURIComponent(token)}`;
    const r=await fetchTimeout(url,{},15000);
    if(!r.ok) throw new Error(`Apps Script HTTP ${r.status}`);
    const j=await r.json();
    if(!j.ok) throw new Error(j.error || "Live data error");

    // Save immediately. If this request is followed by an Apps Script
    // failure, the next page load will use this copy instead of older JSON.
    cacheLiveResponse_(j,action);
    return j;
  }

  async function loadJsonDataset(name){
    // Read both sources and choose the newest valid copy. This is the core
    // anti-regression rule: an older JSON snapshot can never replace newer
    // data already observed successfully by this browser.
    const [jsonResult,cache] = await Promise.allSettled([
      jsonFile(`${name}.json`),
      Promise.resolve(readBrowserCache_(name))
    ]);

    const json = jsonResult.status === "fulfilled" ? jsonResult.value : null;
    const jsonRows = json ? (json.rows ?? json) : null;
    const jsonCandidate = Array.isArray(jsonRows) ? {
      data:jsonRows,
      sourceUpdatedAt:json.sourceUpdatedAt || json.updatedAt || "",
      savedAt:json.syncedAt || json.updatedAt || "",
      source:"GitHub JSON",
      headers:json.headers || null
    } : null;

    const cacheCandidate = cache.status === "fulfilled" ? cache.value : null;
    const candidates=[jsonCandidate,cacheCandidate].filter(Boolean);
    if(!candidates.length) throw new Error(`Could not read ${name}`);

    candidates.sort((a,b)=>sourceTime_(b)-sourceTime_(a));
    const best=candidates[0];

    return {
      data:best.data || [],
      updatedAt:best.sourceUpdatedAt || best.savedAt || "",
      sourceUpdatedAt:best.sourceUpdatedAt || best.savedAt || "",
      headers:best.headers || (jsonCandidate?.headers || null),
      live:best.source === "Browser live cache",
      source:best.source || "Browser live cache"
    };
  }

  async function loadJsonFirstDataset(name){
    try{return await loadJsonDataset(name);}catch(_){return null;}
  }

  async function loadJsonFirstAll(names){
    const out={}; let ok=false;
    await Promise.all(names.map(async name=>{
      try{out[name]=await loadJsonDataset(name);ok=true;}catch(_){}
    }));
    return {data:out,hasJson:ok};
  }

  function loadDataset(name,action){ return loadJsonDataset(name); }

  function ensureFreshnessElement(){
    if($("dataFreshness")) return $("dataFreshness");
    const host=document.querySelector(".header-actions");
    if(!host) return null;
    const el=document.createElement("div");
    el.id="dataFreshness";
    el.className="data-freshness";
    el.title="Last successful GitHub JSON update";
    host.insertBefore(el,host.firstElementChild||null);
    return el;
  }

  function formatAge(seconds){
    if(seconds<60) return `${Math.floor(seconds)} sec ago`;
    const mins=Math.floor(seconds/60);
    if(mins<60) return `${mins} min ago`;
    const hrs=Math.floor(mins/60),rem=mins%60;
    return rem ? `${hrs} hr ${rem} min ago` : `${hrs} hr ago`;
  }

  async function loadJsonFreshness(){
    const el=ensureFreshnessElement();
    if(!el) return null;
    try{
      const marker=await jsonFile("last-update.json");
      const t=Date.parse(marker.sourceUpdatedAt || marker.syncedAt || "");
      if(!marker.success || !Number.isFinite(t)) throw new Error("Invalid update marker");
      const age=Math.max(0,(Date.now()-t)/1000);
      const exact=new Date(t).toLocaleString("en-IN",{
        timeZone:"Asia/Kolkata",day:"2-digit",month:"short",year:"numeric",
        hour:"2-digit",minute:"2-digit",second:"2-digit",hour12:true
      });
      const staleMs=C.STALE_WARN_MS || 5*60*1000;
      const errorMs=C.STALE_ERROR_MS || 10*60*1000;
      const level=age*1000>=errorMs?"error":age*1000>=staleMs?"warn":"ok";
      el.className=`data-freshness ${level}`;
      el.textContent=`${level==="error"?"🔴":level==="warn"?"🟠":"🟢"} Data source ${formatAge(age)}`;
      el.title=`Latest Google Sheet content represented in GitHub JSON: ${exact} IST`;
      return marker;
    }catch(e){
      el.className="data-freshness error";
      el.textContent="🔴 JSON update unavailable";
      el.title="Could not read data/last-update.json.";
      return null;
    }
  }

  function startFreshnessMonitor(){
    ensureFreshnessElement();
    loadJsonFreshness();
    setInterval(()=>{if(!document.hidden)loadJsonFreshness();},30000);
  }

  function setStatus(text,error=false){
    const el=$("status");
    if(el){el.textContent=text;el.className="status"+(error?" error":"");}
  }

  function nav(active){
    const items=[
      ["registration.html","Registration Form","registration"],
      ["players.html","Players","players"],
      ["teams.html","Teams","teams"],
      ["fixtures.html","Fixtures","fixtures"],
      ["results.html","Results","results"],
      ["important-links.html","Important Links","importantLinks"],
      ["auction.html","Auction","auction"]
    ];
    const n=document.querySelector(".page-nav");
    if(!n)return;
    n.innerHTML=items.map(([href,label,key])=>{
      if(key==="auction"&&!window.SRGFAuth?.canAuction())return "";
      return `<a href="${href}" class="${active===key?"active":""}">${label}</a>`;
    }).join("");
  }

  document.addEventListener("DOMContentLoaded",()=>{
    startFreshnessMonitor();
    const brand=document.querySelector(".brand-wrap");
    if(brand){
      brand.style.cursor="pointer";
      brand.addEventListener("click",e=>{
        if(e.target.closest("a"))return;
        window.location.href="index.html";
      });
    }
  });

  window.SRGF={
    C,$,esc,money,norm,sleep,fetchTimeout,jsonFile,live,
    loadJsonDataset,loadJsonFirstDataset,loadJsonFirstAll,loadDataset,
    setStatus,loadJsonFreshness,startFreshnessMonitor,nav
  };
})();
