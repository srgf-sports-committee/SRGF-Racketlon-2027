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
      return json_(saveFixtureResult_(e.parameter));
    }
    if(a==='sellplayer') return json_(sellPlayer_(e.parameter));
    if(a==='removeplayer') return json_(removePlayer_(e.parameter));
    if(a==='syncchanges') return json_(syncChanges_(e.parameter));
    throw new Error('Unknown POST action.');
  }catch(err){return json_({ok:false,error:String(err.message||err)})}
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
  const playerId=String(p.playerId||'').trim(), teamId=String(p.teamId||'').trim(), amount=Number(p.amount||0);
  if(!playerId||!teamId||!Number.isFinite(amount)||amount<=0) throw new Error('Invalid auction data.');
  const sh=SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEETS.auction);
  if(!sh) throw new Error('AUCTION sheet is missing.');
  const h=headers_(sh);
  const required={auctionId:header_(h,['Auction ID']),playerId:header_(h,['Player ID']),playerName:header_(h,['Player Name']),teamId:header_(h,['Team ID']),teamName:header_(h,['Team Name']),amount:header_(h,['Amount']),timestamp:header_(h,['Timestamp'])};
  if(required.playerId<0||required.teamId<0||required.amount<0) throw new Error('AUCTION headers are incomplete.');
  const players=sheetObjects_(SHEETS.players),teams=sheetObjects_(SHEETS.teams);
  const player=players.find(x=>String(x['Player ID']||'')===playerId);
  const team=teams.find(x=>String(x['Team ID']||'')===teamId);
  if(!player) throw new Error('Player not found.');
  if(!team) throw new Error('Team not found.');
  const existing=sheetObjects_(SHEETS.auction).some(x=>String(x['Player ID']||'')===playerId);
  if(existing) return {ok:true,alreadySaved:true};
  const row=new Array(h.length).fill('');
  if(required.auctionId>0) row[required.auctionId-1]='A'+Date.now();
  if(required.playerId>0) row[required.playerId-1]=playerId;
  if(required.playerName>0) row[required.playerName-1]=player['Name']||player['Player Name']||playerId;
  if(required.teamId>0) row[required.teamId-1]=teamId;
  if(required.teamName>0) row[required.teamName-1]=team['Team Name']||teamId;
  if(required.amount>0) row[required.amount-1]=amount;
  if(required.timestamp>0) row[required.timestamp-1]=new Date();
  sh.appendRow(row);
  CacheService.getScriptCache().remove('SRGF_READ_V3_'+SHEETS.auction);
  return {ok:true,saved:true};
}

function removePlayer_(p){
  const playerId=String(p.playerId||'').trim();
  const sh=SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEETS.auction);
  if(!sh) throw new Error('AUCTION sheet is missing.');
  const h=headers_(sh), c=header_(h,['Player ID']);
  if(c<0) throw new Error('AUCTION Player ID header is missing.');
  const vals=sh.getRange(2,c,Math.max(0,sh.getLastRow()-1),1).getDisplayValues();
  for(let i=vals.length-1;i>=0;i--) if(String(vals[i][0])===playerId) sh.deleteRow(i+2);
  CacheService.getScriptCache().remove('SRGF_READ_V3_'+SHEETS.auction);
  return {ok:true,removed:true};
}

function syncChanges_(p){
  const sales=JSON.parse(p.sales||'[]'), deletes=JSON.parse(p.deletes||'[]');
  let saved=0,removed=0;
  sales.forEach(x=>{sellPlayer_(x);saved++});
  deletes.forEach(id=>{removePlayer_({playerId:id});removed++});
  return {ok:true,saved,removed};
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
