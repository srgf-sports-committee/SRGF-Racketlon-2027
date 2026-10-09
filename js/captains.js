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
  let formResponsesLoaded=false,formResponseHeaders=[],formResponseRows=[],formResponsesLoading=false;
  const directorySection=$("captainDirectory");
  const formResponsesSection=$("captainFormResponses");
  const directoryTab=$("captainDirectoryTab");
  const formResponsesTab=$("captainFormResponsesTab");
  const formResponsesMessage=$("formResponsesMessage");
  const formResponsesCard=$("formResponsesCard");
  const formResponsesHead=$("formResponsesHead");
  const formResponsesBody=$("formResponsesBody");
  const formResponsesCount=$("formResponsesCount");

  function selectCaptainTab(tab){
    const showResponses=tab==="responses";
    directorySection.classList.toggle("hidden",showResponses);
    formResponsesSection.classList.toggle("hidden",!showResponses);
    directoryTab.classList.toggle("btn-primary",!showResponses);
    formResponsesTab.classList.toggle("btn-primary",showResponses);
    directoryTab.setAttribute("aria-selected",String(!showResponses));
    formResponsesTab.setAttribute("aria-selected",String(showResponses));
    if(showResponses&&!formResponsesLoaded)loadFormResponses();
  }
  function shortFormHeader(header,index){
    if(index===16)return "Whatspp";
    if(index===21)return "Availability";
    let label=String(header||"").trim();
    label=label.replace(/rank your sports by priority/ig,"").replace(/\s{2,}/g," ").replace(/^\s*[-:–—|]+\s*|\s*[-:–—|]+\s*$/g,"").trim();
    if(label.toLowerCase().includes("nomination for") && label.toLowerCase().includes("nominate as a player"))return "Captain?";
    // Remove common form-question wording while preserving the actual field meaning.
    label=label
      .replace(/^please\s+(?:select|enter|provide|write|mention|choose|specify)\s+/i,"")
      .replace(/^kindly\s+(?:select|enter|provide|write|mention|choose|specify)\s+/i,"")
      .replace(/^(?:what is|what's|which is|which are|please tell us)\s+(?:your|the)\s+/i,"")
      .replace(/^(?:your|the)\s+/i,"")
      .replace(/[?:]+$/g,"")
      .replace(/\s+/g," ")
      .trim();
    const replacements=[
      [/^timestamp$/i,"Timestamp"],
      [/e-?mail\s+address/i,"Email"],
      [/mobile\s+(?:phone\s+)?number/i,"Mobile"],
      [/phone\s+number/i,"Phone"],
      [/contact\s+number/i,"Contact"],
      [/full\s+name/i,"Name"],
      [/date\s+of\s+birth/i,"DOB"],
      [/available\s+(?:sports|sport|dates|days|time)/i,"Availability"],
      [/availability\s+for/i,"Availability"],
      [/team\s+name/i,"Team"],
      [/player\s+name/i,"Player"],
      [/transaction\s+code/i,"Transaction Code"]
    ];
    replacements.forEach(([pattern,value])=>{label=label.replace(pattern,value);});
    return label||String(header||"Column "+(index+1));
  }
  function renderFormResponses(){
    const isPhotoColumn=header=>/photo|picture|image/i.test(String(header||""));
    formResponsesHead.innerHTML="<tr>"+formResponseHeaders.map((h,i)=>"<th"+(isPhotoColumn(h)?' class="form-response-photo-column"':"")+">"+esc(shortFormHeader(h,i))+"</th>").join("")+"</tr>";
    formResponsesBody.innerHTML=formResponseRows.length
      ?formResponseRows.map(row=>"<tr>"+formResponseHeaders.map((header,i)=>"<td"+(isPhotoColumn(header)?' class="form-response-photo-column"':"")+">"+esc(row[i]??"")+"</td>").join("")+"</tr>").join("")
      :'<tr><td colspan="'+Math.max(1,formResponseHeaders.length)+'">No form responses found.</td></tr>';
    formResponsesCount.textContent="Showing "+formResponseRows.length+" form responses";
  }
  async function loadFormResponses(){
    if(formResponsesLoading)return;
    if(!canView()){
      formResponsesMessage.classList.remove("hidden");
      formResponsesMessage.textContent="Captain/Admin login required.";
      formResponsesCard.classList.add("hidden");
      return;
    }
    formResponsesLoading=true;
    formResponsesMessage.classList.remove("hidden");
    formResponsesMessage.textContent="Loading Form Responses 1…";
    formResponsesCard.classList.add("hidden");
    try{
      const result=await live("formresponses",SRGFAuth.token());
      if(result.ok===false)throw new Error(result.error||"Could not load Form Responses 1.");
      formResponseHeaders=Array.isArray(result.headers)?result.headers.map(String):[];
      formResponseRows=Array.isArray(result.rows)?result.rows:[];
      // Rename columns Q and V in this imported view only; the Google Sheet is untouched.
      if(formResponseHeaders.length>16)formResponseHeaders[16]="Whatspp";
      if(formResponseHeaders.length>21)formResponseHeaders[21]="Availability";
      renderFormResponses();
      formResponsesMessage.classList.add("hidden");
      formResponsesCard.classList.remove("hidden");
      formResponsesLoaded=true;
      setStatus("Form Responses loaded");
    }catch(e){
      formResponsesMessage.classList.remove("hidden");
      formResponsesMessage.textContent="Could not load Form Responses 1: "+(e.message||String(e));
      setStatus("Could not load Form Responses",true);
    }finally{formResponsesLoading=false;}
  }

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
    const blob=new Blob(["\uFEFF",csv],{type:"text/csv;charset=utf-8;"});
    const url=URL.createObjectURL(blob);
    const link=document.createElement("a");
    link.href=url;
    link.download="SRGF_Captain_Directory.csv";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }
  function exportFormResponsesCsv(){
    if(!formResponsesLoaded){
      alert("Please open the Form Responses tab and wait for the data to load.");
      return;
    }
    const rows=[formResponseHeaders.map((header,index)=>shortFormHeader(header,index)),...formResponseRows];
    const csv=rows.map(row=>row.map(value=>'"'+String(value??"").replace(/"/g,'""')+'"').join(",")).join("\r\n");
    const blob=new Blob(["\uFEFF",csv],{type:"text/csv;charset=utf-8;"});
    const url=URL.createObjectURL(blob);
    const link=document.createElement("a");
    link.href=url;
    link.download="Form_Responses_1.csv";
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
    setStatus("Form Responses CSV exported");
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

  directoryTab?.addEventListener("click",()=>selectCaptainTab("directory"));
  formResponsesTab?.addEventListener("click",()=>selectCaptainTab("responses"));
  teamFilter.addEventListener("change",renderFilteredRows);
  $("captainExportBtn")?.addEventListener("click",exportDirectoryCsv);
  $("captainFormResponsesExportBtn")?.addEventListener("click",exportFormResponsesCsv);
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