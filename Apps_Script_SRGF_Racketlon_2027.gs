/*******************************************************
 SRGF RACKETLON 2027 - PROTECTED APPS SCRIPT BACKEND
 Master data remains in Google Sheets.
 Public GET reads are read-only.
 Writes require a Google ID token and ACCESS-sheet role.

 Sheets:
 PLAYERS, TEAMS, AUCTION, FIXTURES, RESULTS, CONFIG, ACCESS
*******************************************************/
const SPREADSHEET_ID = '1RtyxyB3ZPjxD1uAw6mhOrcyjCWtGr0NnELyn_0kGlX4';

const SHEETS = {
  players:'PLAYERS', teams:'TEAMS', auction:'AUCTION',
  fixtures:'FIXTURES', results:'RESULTS', config:'CONFIG', access:'ACCESS'
};

function doGet(e){
  try{
    const a=String(e?.parameter?.action||'data').toLowerCase();
    if(a==='ping') return json_({ok:true,now:new Date().toISOString()});
    if(a==='whoami'){
      const user=authorize_(e.parameter.token||'', false);
      return json_({ok:true,email:user.email,role:user.role});
    }
    if(a==='photo') return json_(getPhoto_(e.parameter.id||''));

    // Every successful read carries the timestamp of the latest actual
    // Google-Sheet content change. This lets the website compare live data,
    // browser cache and GitHub JSON without ever going backwards.
    if(a==='players') return json_(datasetResponse_('players'));
    if(a==='teams') return json_(datasetResponse_('teams'));
    if(a==='auction') return json_(datasetResponse_('auction'));
    if(a==='fixtures') return json_(datasetResponse_('fixtures'));
    if(a==='results') return json_(datasetResponse_('results'));
    if(a==='config') return json_(datasetResponse_('config'));

    if(a==='data') return json_(exportData_());
    return json_(exportData_());
  }catch(err){return json_({ok:false,error:String(err.message||err)})}
}

function doPost(e){
  try{
    const a=String(e?.parameter?.action||'').toLowerCase();
    const token=String(e?.parameter?.token||'');
    if(a==='sellplayer' || a==='removeplayer' || a==='syncchanges'){
      const user=authorize_(token,true);
      if(user.role!=='ADMIN') throw new Error('Admin access required for Auction changes.');
    }
    if(a==='savefixtureresult'){
      const user=authorize_(token,true);
      if(user.role!=='ADMIN' && user.role!=='WRITER') throw new Error('Admin or Writer access required.');
      return json_({ok:true,result:saveFixtureResult_(e.parameter)});
    }
    if(a==='sellplayer') return json_({ok:true,result:sellPlayer_(e.parameter)});
    if(a==='removeplayer') return json_({ok:true,result:removePlayer_(e.parameter)});
    if(a==='syncchanges') return json_(syncChanges_(e.parameter));
    throw new Error('Unknown POST action.');
  }catch(err){return json_({ok:false,error:String(err.message||err)})}
}

function getPhoto_(fileId){
  fileId=String(fileId||'').trim();
  if(!fileId) return {ok:false,error:'Photo file ID is required.'};
  try{
    const file=DriveApp.getFileById(fileId);
    const blob=file.getBlob();
    const contentType=String(blob.getContentType()||'');
    if(!contentType.startsWith('image/')) return {ok:false,error:'The selected Photo file is not an image.'};
    return {ok:true,fileId,mimeType:contentType,base64:Utilities.base64Encode(blob.getBytes())};
  }catch(err){
    return {ok:false,error:'Unable to read photo from Google Drive: '+String(err.message||err)};
  }
}

function exportData_(){
  // One spreadsheet open per combined request instead of one open per sheet.
  // This is a major reduction in Apps Script latency on cold requests.
  const ss=SpreadsheetApp.openById(SPREADSHEET_ID);
  const data={
    players:sheetObjectsCached_(SHEETS.players,ss),
    teams:sheetObjectsCached_(SHEETS.teams,ss),
    auction:sheetObjectsCached_(SHEETS.auction,ss),
    fixtures:sheetObjectsCached_(SHEETS.fixtures,ss),
    results:sheetObjectsCached_(SHEETS.results,ss),
    config:sheetObjectsCached_(SHEETS.config,ss)
  };
  const sourceUpdatedAt=updateSourceVersion_(data,'combined');
  return {ok:true,sourceUpdatedAt,updatedAt:sourceUpdatedAt,...data};
}

function datasetResponse_(name){
  const data=sheetObjectsCached_(SHEETS[name]);
  const all={}; all[name]=data;
  const sourceUpdatedAt=updateSourceVersion_(all,name);
  const out={ok:true,sourceUpdatedAt,updatedAt:sourceUpdatedAt};
  out[name]=data;
  return out;
}

// This is the important version marker. Apps Script request time is NOT used
// as the data timestamp because a failed/stale read must never look newer
// than a successful read already stored in a browser or in GitHub.
const SOURCE_VERSION_PREFIX='SRGF_SOURCE_VERSION_V2_';
const SOURCE_UPDATED_AT_PREFIX='SRGF_SOURCE_UPDATED_AT_V2_';

function updateSourceVersion_(data,scope){
  const serialized=JSON.stringify(data||{});
  const digest=Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, serialized);
  const fingerprint=digest.map(b=>('0'+((b+256)%256).toString(16)).slice(-2)).join('');
  const safeScope=String(scope||'combined').replace(/[^A-Za-z0-9_-]/g,'_');
  const versionKey=SOURCE_VERSION_PREFIX+safeScope;
  const updatedKey=SOURCE_UPDATED_AT_PREFIX+safeScope;
  const props=PropertiesService.getScriptProperties();
  const lock=LockService.getScriptLock();
  try{lock.waitLock(3000);}catch(_){/* continue; version is still best-effort */}
  try{
    const oldFingerprint=props.getProperty(versionKey)||'';
    let updatedAt=props.getProperty(updatedKey)||'';
    if(!oldFingerprint || oldFingerprint!==fingerprint){
      updatedAt=new Date().toISOString();
      props.setProperty(versionKey,fingerprint);
      props.setProperty(updatedKey,updatedAt);
    }
    return updatedAt || new Date().toISOString();
  }finally{
    try{lock.releaseLock();}catch(_){ }
  }
}

// Cache is deliberately short-lived. It prevents several visitors/refreshes
// from making Google Sheets perform the same expensive read at the same time,
// while still checking the master Sheet frequently.
const READ_CACHE_SECONDS = 5;

function sheetObjectsCached_(name,ss){
  const cache=CacheService.getScriptCache();
  const key='SRGF_READ_V3_'+name;
  const hit=cache.get(key);
  if(hit!==null){
    try{return JSON.parse(hit)}catch(_){/* ignore corrupt cache */}
  }
  const rows=sheetObjects_(name,ss);
  try{
    const text=JSON.stringify(rows);
    // Apps Script CacheService has a per-value size limit. Only cache values
    // that fit; large sheets simply bypass the cache and remain fully live.
    if(text.length < 95000) cache.put(key,text,READ_CACHE_SECONDS);
  }catch(_){/* cache is an optimization only */}
  return rows;
}

function sheetObjects_(name,ss){
  ss=ss || SpreadsheetApp.openById(SPREADSHEET_ID);
  const sh=ss.getSheetByName(name);
  if(!sh) return [];
  const lastRow=sh.getLastRow(), lastCol=sh.getLastColumn();
  if(lastRow<2 || lastCol<1) return [];
  const values=sh.getRange(1,1,lastRow,lastCol).getDisplayValues();
  const headers=values[0].map(String);
  return values.slice(1).filter(r=>r.some(v=>String(v).trim()!=='')).map(r=>{
    const o={}; headers.forEach((h,i)=>o[h]=r[i]??''); return o;
  });
}

function headers_(sh){
  const last=sh.getLastColumn();
  return last ? sh.getRange(1,1,1,last).getDisplayValues()[0] : [];
}
function header_(headers,names){
  const wanted=names.map(x=>String(x).trim().toLowerCase());
  for(let i=0;i<headers.length;i++) if(wanted.includes(String(headers[i]).trim().toLowerCase())) return i+1;
  return -1;
}
function rowIndex_(headers,names){
  return header_(headers,names);
}

function accessMap_(){
  const sh=SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEETS.access);
  if(!sh) throw new Error('ACCESS sheet is missing.');
  const values=sh.getDataRange().getDisplayValues();
  const map={};
  if(values.length<2) return map;
  const h=values[0].map(x=>String(x).trim().toLowerCase());
  const ei=h.indexOf('email'), ri=h.indexOf('role'), ai=h.indexOf('active');
  for(let i=1;i<values.length;i++){
    const email=String(values[i][ei]||'').trim().toLowerCase();
    const role=String(values[i][ri]||'USER').trim().toUpperCase();
    const active=ai<0 || String(values[i][ai]||'TRUE').trim().toUpperCase()!=='FALSE';
    if(email && active) map[email]=role;
  }
  return map;
}

/*
 For initial deployment this uses Google's tokeninfo endpoint to validate
 the ID token. Once the Google OAuth client is configured, this gives the
 backend the verified email/subject before ACCESS-sheet authorization.
 For higher-security production deployment, replace this function with
 local RS256 signature verification against Google's rotating certificates.
*/
function authorize_(token, write){
  if(!token) throw new Error('Google login required.');
  const r=UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?id_token='+encodeURIComponent(token),{muteHttpExceptions:true});
  if(r.getResponseCode()!==200) throw new Error('Google login token is invalid or expired.');
  const j=JSON.parse(r.getContentText());
  if(!j.email || String(j.email_verified).toLowerCase()!=='true') throw new Error('Verified Google email required.');
  const clientId='558722597292-0bod7pch3lnjb2j8421922rvtsdmjm1v.apps.googleusercontent.com';
  if(String(j.aud||'')!==clientId) throw new Error('Google login was issued for a different application.');
  if(String(j.iss||'')!=='https://accounts.google.com' && String(j.iss||'')!=='accounts.google.com') throw new Error('Invalid Google token issuer.');
  const role=(accessMap_()[String(j.email).toLowerCase()]||'USER').toUpperCase();
  if(write && role==='USER') throw new Error('This Google account is not authorized to edit.');
  return {email:String(j.email).toLowerCase(),role,sub:j.sub||''};
}

function sellPlayer_(p){
  const playerId=String(p.playerId||'').trim();
  const teamId=String(p.teamId||'').trim();
  const amount=Number(p.amount||0);
  if(!playerId||!teamId||!Number.isFinite(amount)||amount<=0) throw new Error('Player, team and a positive amount are required.');

  const lock=LockService.getScriptLock();
  lock.waitLock(15000);
  try{
    const ss=SpreadsheetApp.openById(SPREADSHEET_ID);
    const playersSheet=requireSheet_(ss,SHEETS.players);
    const teamsSheet=requireSheet_(ss,SHEETS.teams);
    const auctionSheet=requireSheet_(ss,SHEETS.auction);
    const players=readSheet_(ss,SHEETS.players);
    const teams=readSheet_(ss,SHEETS.teams);
    const auction=readSheet_(ss,SHEETS.auction);

    const player=players.find(r=>String(r['Player ID']||'')===playerId);
    const team=teams.find(r=>String(r['Team ID']||'')===teamId);
    if(!player) throw new Error('Player not found: '+playerId);
    if(!team) throw new Error('Team not found: '+teamId);
    if(String(player['Active']||'TRUE').toUpperCase()==='FALSE') throw new Error('Player is inactive.');

    const existing=auction.find(r=>String(r['Player ID']||'')===playerId);
    if(existing){
      const existingTeam=String(existing['Team ID']||'');
      const existingAmount=Number(existing['Amount']||0);
      if(existingTeam===teamId && existingAmount===amount){
        return {playerId,teamId,amount,alreadyExists:true};
      }
      throw new Error('Player has already been auctioned to '+existingTeam+' for ₹'+Math.round(existingAmount).toLocaleString('en-IN')+'.');
    }

    const initialBudget=getConfigNumber_(ss,'Initial Budget',Number(team['Initial Budget']||5000000));
    const minPlayers=getConfigNumber_(ss,'Minimum Players',15);
    const reserve=getConfigNumber_(ss,'Reserve Per Slot',100000);
    const teamSales=auction.filter(r=>String(r['Team ID']||'')===teamId);
    const spent=teamSales.reduce((s,r)=>s+Number(r['Amount']||0),0);
    const currentPlayers=teamSales.length;
    const left=initialBudget-spent;
    const remaining=Math.max(0,minPlayers-currentPlayers);
    const maxBid=Math.max(0,left-Math.max(0,remaining-1)*reserve);
    if(amount>maxBid) throw new Error('Bid exceeds the team max bid of ₹'+Math.round(maxBid).toLocaleString('en-IN')+'.');

    const auctionId='A'+Utilities.getUuid().replace(/-/g,'').slice(0,20);
    appendAuctionRow_(auctionSheet,{
      'Auction ID':auctionId,
      'Player ID':playerId,
      'Player Name':player['Name']||'',
      'Team ID':teamId,
      'Team Name':team['Team Name']||teamId,
      'Amount':amount,
      'Timestamp':new Date(),
      'Notes':p.notes||''
    });
    updatePlayerAssignment_(playersSheet,playerId,teamId,amount);
    SpreadsheetApp.flush();
    CacheService.getScriptCache().remove('SRGF_READ_V3_'+SHEETS.auction);
    return {playerId,teamId,amount,auctionId,alreadyExists:false};
  }finally{lock.releaseLock();}
}

function removePlayer_(p){
  const playerId=String(p.playerId||'').trim();
  if(!playerId) throw new Error('Player ID is required.');
  const lock=LockService.getScriptLock();
  lock.waitLock(15000);
  try{
    const ss=SpreadsheetApp.openById(SPREADSHEET_ID);
    const playersSheet=requireSheet_(ss,SHEETS.players);
    const auctionSheet=requireSheet_(ss,SHEETS.auction);
    const removedCount=deleteAuctionRowsForPlayer_(auctionSheet,playerId);
    clearPlayerAssignment_(playersSheet,playerId);
    CacheService.getScriptCache().remove('SRGF_READ_V3_'+SHEETS.auction);
    return {playerId,removedCount,availableAgain:true};
  }finally{lock.releaseLock();}
}

function syncChanges_(p){
  const sales=parseArrayPayload_(p.sales);
  const deletes=parseArrayPayload_(p.deletes!==undefined?p.deletes:p.removals);
  const results={saved:[],alreadySaved:[],deleted:[],deleteAlready:[],conflicts:[],errors:[]};

  // Removals first so a remove + re-auction sequence can be replayed safely.
  for(const raw of deletes){
    const playerId=String(typeof raw==='object'&&raw!==null?(raw.playerId||''):raw).trim();
    if(!playerId) continue;
    try{
      const ss=SpreadsheetApp.openById(SPREADSHEET_ID);
      const auctionSheet=requireSheet_(ss,SHEETS.auction);
      const playersSheet=requireSheet_(ss,SHEETS.players);
      const exists=readSheet_(ss,SHEETS.auction).some(r=>String(r['Player ID']||'')===playerId);
      if(!exists){
        clearPlayerAssignment_(playersSheet,playerId);
        results.deleteAlready.push(playerId);
      }else{
        const removed=deleteAuctionRowsForPlayer_(auctionSheet,playerId);
        clearPlayerAssignment_(playersSheet,playerId);
        if(removed>0) results.deleted.push(playerId); else results.deleteAlready.push(playerId);
        CacheService.getScriptCache().remove('SRGF_READ_V3_'+SHEETS.auction);
      }
    }catch(err){
      results.errors.push({type:'removePlayer',playerId,error:String(err.message||err)});
    }
  }

  for(const s of sales){
    try{
      const playerId=String(s.playerId||'').trim();
      const teamId=String(s.teamId||'').trim();
      const amount=Number(s.amount||0);
      if(!playerId||!teamId||!Number.isFinite(amount)||amount<=0) throw new Error('Player, team and a positive amount are required.');
      const ss=SpreadsheetApp.openById(SPREADSHEET_ID);
      const existing=readSheet_(ss,SHEETS.auction).find(r=>String(r['Player ID']||'')===playerId);
      if(existing){
        const existingTeam=String(existing['Team ID']||'');
        const existingAmount=Number(existing['Amount']||0);
        if(existingTeam===teamId&&existingAmount===amount){results.alreadySaved.push(playerId);continue;}
        throw new Error('Player has already been auctioned to '+existingTeam+' for ₹'+Math.round(existingAmount).toLocaleString('en-IN')+'.');
      }
      const result=sellPlayer_({playerId,teamId,amount,notes:s.notes||''});
      if(result.alreadyExists) results.alreadySaved.push(playerId); else results.saved.push(playerId);
    }catch(err){
      results.errors.push({type:'sellPlayer',playerId:s&&s.playerId?String(s.playerId):'',error:String(err.message||err)});
    }
  }

  results.ok=results.errors.length===0;
  if(results.errors.length) results.error=results.errors.map(x=>x.error).join(' | ');
  return results;
}

function parseArrayPayload_(value){
  if(Array.isArray(value)) return value;
  if(value===undefined||value===null||value==='') return [];
  if(typeof value==='string'){try{const parsed=JSON.parse(value);return Array.isArray(parsed)?parsed:[];}catch(_){return [];}}
  return [];
}

function updatePlayerAssignment_(sheet,playerId,teamId,amount){
  const headers=getHeaders_(sheet);
  const idCol=headers.indexOf('Player ID')+1;
  const teamCol=headers.indexOf('Team ID')+1;
  const amountCol=headers.indexOf('Auction Amount')+1;
  if(!idCol) throw new Error('PLAYERS is missing the "Player ID" column.');
  const values=sheet.getDataRange().getValues();
  for(let i=1;i<values.length;i++){
    if(String(values[i][idCol-1])===playerId){
      if(teamCol) sheet.getRange(i+1,teamCol).setValue(teamId);
      if(amountCol) sheet.getRange(i+1,amountCol).setValue(amount);
      return;
    }
  }
  throw new Error('Player ID not found in PLAYERS: '+playerId);
}

function clearPlayerAssignment_(sheet,playerId){
  const headers=getHeaders_(sheet);
  const idCol=headers.indexOf('Player ID')+1;
  const teamCol=headers.indexOf('Team ID')+1;
  const amountCol=headers.indexOf('Auction Amount')+1;
  if(!idCol) throw new Error('PLAYERS is missing the "Player ID" column.');
  const values=sheet.getDataRange().getValues();
  for(let i=1;i<values.length;i++){
    if(String(values[i][idCol-1])===playerId){
      if(teamCol) sheet.getRange(i+1,teamCol).clearContent();
      if(amountCol) sheet.getRange(i+1,amountCol).clearContent();
      return;
    }
  }
  throw new Error('Player ID not found in PLAYERS: '+playerId);
}

function deleteAuctionRowsForPlayer_(sheet,playerId){
  const values=sheet.getDataRange().getValues();
  if(values.length<=1) return 0;
  const headers=values[0].map(String);
  const playerCol=headers.indexOf('Player ID');
  if(playerCol<0) throw new Error('AUCTION is missing the "Player ID" column.');
  let count=0;
  for(let i=values.length-1;i>=1;i--){
    if(String(values[i][playerCol])===playerId){sheet.deleteRow(i+1);count++;}
  }
  return count;
}

function appendAuctionRow_(sheet,obj){
  const headers=getHeaders_(sheet);
  const row=headers.map(h=>obj[h]!==undefined?obj[h]:'');
  sheet.appendRow(row);
}

function getConfigNumber_(ss,key,fallback){
  const rows=readSheet_(ss,SHEETS.config);
  const r=rows.find(x=>String(x['Parameter']||'').trim()===key);
  const n=r?Number(r['Value']):NaN;
  return Number.isFinite(n)?n:fallback;
}

function requireSheet_(ss,name){
  const sh=findSheet_(ss,name);
  if(!sh) throw new Error('Required sheet tab is missing: '+name);
  return sh;
}

function saveFixtureResult_(p){
  const rowNumber=Number(p.rowNumber), scores=JSON.parse(p.scores||'[]');
  if(!rowNumber || rowNumber<2) throw new Error('Invalid fixture row.');
  const sh=SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(String(p.sheet||SHEETS.fixtures));
  if(!sh) throw new Error('FIXTURES sheet is missing.');
  const h=headers_(sh);
  scores.forEach(s=>{
    const c=header_(h,[`Game ${s.game}`,`Game${s.game}`]);
    if(c<0) throw new Error(`Game ${s.game} column not found.`);
    sh.getRange(rowNumber,c).setValue(`${s.player1} - ${s.player2}`);
  });
  CacheService.getScriptCache().remove('SRGF_READ_V3_'+SHEETS.fixtures);
  return {ok:true,saved:true,rowNumber};
}

function json_(obj){
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}


/**
 * Run this function ONCE from the Apps Script editor after adding/changing
 * UrlFetchApp usage. It forces Apps Script to request the required
 * external-request authorization from the script owner.
 */
function authorizeServices(){
  SpreadsheetApp.openById(SPREADSHEET_ID).getName();
  UrlFetchApp.fetch('https://www.google.com/generate_204', {
    muteHttpExceptions:true,
    followRedirects:true
  });
  return 'Authorization check completed.';
}
