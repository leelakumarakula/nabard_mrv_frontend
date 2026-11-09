// @ts-nocheck
// Ported unchanged from Coffee-estate-twin/public/live-feed.js. Keep the logic byte-identical: the Node
// test suites and the Python backend parity test run against the original module.
// Polling is opt-in and read-only. A generation guard rejects late responses
// after pause, manual refresh, sign-out or a new live session.
export function createLiveFeed({read,onData,onState,interval=60000,timeout=85000,now=Date.now,schedule=setTimeout,cancel=clearTimeout}){
 let enabled=false,paused=true,disposed=false,timer=null,controller=null,generation=0;
 let status='off',lastCheckedAt=null,lastSuccessAt=null,nextCheckAt=null,error=null;
 const snapshot=()=>({enabled,paused,status,lastCheckedAt,lastSuccessAt,nextCheckAt,error});
 const emit=()=>onState?.(snapshot());
 function stop(){generation++;cancel(timer);timer=null;nextCheckAt=null;controller?.abort();controller=null;}
 function queue(){if(!enabled||paused||disposed)return;nextCheckAt=now()+interval;timer=schedule(()=>{timer=null;void check();},interval);}
 async function check(){
  if(!enabled||paused||disposed||controller)return;
  cancel(timer);timer=null;nextCheckAt=null;
  const run=++generation,abort=new AbortController();controller=abort;status='checking';error=null;emit();
  const deadline=schedule(()=>abort.abort(),timeout);
  try{
   const value=await read(abort.signal);
   if(run!==generation||!enabled||paused||disposed)return;
   if(abort.signal.aborted)throw Object.assign(new Error('Feed timed out'),{name:'AbortError'});
   lastCheckedAt=now();
   onData(value);
   lastSuccessAt=lastCheckedAt;status='ready';
  }catch(e){
   if(run!==generation||!enabled||paused||disposed)return;
   lastCheckedAt=now();status='error';error=e.name==='AbortError'?'The live feed took too long to respond.':e.message||'The live feed is unavailable.';
  }finally{
   cancel(deadline);
   if(run===generation){controller=null;queue();emit();}
  }
 }
 return {
  snapshot,
  enable(value){if(disposed||enabled===value)return;stop();enabled=value;status=value?(paused?'paused':'checking'):'off';error=null;emit();if(value&&!paused)void check();},
  pause(value){if(disposed||paused===value)return;stop();paused=value;if(enabled){status=value?'paused':'checking';emit();if(!value)void check();}},
  check,
  dispose(){stop();enabled=false;disposed=true;status='off';emit();}
 };
}

export function measurementStatus(reading,now=Date.now()){
 const raw=reading?.reportedAt,at=Date.parse(raw),explicit=reading?.timeZoneExplicit===true&&/(?:Z|[+-]\d\d:\d\d)$/.test(raw||'');
 if(!reading)return {fresh:false,label:'No reading available'};
 if(!explicit||!Number.isFinite(at))return {fresh:false,label:'No time stamp · not used for current alerts'};
 const age=now-at;
 if(age< -300000)return {fresh:false,label:'Device clock is ahead · check timestamp'};
 const hours=age/3600000;
 return {fresh:hours<=6,label:hours<=6?`Time verified · ${Math.max(0,Math.floor(age/60000))} min old`:`Old reading · ${Math.floor(hours)} h old`};
}

export function upcomingLiveForecast(farm,now=Date.now()){
 const age=now-Date.parse(farm?.fetchedAt?.forecast);
 if(!Number.isFinite(age)||age< -300000||age>6*3600000)return null;
 return farm?.forecast?.slots?.find(s=>s.time>now)??null;
}

// Merge only the rapidly changing resources. A five-minute full refresh keeps
// geometry/calendar current. Never promote fallback data to a new fetch time.
export function mergeLiveData(current,next){
 if(!current||!next||!Array.isArray(next.sensors)||!next.fetchedAt)throw new Error('The live feed returned an incomplete snapshot.');
 const result={...current,fetchedAt:{...current.fetchedAt},errors:{...current.errors},staleResources:[...(current.staleResources||[])]};
 const changed=[];
 for(const key of ['sensors','weather','forecast']){
  const at=Date.parse(next.fetchedAt[key]),previous=Date.parse(current.fetchedAt?.[key]);
  if(next[key]!=null&&Number.isFinite(at)&&(!Number.isFinite(previous)||at>=previous)){
   if(JSON.stringify(next[key])!==JSON.stringify(current[key]))changed.push(key);
   result[key]=next[key];result.fetchedAt[key]=next.fetchedAt[key];
  }
  if(key==='forecast'&&Number.isFinite(previous)&&!(at>previous))continue;
  const unavailable=!!next.errors?.[key]||next.staleResources?.includes(key)||next.connection?.state==='saved'&&key!=='forecast';
  if(unavailable){result.errors[key]=next.errors?.[key]||'Source temporarily unavailable';if(!result.staleResources.includes(key))result.staleResources.push(key);}
  else if(next[key]!=null){delete result.errors[key];result.staleResources=result.staleResources.filter(k=>k!==key);}
 }
 // Preserve farm/geometry connection errors until a full refresh resolves them.
 return {farm:result,changed};
}
