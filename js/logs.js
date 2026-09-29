document.addEventListener("DOMContentLoaded", async ()=>{
  const {$,esc,live,nav}=SRGF;
  await SRGFAuth.init();
  nav("logs");

  const access=$("logsAccess"), card=$("logsCard"), body=$("logsBody");
  const actionFilter=$("logsActionFilter"), userFilter=$("logsUserFilter");
  if(!SRGFAuth.canViewLogs()){
    access?.classList.remove("hidden");
    if(card)card.classList.add("hidden");
    return;
  }

  function formatTime(v){
    const d=new Date(v);
    if(Number.isNaN(d.getTime()))return esc(v||"");
    return esc(d.toLocaleString("en-IN",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit",second:"2-digit"}));
  }

  let logs=[];
  function render(){
    const af=String(actionFilter?.value||"");
    const uf=String(userFilter?.value||"");
    const rows=logs.filter(x=>(!af||String(x.action||"")===af)&&(!uf||String(x.email||"")===uf));
    if(!rows.length){
      body.innerHTML='<tr><td colspan="7">No log entries found.</td></tr>';
      return;
    }
    body.innerHTML=rows.map(x=>`<tr>
      <td class="log-time">${formatTime(x.timestamp)}</td>
      <td>${esc(x.userName||x.user||x.email||"")}</td>
      <td>${esc(x.email||"")}</td>
      <td>${esc(x.role||"")}</td>
      <td><strong>${esc(x.action||"")}</strong></td>
      <td>${esc(x.target||"")}</td>
      <td class="log-details">${esc(x.details||"")}</td>
    </tr>`).join("");
  }

  function fillFilters(){
    const actions=[...new Set(logs.map(x=>String(x.action||"").trim()).filter(Boolean))].sort();
    const users=[...new Set(logs.map(x=>String(x.email||"").trim()).filter(Boolean))].sort();
    actionFilter.innerHTML='<option value="">All Actions</option>'+actions.map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join("");
    userFilter.innerHTML='<option value="">All Users</option>'+users.map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join("");
  }

  async function loadLogs(){
    if(!SRGFAuth.token()){
      $("logsMessage").textContent="Admin Google login is required.";
      return;
    }
    $("logsMessage").textContent="Loading logs…";
    try{
      const j=await live("logs",SRGFAuth.token());
      logs=Array.isArray(j.logs)?j.logs:[];
      fillFilters();
      render();
      $("logsMessage").textContent=logs.length+" log entr"+(logs.length===1?"y":"ies")+" loaded.";
    }catch(e){
      $("logsMessage").textContent="Could not load logs: "+(e.message||e);
      body.innerHTML='<tr><td colspan="7">Logs could not be loaded.</td></tr>';
    }
  }

  actionFilter?.addEventListener("change",render);
  userFilter?.addEventListener("change",render);
  $("logsRefreshBtn")?.addEventListener("click",loadLogs);
  $("refreshBtn")?.addEventListener("click",()=>location.reload());
  await loadLogs();
});