document.addEventListener("DOMContentLoaded",async()=>{
  const {$,esc,setStatus,nav,live}=SRGF;
  const message=$("captainAccessMessage");
  const card=$("captainTableCard");
  const body=$("captainPlayersBody");
  const teamFilter=$("captainTeamFilter");
  const playerFilter=$("captainPlayerFilter");
  const filterCount=$("captainFilterCount");
  let loading=false,loaded=false,players=[];

  function canView(){
    return SRGFAuth.canViewCaptains();
  }
  function showDenied(){
    card.classList.add("hidden");
    message.classList.remove("hidden");
    message.innerHTML='Please sign in with an account assigned the <strong>CAPTAIN</strong> or <strong>ADMIN</strong> role.';
    setStatus("Captain/Admin login required",true);
  }
  function renderFilteredRows(){
    const team=teamFilter.value;
    const playerQuery=playerFilter.value.trim().toLocaleLowerCase();
    const filtered=players.filter(p=>{
      const teamName=String(p.teamName||"");
      const playerName=String(p.playerName||"");
      return (!team||teamName===team)&&(!playerQuery||playerName.toLocaleLowerCase().includes(playerQuery));
    });
    body.innerHTML=filtered.length?filtered.map(p=>'<tr><td>'+esc(p.teamName||"")+'</td><td>'+esc(p.playerName||"")+'</td><td>'+esc(p.mobile||"")+'</td></tr>').join(""):'<tr><td colspan="3">No players match the selected filters.</td></tr>';
    filterCount.textContent='Showing '+filtered.length+' of '+players.length+' players';
  }
  function populateTeamFilter(){
    const selected=teamFilter.value;
    const teams=[...new Set(players.map(p=>String(p.teamName||"").trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
    teamFilter.innerHTML='<option value="">All Teams</option>'+teams.map(team=>'<option value="'+esc(team)+'">'+esc(team)+'</option>').join("");
    if(teams.includes(selected))teamFilter.value=selected;
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

  teamFilter.addEventListener("change",renderFilteredRows);
  playerFilter.addEventListener("input",renderFilteredRows);

  await SRGFAuth.init();
  nav("captains");
  if(canView())await loadDirectory();else showDenied();

  // Re-check when the sign-in UI changes, so a newly logged-in Captain
  // can see the directory without manually refreshing the page.
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