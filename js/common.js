(() => {
  const C = window.SRGF_CONFIG || {};
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? "").replace(/[&<>\"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[m]));
  const money = n => "₹" + Math.round(Number(n)||0).toLocaleString("en-IN");
  const norm = s => String(s??"").trim().toLowerCase().replace(/[^a-z0-9]+/g,"");
  const sleep = ms => new Promise(r=>setTimeout(r,ms));

  // One browser cache shared by every public page. It stores the COMPLETE
  // successful Apps Script response, not individual page data.
  const CACHE_KEY = "SRGF_RACKETLON_2027_LATEST_GOOD_DATA_V4";
  const LEGACY_CACHE_KEYS = ["SRGF_RACKETLON_2027_LATEST_GOOD_DATA_V3"];
  const RETRY_MS = 15000;

  function removeFreshness(){
    document.querySelectorAll("#dataFreshness,.data-freshness").forEach(el=>el.remove());
  }

  function timestampMs(v){
    const t=Date.parse(String(v||""));
    return Number.isFinite(t) ? t : 0;
  }

  function readBrowserData(){
    try{
      const keys=[CACHE_KEY,...LEGACY_CACHE_KEYS];
      for(const key of keys){
        const raw=localStorage.getItem(key);
        if(!raw)continue;
        const c=JSON.parse(raw);
        if(!c || !c.data || typeof c.data!=="object")continue;
        // Migrate the last known-good older cache key to the current key.
        if(key!==CACHE_KEY){
          try{localStorage.setItem(CACHE_KEY,JSON.stringify(c));}catch(_){}
        }
        return c;
      }
      return null;
    }catch(_){return null;}
  }

  // Never replace a newer cached Sheet snapshot with an older/unknown one.
  // If the source does not send updatedAt, keep the existing timestamped cache.
  function saveBrowserData(data,updatedAt){
    try{
      const incoming=String(updatedAt||"");
      const current=readBrowserData();
      if(current){
        const oldMs=timestampMs(current.updatedAt);
        const newMs=timestampMs(incoming);
        if(oldMs && !newMs)return false;
        if(oldMs && newMs && newMs < oldMs)return false;
      }
      localStorage.setItem(CACHE_KEY,JSON.stringify({
        savedAt:new Date().toISOString(),
        updatedAt:incoming,
        data
      }));
      return true;
    }catch(_){return false;}
  }

  async function fetchTimeout(url,opts={},ms=15000){
    const ctrl=new AbortController();
    const timer=setTimeout(()=>ctrl.abort(),ms);
    try{
      return await fetch(url,{...opts,signal:ctrl.signal,cache:"no-store"});
    }catch(e){
      if(e?.name==="AbortError")throw new Error("Live data timed out");
      throw e;
    }finally{clearTimeout(timer);}
  }

  async function jsonFile(name){
    const base=String(C.JSON_BASE||"./data/");
    const sep=base.includes("?")?"&":"?";
    const r=await fetch(`${base}${name}.json${sep}t=${Date.now()}`,{cache:"no-store"});
    if(!r.ok)throw new Error(`Could not read ${name}.json`);
    return await r.json();
  }

  async function live(action="data",token=""){
    let url=`${C.API_URL}?action=${encodeURIComponent(action)}&t=${Date.now()}`;
    if(token)url+=`&token=${encodeURIComponent(token)}`;
    const r=await fetchTimeout(url,{},10000);
    if(!r.ok)throw new Error(`Apps Script HTTP ${r.status}`);
    const j=await r.json();
    if(!j.ok)throw new Error(j.error||"Live data error");
    return j;
  }

  async function loadJsonDataset(name){
    const file=await jsonFile(name);
    return {
      data:file.rows ?? file,
      updatedAt:file.updatedAt||"",
      headers:file.headers||null,
      live:false,
      source:"GitHub JSON"
    };
  }

  async function fetchLiveAllOnce(){
    const j=await live("data");
    const updatedAt=String(j.updatedAt||"");
    // Only a successful, valid Apps Script response reaches here.
    // saveBrowserData itself prevents an older response from replacing newer cache.
    saveBrowserData(j,updatedAt);
    window.dispatchEvent(new CustomEvent("srgf-live-success",{
      detail:{data:j,updatedAt}
    }));
    return {data:j,updatedAt,live:true,source:"Google Sheets"};
  }

  function startRetryUntilSuccess(){
    let stopped=false;
    let resolveRetry, rejectRetry;
    const promise=new Promise((resolve,reject)=>{
      resolveRetry=resolve;
      rejectRetry=reject;
    });

    // IMPORTANT: let the page render the browser cache first.
    // Google Sheets starts only after the current call stack has returned.
    const run=async()=>{
      while(!stopped){
        try{
          const result=await fetchLiveAllOnce();
          resolveRetry(result);
          return;
        }catch(_){
          await sleep(RETRY_MS);
        }
      }
      rejectRetry(new Error("Retry stopped"));
    };

    setTimeout(run,0);
    return {promise,stop:()=>{stopped=true;}};
  }

  async function loadLiveFirstAll(){
    removeFreshness();

    // Cache-first: immediately show the last known-good Sheet snapshot.
    // Then keep trying Google Sheets in the background every 15 seconds.
    const cached=readBrowserData();
    if(cached){
      const retry=startRetryUntilSuccess();
      return {
        data:cached.data,
        updatedAt:cached.updatedAt||"",
        live:false,
        source:"Browser cache",
        fromBrowserCache:true,
        retryPromise:retry.promise
      };
    }

    // First ever visit: try live immediately.
    try{return await fetchLiveAllOnce();}
    catch(liveError){
      // Only when there is no browser cache AND live failed, use GitHub JSON.
      const names=["players","teams","auction","fixtures","results","config"];
      const out={};
      await Promise.all(names.map(async name=>{
        try{out[name]=(await loadJsonDataset(name)).data;}catch(_){ }
      }));
      const hasAny=Object.keys(out).length>0;
      const retry=startRetryUntilSuccess();
      return {
        data:out,
        updatedAt:"",
        live:false,
        source:"GitHub JSON",
        liveError,
        hasJson:hasAny,
        retryPromise:retry.promise
      };
    }
  }

  async function loadLiveFirstDataset(name){
    const all=await loadLiveFirstAll();
    const data=Array.isArray(all.data?.[name])?all.data[name]:[];
    return {...all,data};
  }

  async function loadDataset(name){return loadLiveFirstDataset(name);}

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
      ["auction.html","Auction","auction"],
      ["logs.html","Logs","logs"]
    ];
    const n=document.querySelector(".page-nav");
    if(!n)return;
    n.innerHTML=items.map(([href,label,key])=>{
      if(key==="auction"&&!window.SRGFAuth?.canAuction())return "";
      if(key==="logs"&&!window.SRGFAuth?.canViewLogs())return "";
      return `<a href="${href}" class="${active===key?"active":""}">${label}</a>`;
    }).join("");
  }

  document.addEventListener("DOMContentLoaded",()=>{
    removeFreshness();
    startPageAutoRefresh();
    const brand=document.querySelector(".brand-wrap");
    if(brand){
      brand.style.cursor="pointer";
      brand.addEventListener("click",e=>{
        if(e.target.closest("a"))return;
        window.location.href="index.html";
      });
    }
  });

  function startPageAutoRefresh(){
    const path=String(location.pathname||"").toLowerCase();

    // Auto-refresh ONLY these three public pages.
    const allowed =
      /(?:^|\/)players\.html$/.test(path) ||
      /(?:^|\/)results\.html$/.test(path) ||
      /(?:^|\/)teams\.html$/.test(path);

    if(!allowed)return;

    setInterval(()=>{
      // Do not interrupt an active edit/modal interaction.
      if(document.querySelector(".modal:not(.hidden), input:focus, textarea:focus, select:focus"))return;
      location.reload();
    },RETRY_MS);
  }

  window.SRGF={
    C,$,esc,money,norm,sleep,fetchTimeout,jsonFile,live,
    loadJsonDataset,loadLiveFirstDataset,loadLiveFirstAll,loadDataset,
    setStatus,removeFreshness,nav,startPageAutoRefresh
  };
})();
