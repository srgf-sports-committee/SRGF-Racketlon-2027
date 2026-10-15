document.addEventListener("DOMContentLoaded", async ()=>{
  const {loadLiveFirstAll,$,esc,setStatus,nav}=SRGF; SRGFAuth.init(); nav("players");
  const sportFields={badminton:"Badminton Level",tt:"Table Tennis Level",tennis:"Lawn Tennis Level",pickle:"Pickle Ball Level"};
  const sportAliases={badminton:"badminton",tt:"tt",tennis:"tennis",pickle:"pickle"};
  let allRows=[];
  let selectedPlayer="";
  const playerButton=$("playerNameButton"), playerDropdown=$("playerNameDropdown"), playerSearch=$("playerNameSearch"), playerOptions=$("playerNameOptions");
  const sportFilter=$("sportFilter"), skillFilter=$("skillFilter"), categoryFilter=$("categoryFilter"), captainNomineeFilter=$("captainNomineeFilter");
  const clean=v=>String(v??"").trim();
  const skillFor=(p,key)=>clean(p[sportFields[key]] ?? p[sportAliases[key]] ?? "");
  function buildPlayerOptions(){
    const names=[...new Set(allRows.map(r=>r.name).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
    playerOptions.innerHTML="";
    const add=(value,label)=>{
      const button=document.createElement("button"); button.type="button"; button.className="player-dropdown-option"+(selectedPlayer===value?" active":"");
      button.setAttribute("role","option"); button.setAttribute("aria-selected",String(selectedPlayer===value)); button.dataset.value=value; button.textContent=label;
      button.addEventListener("click",()=>{selectedPlayer=value;playerButton.textContent=value||"All Players";closePlayerDropdown();applyFilters();buildPlayerOptions();});
      playerOptions.appendChild(button);
    };
    add("","All Players"); names.forEach(name=>add(name,name)); filterPlayerOptions();
  }
  function filterPlayerOptions(){
    const query=clean(playerSearch.value).toLocaleLowerCase(); let visible=0;
    playerOptions.querySelectorAll(".player-dropdown-option").forEach(option=>{
      const show=!query||option.textContent.toLocaleLowerCase().includes(query); option.hidden=!show; option.style.display=show?"block":"none"; if(show)visible++;
    });
    let empty=playerOptions.querySelector(".player-dropdown-empty");
    if(!visible){if(!empty){empty=document.createElement("div");empty.className="player-dropdown-empty";empty.textContent="No matching players";playerOptions.appendChild(empty);}}
    else empty?.remove();
  }
  function openPlayerDropdown(){playerDropdown.classList.remove("hidden");playerButton.setAttribute("aria-expanded","true");playerSearch.value="";filterPlayerOptions();playerSearch.focus();}
  function closePlayerDropdown(){playerDropdown.classList.add("hidden");playerButton.setAttribute("aria-expanded","false");}
  function buildSkillOptions(){
    const previous=skillFilter.value;
    const sport=sportFilter.value;
    const skills=[...new Set(allRows.flatMap(r=>sport?[skillFor(r.player,sport)]:Object.keys(sportFields).map(key=>skillFor(r.player,key))).map(clean).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
    skillFilter.innerHTML='<option value="">All Skills</option>'+skills.map(skill=>'<option value="'+esc(skill)+'">'+esc(skill)+'</option>').join("");
    if(skills.includes(previous))skillFilter.value=previous;
  }
  function buildCategoryOptions(){
    const previous=categoryFilter.value;
    const categories=[...new Set(allRows.map(r=>clean(r.player["Preferred Category"] ?? r.player.category ?? "" )).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
    categoryFilter.innerHTML='<option value="">All Categories</option>'+categories.map(category=>'<option value="'+esc(category)+'">'+esc(category)+'</option>').join("");
    if(categories.includes(previous))categoryFilter.value=previous;
  }
  function applyFilters(){
    const sport=sportFilter.value, skill=skillFilter.value, category=clean(categoryFilter.value).toLocaleLowerCase(), captainNominee=clean(captainNomineeFilter?.value);
    let shown=0;
    allRows.forEach(row=>{
      const playerMatch=(!selectedPlayer||row.name===selectedPlayer) && (!captainNominee || (captainNominee==="yes" ? /\*\s*$/.test(row.name) : !/\*\s*$/.test(row.name)));
      const skills=sport?[skillFor(row.player,sport)]:Object.keys(sportFields).map(key=>skillFor(row.player,key));
      const skillMatch=!skill||skills.some(value=>clean(value).toLocaleLowerCase()===skill.toLocaleLowerCase());
      const rowCategory=clean(row.player["Preferred Category"] ?? row.player.category ?? "").toLocaleLowerCase();
      const categoryMatch=!category||rowCategory===category;
      const show=playerMatch&&skillMatch&&categoryMatch; row.element.hidden=!show; if(show)shown++;
    });
    $("playersResultCount").textContent=shown+" of "+allRows.length+" players";
    const noResults=$("playersNoResults");
    if(!shown){if(!noResults){const tr=document.createElement("tr");tr.id="playersNoResults";tr.innerHTML='<td colspan="8">No players match these filters.</td>';$("playersBody").appendChild(tr);}}
    else noResults?.remove();
  }
  function render(data){
    const players=data?.players||[], auction=data?.auction||[], teams=data?.teams||[];
    const teamName=id=>teams.find(t=>String(t["Team ID"]||t.id)===String(id))?.["Team Name"]||teams.find(t=>String(t.id)===String(id))?.name||id||"";
    allRows=players.filter(p=>p["Name"]||p.name).map(p=>{
      const name=clean(p["Name"]||p.name), id=p["Player ID"]||p.id||"";
      const teamId=p["Team ID"]||p.team||auction.find(a=>String(a["Player ID"]||a.playerId)===String(id))?.["Team ID"]||"";
      const values={badminton:skillFor(p,"badminton"),tt:skillFor(p,"tt"),tennis:skillFor(p,"tennis"),pickle:skillFor(p,"pickle")};
      const tr=document.createElement("tr");
      tr.innerHTML='<td>'+esc(id)+'</td><td>'+esc(name)+'</td><td>'+esc(p["Preferred Category"]||p.category||"")+'</td><td>'+esc(values.badminton)+'</td><td>'+esc(values.tt)+'</td><td>'+esc(values.tennis)+'</td><td>'+esc(values.pickle)+'</td><td>'+esc(teamName(teamId))+'</td>';
      return {player:p,name,element:tr,values};
    });
    const body=$("playersBody");body.innerHTML="";allRows.forEach(row=>body.appendChild(row.element));
    buildPlayerOptions();buildSkillOptions();buildCategoryOptions();applyFilters();
  }
  playerButton?.addEventListener("click",()=>playerDropdown.classList.contains("hidden")?openPlayerDropdown():closePlayerDropdown());
  playerSearch?.addEventListener("input",filterPlayerOptions);
  sportFilter?.addEventListener("change",()=>{buildSkillOptions();applyFilters();});
  skillFilter?.addEventListener("change",applyFilters);
  categoryFilter?.addEventListener("change",applyFilters);
  captainNomineeFilter?.addEventListener("change",applyFilters);
  document.addEventListener("click",event=>{if(!$("playerNameCombo")?.contains(event.target))closePlayerDropdown();});
  document.addEventListener("keydown",event=>{if(event.key==="Escape")closePlayerDropdown();});
  try{
    const d=await loadLiveFirstAll();
    render(d.data||{});
    setStatus(d.live?"LIVE · Google Sheet":"Connecting to Google Sheets…",!d.live);
    if(d.retryPromise)d.retryPromise.then(r=>{render(r.data||{});setStatus("LIVE · Google Sheet");}).catch(()=>{});
  }catch(e){setStatus("Connecting to Google Sheets…",true);}
  $("refreshBtn")?.addEventListener("click",()=>location.reload());
});
