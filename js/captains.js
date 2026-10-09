document.addEventListener("DOMContentLoaded",async()=>{
  const {$,esc,setStatus,nav,live}=SRGF;
  const message=$("captainAccessMessage");
  const card=$("captainTableCard");
  let loading=false,loaded=false;

  function canView(){
    return SRGFAuth.canViewCaptains();
  }
  function showDenied(){
    card.classList.add("hidden");
    message.classList.remove("hidden");
    message.innerHTML='Please sign in with an account assigned the <strong>CAPTAIN</strong> or <strong>ADMIN</strong> role.';
    setStatus("Captain/Admin login required",true);
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
      const rows=Array.isArray(result.rows)?result.rows:[];
      $("captainPlayersBody").innerHTML=rows.length?rows.map(p=>'<tr><td>'+esc(p.teamName||"")+'</td><td>'+esc(p.playerName||"")+'</td><td>'+esc(p.mobile||"")+'</td></tr>').join(""):'<tr><td colspan="3">No player details found.</td></tr>';
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