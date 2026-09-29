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
    return {data:file.rows ?? file, updatedAt:file.updatedAt || "", headers:file.headers || null, live:false, source:"GitHub JSON"};
  }

  const BROWSER_CACHE_KEY = "SRGF_RACKETLON_2027_LATEST_GOOD_DATA_V2";
  function readBrowserData(){
    try{
      const x=JSON.parse(localStorage.getItem(BROWSER_CACHE_KEY)||"null");
      return x && x.data ? x : null;
    }catch(_){ return null; }
  }
  function saveBrowserData(data, updatedAt){
    try{
      localStorage.setItem(BROWSER_CACHE_KEY, JSON.stringify({savedAt:new Date().toISOString(),updatedAt:updatedAt||new Date().toISOString(),data}));
    }catch(_){ }
  }

  async function fetchLiveAllOnce(){
    const j=await live("data");
    saveBrowserData(j,j.updatedAt||new Date().toISOString());
    return {data:j,updatedAt:j.updatedAt||new Date().toISOString(),live:true,source:"Google Sheets"};
  }

  // Retry only while the current page's initial live refresh is failing.
  // Once a live request succeeds, the retry loop stops. There is deliberately
  // no periodic refresh after success; another refresh happens only when the
  // user refreshes/navigates to the page again.
  function retryUntilLiveSucceeds_(onSuccess){
    let stopped=false;
    const retry=async()=>{
      while(!stopped){
        try{
          const result=await fetchLiveAllOnce();
          stopped=true;
          if(onSuccess) await onSuccess(result);
          return result;
        }catch(_){
          await sleep(15000);
        }
      }
    };
    const promise=retry();
    return {promise,stop:()=>{stopped=true;}};
  }

  // Cache-first: return the browser's newest known-good copy immediately.
  // A background retry then keeps trying Google Sheets until it succeeds.
  async function loadLiveFirstAll(){
    const cached=readBrowserData();
    if(cached){
      const retry=retryUntilLiveSucceeds_();
      return {data:cached.data,updatedAt:cached.updatedAt||"",live:false,source:"Browser cache",fromBrowserCache:true,retryPromise:retry.promise};
    }
    try{
      return await fetchLiveAllOnce();
    }catch(e){
      return {data:null,updatedAt:"",live:false,source:"GitHub JSON",liveError:e,retryPromise:retryUntilLiveSucceeds_().promise};
    }
  }

  async function loadLiveFirstDataset(name, timeoutMs=10000){
    const cached=readBrowserData();
    if(cached && cached.data && Array.isArray(cached.data[name])){
      const retry=retryUntilLiveSucceeds_();
      return {data:cached.data[name],updatedAt:cached.updatedAt||"",live:false,source:"Browser cache",fromBrowserCache:true,retryPromise:retry.promise};
    }
    try{
      const j=await fetchLiveAllOnce();
      return {data:Array.isArray(j.data[name])?j.data[name]:[],updatedAt:j.updatedAt,live:true,source:"Google Sheets"};
    }catch(e){
      const file=await jsonFile(`${name}.json`);
      const retry=retryUntilLiveSucceeds_();
      return {data:file.rows??file,updatedAt:file.updatedAt||"",headers:file.headers||null,live:false,source:"GitHub JSON",liveError:e,retryPromise:retry.promise};
    }
  }

  async function loadDataset(name, action){
    return loadLiveFirstDataset(name);
  }

  function showLiveFreshness(updatedAt){
    const el=ensureFreshnessElement();
    if(!el) return;
    const t=Date.parse(updatedAt || "");
    el.className="data-freshness ok";
    el.textContent="🟢 LIVE · Google Sheet";
    el.title=Number.isFinite(t) ? `Live data read from Google Sheets: ${new Date(t).toLocaleString("en-IN",{timeZone:"Asia/Kolkata"})} IST` : "Live data read from Google Sheets";
  }

  function ensureFreshnessElement(){
    if($( "dataFreshness" )) return $( "dataFreshness" );
    const host=document.querySelector(".header-actions");
    if(!host) return null;
    const el=document.createElement("div");
    el.id="dataFreshness";
    el.className="data-freshness";
    el.title="Last successful JSON update";
    host.insertBefore(el, host.firstElementChild || null);
    return el;
  }

  function formatAge(seconds){
    if(seconds < 60) return `${Math.floor(seconds)} sec ago`;
    const mins=Math.floor(seconds/60);
    if(mins < 60) return `${mins} min ago`;
    const hrs=Math.floor(mins/60), rem=mins%60;
    return rem ? `${hrs} hr ${rem} min ago` : `${hrs} hr ago`;
  }

  async function loadJsonFreshness(){
    const el=ensureFreshnessElement();
    if(!el) return null;
    try{
      const marker=await jsonFile("last-update.json");
      const t=Date.parse(marker.syncedAt || "");
      if(!marker.success || !Number.isFinite(t)) throw new Error("Invalid update marker");
      const age=Math.max(0,(Date.now()-t)/1000);
      const exact=new Date(t).toLocaleString("en-IN",{
        timeZone:"Asia/Kolkata", day:"2-digit", month:"short", year:"numeric",
        hour:"2-digit", minute:"2-digit", second:"2-digit", hour12:true
      });
      const staleMs=C.STALE_WARN_MS || 5*60*1000;
      const errorMs=C.STALE_ERROR_MS || 10*60*1000;
      const level=age*1000 >= errorMs ? "error" : age*1000 >= staleMs ? "warn" : "ok";
      el.className=`data-freshness ${level}`;
      el.textContent=`${level==="error"?"🔴":level==="warn"?"🟠":"🟢"} Data updated ${formatAge(age)}`;
      el.title=`Last successful JSON update: ${exact} IST`;
      return marker;
    }catch(e){
      el.className="data-freshness error";
      el.textContent="🔴 JSON update unavailable";
      el.title="Could not read a successful data/last-update.json marker.";
      return null;
    }
  }

  // Keep the freshness display current even if the page data itself is not
  // being refreshed at this exact moment.
  function startFreshnessMonitor(){
    ensureFreshnessElement();
    loadJsonFreshness();
    setInterval(()=>{ if(!document.hidden) loadJsonFreshness(); }, 30000);
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
    startFreshnessMonitor();
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
    loadJsonDataset,loadLiveFirstDataset,loadLiveFirstAll,loadDataset,showLiveFreshness,setStatus,loadJsonFreshness,startFreshnessMonitor,nav
  };
})();
