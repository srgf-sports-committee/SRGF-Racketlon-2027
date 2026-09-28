document.addEventListener("DOMContentLoaded", async ()=>{
  const {live,loadJsonDataset,$,esc,norm,setStatus,loadJsonFreshness,nav}=SRGF; SRGFAuth.init(); nav("fixtures");
  let headers=[], rows=[], filtered=[];
  const roleCanEdit=()=>SRGFAuth.canEditFixtures();

  function idx(names){for(const n of names){const i=headers.findIndex(h=>norm(h)===norm(n));if(i>=0)return i;}return -1;}
  function val(r,names){const i=idx(names);return i<0?"":String(r[i]??"").trim();}
  function gameIdx(){const a=[];headers.forEach((h,i)=>{const m=norm(h).match(/^game([1-4])/);if(m)a[+m[1]-1]=i});return a;}
  function done(r){return gameIdx().some(i=>i!==undefined&&String(r[i]??"").trim()!=="");}
  function formatSchedule(v){
    const d=new Date(v); if(!Number.isNaN(d.getTime())) return new Intl.DateTimeFormat("en-IN",{timeZone:"Asia/Kolkata",day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit",hour12:true}).format(d);
    return String(v||"").replace("T"," · ");
  }
  function filters(){
    const sport=idx(["Sport"]), teams=[...new Set(rows.map(r=>val(r,["Team","Team 1","Team1","Team A","Team B"])).filter(Boolean))];
    const sports=sport<0?[]:[...new Set(rows.map(r=>String(r[sport]??"").trim()).filter(Boolean))].sort();
    const oldS=$("fixtureSportFilter").value;
    $("fixtureSportFilter").innerHTML='<option value="">All Sports</option>'+sports.map(x=>`<option>${esc(x)}</option>`).join("");
    if(sports.includes(oldS))$("fixtureSportFilter").value=oldS;
    const names=[];
    const pi=[idx(["Player 1","Player1"]),idx(["Player 2","Player2"])].filter(x=>x>=0);
    pi.forEach(i=>rows.forEach(r=>{const n=String(r[i]??"").trim();if(n&&!names.includes(n))names.push(n)}));
    const oldP=$("fixturePlayerFilter").value;
    $("fixturePlayerFilter").innerHTML='<option value="">All Players</option>'+names.sort().map(x=>`<option>${esc(x)}</option>`).join("");
    if(names.includes(oldP))$("fixturePlayerFilter").value=oldP;
  }
  function render(){
    filters();
    const status=$("fixtureStatusFilter").value,sport=$("fixtureSportFilter").value.toLowerCase(),player=$("fixturePlayerFilter").value.toLowerCase();
    filtered=rows.map((r,i)=>({r,i})).filter(x=>{
      if(status==="completed"&&!done(x.r))return false;if(status==="pending"&&done(x.r))return false;
      if(sport&&val(x.r,["Sport"]).toLowerCase()!==sport)return false;
      if(player){
        const p1=val(x.r,["Player 1","Player1"]).toLowerCase(),p2=val(x.r,["Player 2","Player2"]).toLowerCase();
        if(p1!==player&&p2!==player)return false;
      } return true;
    });
    $("fixtureCompletedCount").textContent=rows.filter(done).length;
    $("fixturePendingCount").textContent=rows.length-rows.filter(done).length;
    $("fixturesHead").innerHTML=headers.length?`<tr>${headers.map(h=>`<th>${esc(h)}</th>`).join("")}${roleCanEdit()?"<th>Action</th>":""}</tr>`:"";
    $("fixturesBody").innerHTML=filtered.length?filtered.map(x=>{
      const cells=x.r.map((v,i)=>{
        let out=String(v??""); if(norm(headers[i])==="schedule")out=formatSchedule(out);
        return `<td>${esc(out)}</td>`;
      }).join("");
      return `<tr>${cells}${roleCanEdit()?`<td><button class="secondary edit-result" data-i="${x.i}">${done(x.r)?"Edit Result":"Enter Result"}</button></td>`:""}</tr>`;
    }).join(""):`<tr><td colspan="${headers.length+(roleCanEdit()?1:0)||1}">No fixtures found.</td></tr>`;
    $("fixtureMessage").textContent=`Showing ${filtered.length} of ${rows.length} fixture(s).`;
    document.querySelectorAll(".edit-result").forEach(b=>b.onclick=()=>openModal(+b.dataset.i));
  }
  function openModal(i){
    const r=rows[i], gi=gameIdx(), p1=val(r,["Player 1","Player1"])||"Player 1",p2=val(r,["Player 2","Player2"])||"Player 2";
    const modal=document.getElementById("resultModal"); if(!modal)return;
    modal.querySelector(".modal-title").textContent=`${p1} vs ${p2}`;
    const games=modal.querySelector(".games"); games.innerHTML=[1,2,3,4].map(g=>{
      const raw=gi[g-1]===undefined?"":String(r[gi[g-1]]||""); const m=raw.match(/(\d+)\s*[-:]\s*(\d+)/);
      return `<div class="game"><h3>Game ${g}</h3><div class="labels"><label>${esc(p1)}<input class="g1" data-g="${g}" type="number" min="0" value="${m?m[1]:""}"></label><label>${esc(p2)}<input class="g2" data-g="${g}" type="number" min="0" value="${m?m[2]:""}"></label></div></div>`;
    }).join("");
    modal.classList.remove("hidden");
    modal.querySelector("#saveFixtureBtn").onclick=async()=>{
      const scores=[];for(let g=1;g<=4;g++){const a=modal.querySelector(`.g1[data-g="${g}"]`).value,b=modal.querySelector(`.g2[data-g="${g}"]`).value;if((a==="")!==(b==="")){alert(`Enter both scores for Game ${g}.`);return}if(a!==""&&b!=="")scores.push({game:g,player1:Number(a),player2:Number(b)});}
      if(!scores.length){alert("Enter at least one game result.");return}
      try{
        const body=new URLSearchParams({action:"saveFixtureResult",sheet:"FIXTURES",rowNumber:String(i+2),scores:JSON.stringify(scores),token:SRGFAuth.token()});
        const res=await SRGF.fetchTimeout(SRGF_CONFIG.API_URL,{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded;charset=UTF-8"},body},20000);
        const j=await res.json();if(!j.ok)throw new Error(j.error||"Save failed");
        modal.classList.add("hidden");await load();
      }catch(e){alert(e.message||e);}
    };
    modal.querySelector("#closeResultBtn").onclick=()=>modal.classList.add("hidden");
  }
  async function load(){
    try{
      if(roleCanEdit()){
        const d=await live("fixtures");
        const f=d.fixtures||[];
        if(!f.length){headers=[];rows=[];}
        else{headers=Object.keys(f[0]);rows=f.map(o=>headers.map(h=>o[h]??""));}
        render();
        setStatus("LIVE editor data");
      }else{
        const d=await loadJsonDataset("fixtures");
        const f=d.data||[];
        headers=d.headers||Object.keys(f[0]||{});
        rows=f.map(x=>Array.isArray(x)?x:headers.map(h=>x[h]??""));
        render();
        await loadJsonFreshness();
        setStatus("JSON data");
      }
    }catch(e){
      try{
        const d=await loadJsonDataset("fixtures");
        const f=d.data||[];
        headers=d.headers||Object.keys(f[0]||{});
        rows=f.map(x=>Array.isArray(x)?x:headers.map(h=>x[h]??""));
        render();
        await loadJsonFreshness();
        setStatus("JSON data · live unavailable",true);
      }catch(_){setStatus("No fixture data available",true)}
    }
  }

  ["fixtureStatusFilter","fixtureSportFilter","fixturePlayerFilter"].forEach(id=>$(id)?.addEventListener("change",render));
  $("refreshBtn")?.addEventListener("click",load); await load(); setInterval(()=>{if(!document.hidden)load()},30000);
});