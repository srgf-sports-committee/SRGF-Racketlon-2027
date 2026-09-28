(() => {
  const C = window.SRGF_CONFIG;
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? "").replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const money = n => "₹" + Math.round(Number(n)||0).toLocaleString("en-IN");
  const norm = s => String(s??"").trim().toLowerCase().replace(/[^a-z0-9]+/g,"");
  const sleep = ms => new Promise(r=>setTimeout(r,ms));

  async function fetchTimeout(url, opts={}, ms=10000){
    const ctrl = new AbortController();
    const timer = setTimeout(()=>ctrl.abort(), ms);
    try {
      const r = await fetch(url, {...opts, signal:ctrl.signal, cache:"no-store"});
      return r;
    } catch(e) {
      if(e?.name==="AbortError") throw new Error("Live data timed out");
      throw e;
    } finally { clearTimeout(timer); }
  }

  async function jsonFile(name){
    const r = await fetch(`${C.JSON_BASE}${name}?t=${Date.now()}`, {cache:"no-store"});
    if(!r.ok) throw new Error(`Could not read ${name}`);
    return await r.json();
  }

  async function live(action="data", token=""){
    let url = `${C.API_URL}?action=${encodeURIComponent(action)}&t=${Date.now()}`;
    if(token) url += `&token=${encodeURIComponent(token)}`;
    const r = await fetchTimeout(url, {}, 9000);
    if(!r.ok) throw new Error(`Apps Script HTTP ${r.status}`);
    const j = await r.json();
    if(!j.ok) throw new Error(j.error || "Live data error");
    return j;
  }

  async function loadDataset(name, action){
    // Live is authoritative. A valid empty array is still a successful live result.
    try {
      const j = await live(action || name);
      return {data:j[name] ?? [], live:true};
    } catch(e) {
      try { return {data:(await jsonFile(`${name}.json`)).rows ?? (await jsonFile(`${name}.json`)), live:false}; }
      catch(_) { throw e; }
    }
  }

  function setStatus(text,error=false){
    const el=$("status");
    if(el){ el.textContent=text; el.className="status"+(error?" error":""); }
  }

  function nav(active){
    const items = [
      ["index.html","Home","home"],["fixtures.html","Fixtures","fixtures"],
      ["results.html","Results","results"],["teams.html","Teams","teams"],
      ["players.html","Players","players"],["auction.html","Auction","auction"]
    ];
    const n=document.querySelector(".page-nav");
    if(!n) return;
    n.innerHTML=items.map(([href,label,key])=>{
      if(key==="auction" && !window.SRGFAuth?.canAuction()) return "";
      return `<a href="${href}" class="${active===key?"active":""}">${label}</a>`;
    }).join("");
  }

  window.SRGF = {C,$,esc,money,norm,sleep,fetchTimeout,jsonFile,live,loadDataset,setStatus,nav};
})();