document.addEventListener("DOMContentLoaded",async()=>{
  const {$,esc,setStatus,nav,live}=SRGF;
  const message=$("captainAccessMessage");
  const card=$("captainTableCard");
  const body=$("captainPlayersBody");
  const teamFilter=$("captainTeamFilter");
  const playerTrigger=$("captainPlayerTrigger");
  const playerSelected=$("captainPlayerSelected");
  const playerDropdown=$("captainPlayerDropdown");
  const playerSearch=$("captainPlayerSearch");
  const playerOptions=$("captainPlayerOptions");
  const filterCount=$("captainFilterCount");
  let loading=false,loaded=false,players=[],selectedPlayer="";

  function canView(){return SRGFAuth.canViewCaptains();}
  function showDenied(){
    card.classList.add("hidden");
    message.classList.remove("hidden");
    message.innerHTML='Please sign in with an account assigned the <strong>CAPTAIN</strong> or <strong>ADMIN</strong> role.';
    setStatus("Captain/Admin login required",true);
  }
  function renderFilteredRows(){
    const team=teamFilter.value;
    const filtered=players.filter(p=>{
      const teamName=String(p.teamName||"").trim();
      const playerName=String(p.playerName||"").trim();
      return (!team||teamName===team)&&(!selectedPlayer||playerName===selectedPlayer);
    });
    body.innerHTML=filtered.length?filtered.map(p=>'<tr><td>'+esc(p.teamName||"")+'</td><td>'+esc(p.playerName||"")+'</td><td>'+esc(p.mobile||"")+'</td></tr>').join(""):'<tr><td colspan="3">No players match the selected filters.</td></tr>';
    filterCount.textContent='Showing '+filtered.length+' of '+players.length+' players';
  }
  function exportDirectoryCsv(){
    const team=teamFilter.value;
    const filtered=players.filter(p=>{
      const teamName=String(p.teamName||"").trim();
      const playerName=String(p.playerName||"").trim();
      return (!team||teamName===team)&&(!selectedPlayer||playerName===selectedPlayer);
    });
    const rows=[
      ["Team Name","Player Name","Mobile (Transaction Code)"],
      ...filtered.map(p=>[p.teamName||"",p.playerName||"",p.mobile||""])
    ];
    const csv=rows.map(row=>row.map(value=>'"'+String(value??"").replace(/"/g,'""')+'"').join(",")).join("\r\n");
    const blob=new Blob(["\\uFEFF",csv],{type:"text/csv;charset=utf-8;"});
    const url=URL.createObjectURL(blob);
    const link=document.createElement("a");
    link.href=url;
    link.download="SRGF_Captain_Directory.csv";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }
  function populateTeamFilter(){
    const selected=teamFilter.value;
    const teams=[...new Set(players.map(p=>String(p.teamName||"").trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
    teamFilter.innerHTML='<option value="">All Teams</option>'+teams.map(team=>'<option value="'+esc(team)+'">'+esc(team)+'</option>').join("");
    if(teams.includes(selected))teamFilter.value=selected;
  }
  function renderPlayerOptions(){
    const query=playerSearch.value.trim().toLocaleLowerCase();
    const names=[...new Set(players.map(p=>String(p.playerName||"").trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
    const filtered=names.filter(name=>name.toLocaleLowerCase().includes(query));
    const options=[{name:"All Players",value:""},...filtered.map(name=>({name,value:name}))];
    playerOptions.innerHTML=options.length?options.map(option=>'<button type="button" role="option" aria-selected="'+(selectedPlayer===option.value)+'" class="captain-player-option'+(selectedPlayer===option.value?' active':'')+'" data-player="'+esc(option.value)+'">'+esc(option.name)+'</button>').join(""):'<div class="captain-player-no-match">No matching players</div>';
  }
  function closePlayerDropdown(){playerDropdown.classList.add("hidden");playerTrigger.setAttribute("aria-expanded","false");}
  function openPlayerDropdown(){
    playerDropdown.classList.remove("hidden");
    playerTrigger.setAttribute("aria-expanded","true");
    playerSearch.value="";
    renderPlayerOptions();
    playerSearch.focus();
  }
  async function loadDirectory(){
    if(loading)return;
    if(!canView()){showDenied();return;}
    loading=true;
    message.classList.remove("hidden");
    message.textContent="Loading player contact details…";
    card.classList.add("hidden");
    try{
      const result=await live("captains",SRGFAuth.token());
      players=Array.isArray(result.rows)?result.rows:[];
      populateTeamFilter();
      renderPlayerOptions();
      renderFilteredRows();
      message.classList.add("hidden");
      card.classList.remove("hidden");
      setStatus("LIVE · Google Sheet");
      loaded=true;
    }catch(e){
      message.classList.remove("hidden");
      message.textContent=(e.message||String(e))+" If you were just assigned the Captain role, check the ACCESS sheet and try again.";
      setStatus("Could not load Captain Directory",true);
    }finally{loading=false;}
  }

  teamFilter.addEventListener("change",renderFilteredRows);\n  $("captainExportBtn")?.addEventListener("click",exportDirectoryCsv);
  playerTrigger.addEventListener("click",()=>playerDropdown.classList.contains("hidden")?openPlayerDropdown():closePlayerDropdown());
  playerSearch.addEventListener("input",renderPlayerOptions);
  playerOptions.addEventListener("click",event=>{
    const option=event.target.closest("[data-player]");
    if(!option)return;
    selectedPlayer=option.dataset.player||"";
    playerSelected.textContent=selectedPlayer||"All Players";
    closePlayerDropdown();
    renderPlayerOptions();
    renderFilteredRows();
  });
  document.addEventListener("click",event=>{
    if(!$("captainPlayerFilterWrap").contains(event.target))closePlayerDropdown();
  });
  document.addEventListener("keydown",event=>{if(event.key==="Escape")closePlayerDropdown();});

  await SRGFAuth.init();
  nav("captains");
  if(canView())await loadDirectory();else showDenied();
  const authBox=$("authBox");
  if(authBox){
    new MutationObserver(()=>{
      nav("captains");
      if(canView()&&!loaded)loadDirectory();
      else if(!canView())showDenied();
    }).observe(authBox,{childList:true,subtree:true});
  }
  $("refreshBtn")?.addEventListener("click",()=>{loaded=false;loadDirectory();});
});