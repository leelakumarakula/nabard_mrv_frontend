// @ts-nocheck
// Ported unchanged from Coffee-estate-twin/public/solar-model.js. Keep the logic byte-identical: the Node
// test suites and the Python backend parity test run against the original module.
// Clear-sky direct-beam sun geometry on the 30 m surface model. This is a
// terrain exposure screen for comparing places within the farm, not measured
// radiation: clouds, shade trees, coffee canopy and diffuse light are not modelled.
import { isoDateIST } from './farm-model';
import { gridCell } from './terrain-overlay';

export const SOLAR_VERSION='coffee-solar-2026-09-v1';
// stepMinutes: sun sampling interval. horizonBins: azimuth sectors for cast-shadow horizons.
// contrast: minimum within-zone exposure range before contrast sampling is offered.
export const SOLAR_POLICY={stepMinutes:10,horizonBins:36,contrast:.04,annualDays:24,harvestMonths:[11,12,1]};
export const SOLAR_BASES={today:'Today’s sun path',harvest:'Harvest-month mean',annual:'Annual mean'};
const DAY=86400000,RAD=Math.PI/180,finite=Number.isFinite,wrap=d=>((d%360)+360)%360;
export function compass8(degrees){return finite(degrees)?['N','NE','E','SE','S','SW','W','NW'][Math.round(wrap(degrees)/45)%8]:'Level';}

// NOAA low-precision solar position (equation-of-time and declination series).
// Azimuth is clockwise from north; altitude is above the geometric horizon.
export function sunPosition(time,lat,lon){
 const d=new Date(time),doy=Math.floor((time-Date.UTC(d.getUTCFullYear(),0,1))/DAY),hours=d.getUTCHours()+d.getUTCMinutes()/60+d.getUTCSeconds()/3600;
 const g=2*Math.PI/365*(doy+(hours-12)/24);
 const eqt=229.18*(.000075+.001868*Math.cos(g)-.032077*Math.sin(g)-.014615*Math.cos(2*g)-.040849*Math.sin(2*g));
 const decl=.006918-.399912*Math.cos(g)+.070257*Math.sin(g)-.006758*Math.cos(2*g)+.000907*Math.sin(2*g)-.002697*Math.cos(3*g)+.00148*Math.sin(3*g);
 const H=((hours*60+eqt+4*lon)/4-180)*RAD,phi=lat*RAD;
 const altitude=Math.asin(Math.max(-1,Math.min(1,Math.sin(phi)*Math.sin(decl)+Math.cos(phi)*Math.cos(decl)*Math.cos(H))))/RAD;
 const azimuth=wrap(Math.atan2(Math.sin(H),Math.cos(H)*Math.sin(phi)-Math.tan(decl)*Math.cos(phi))/RAD+180);
 return {time,altitude,azimuth,hourAngle:H/RAD,declination:decl/RAD};
}
// Samples one IST calendar day; sunrise / sunset are the first / last samples above the horizon.
export function sunPath(dateIST,lat,lon,stepMinutes=15){
 const start=Date.parse(dateIST+'T00:00:00+05:30'),samples=[];let noon=null;
 for(let t=start;t<start+DAY;t+=stepMinutes*60000){const p=sunPosition(t,lat,lon);if(p.altitude>-1)samples.push(p);if(p.altitude>0&&(!noon||p.altitude>noon.altitude))noon=p;}
 const up=samples.filter(p=>p.altitude>0);
 return {date:dateIST,samples,noon,sunrise:up[0]??null,sunset:up.at(-1)??null,label:`Sun path · ${dateIST}`};
}
function cellSize(dem){const lat=(dem.bounds.north+dem.bounds.south)/2;return {dx:(dem.bounds.east-dem.bounds.west)*111320*Math.cos(lat*RAD)/dem.width,dy:(dem.bounds.north-dem.bounds.south)*111320/dem.height,lat};}
// Horn 3x3 gradient. Aspect is the downhill compass direction (0 N, 90 E); null on level cells.
export function slopeAspect(dem){
 const {width,height}=dem,{dx,dy}=cellSize(dem),byIndex=new Map(dem.cells.map(c=>[c.i,c])),out=new Map();
 for(const c of dem.cells){
  if(!finite(c.elevation))continue;
  const z=(dr,dc)=>{const r=c.row+dr,k=c.col+dc;if(r<0||r>=height||k<0||k>=width)return c.elevation;const n=byIndex.get(r*width+k);return finite(n?.elevation)?n.elevation:c.elevation;};
  const dzdx=((z(-1,1)+2*z(0,1)+z(1,1))-(z(-1,-1)+2*z(0,-1)+z(1,-1)))/(8*dx),dzdy=((z(1,-1)+2*z(1,0)+z(1,1))-(z(-1,-1)+2*z(-1,0)+z(-1,1)))/(8*dy);
  const slope=Math.atan(Math.hypot(dzdx,dzdy))/RAD;
  out.set(c.i,{slope:+slope.toFixed(2),aspect:slope<.05?null:+wrap(Math.atan2(-dzdx,dzdy)/RAD).toFixed(1)});
 }
 return out;
}
// Highest terrain angle seen from each cell in each azimuth sector, walking the same
// surface to the grid edge. The surface includes canopy, so this is a coarse horizon.
const horizonCache=new WeakMap();
export function horizons(dem){
 if(horizonCache.has(dem))return horizonCache.get(dem);
 // Angular port change (speed only, same angles): elevations in a flat array instead of a Map, and
 // each walk stops once even the grid's highest point at that distance could not beat the angle
 // found so far - nothing farther away can. Large farms took over a second here; small ones were
 // never slow. atan2 is still evaluated on the same arguments, so the angles are unchanged.
 const {width,height}=dem,{dx,dy}=cellSize(dem),bins=SOLAR_POLICY.horizonBins,step=Math.min(dx,dy)/2,out=new Map();
 const elev=new Float64Array(width*height).fill(NaN);let top=-Infinity;
 for(const c of dem.cells)if(finite(c.elevation)&&c.i>=0&&c.i<elev.length){elev[c.i]=c.elevation;if(c.elevation>top)top=c.elevation;}
 const dirs=Array.from({length:bins},(_,b)=>{const a=(b+.5)*360/bins*RAD;return [Math.sin(a),Math.cos(a)];});
 for(const c of dem.cells){
  if(!finite(c.elevation))continue;
  const angles=new Float64Array(bins),headroom=top-c.elevation;
  for(let b=0;b<bins;b++){
   const [east,north]=dirs[b];let best=0,bestRatio=0;
   for(let s=step;;s+=step){
    if(headroom<bestRatio*s*(1-1e-9))break;
    const col=Math.floor(c.col+.5+east*s/dx),row=Math.floor(c.row+.5-north*s/dy);
    if(col<0||col>=width||row<0||row>=height)break;
    const e=elev[row*width+col];if(!(e===e))continue;
    const rise=e-c.elevation;if(rise<=0||rise<bestRatio*s*(1-1e-9))continue;
    const angle=Math.atan2(rise,s)/RAD;if(angle>best)best=angle;if(rise/s>bestRatio)bestRatio=rise/s;
   }
   angles[b]=best;
  }
  out.set(c.i,angles);
 }
 horizonCache.set(dem,out);return out;
}
function monthDays(year,month,days){return days.map(day=>`${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`);}
// Months of calendar events titled as harvest (not pre-harvest); the policy default otherwise.
export function harvestMonths(calendar){
 const months=new Set();
 for(const e of calendar?.common||[]){
  if(!/(?:^|[\s,])harvest/i.test(e.title||''))continue;
  const s=new Date(e.start),f=new Date(e.end);if(!finite(+s)||!finite(+f))continue;
  for(let m=s.getUTCMonth(),k=0;k<12;k++,m=(m+1)%12){months.add(m+1);if(m===f.getUTCMonth())break;}
 }
 return months.size?[...months]:SOLAR_POLICY.harvestMonths;
}
// Day-of-year drives the geometry, so all sampled days use the current IST year.
export function solarBasisDays(basis,now,calendar){
 const today=isoDateIST(now),year=Number(today.slice(0,4));
 if(basis==='annual')return {days:Array.from({length:12},(_,m)=>monthDays(year,m+1,[1,15])).flat(),reference:[`${year}-06-21`,`${year}-12-21`],label:`Annual mean · ${SOLAR_POLICY.annualDays} sampled days`};
 if(basis==='harvest'){
  const months=harvestMonths(calendar),days=months.map(m=>monthDays(year,m,[1,11,21])).flat(),names=months.map(m=>new Date(Date.UTC(2000,m-1,1)).toLocaleString('en',{month:'short',timeZone:'UTC'}));
  return {days,reference:[days[Math.floor(days.length/2)]],label:`Harvest-month mean · ${names.join(', ')}`};
 }
 return {days:[today],reference:[today],label:`Today · ${today}`};
}
// Kasten-Young air mass with a Meinel clear-sky attenuation. An indicative clear-sky
// direct-beam value only; it does not represent observed irradiance at the estate.
function clearSkyDirect(altitude){const am=1/(Math.sin(altitude*RAD)+.50572*Math.pow(altitude+6.07995,-1.6364));return 1353*Math.pow(.7,Math.pow(am,.678));}
const exposureCache=new WeakMap();
export function solarExposure(dem,{basis='today',now=Date.now(),calendar=null}={}){
 if(!dem?.cells?.length||!dem.bounds||!dem.width||!dem.height)return null;
 const chosen=SOLAR_BASES[basis]?basis:'today',plan=solarBasisDays(chosen,now,calendar),key=`${chosen}|${plan.days.join(',')}`;
 if(!exposureCache.has(dem))exposureCache.set(dem,new Map());
 const memo=exposureCache.get(dem);if(memo.has(key))return memo.get(key);
 const {lat}=cellSize(dem),lon=(dem.bounds.east+dem.bounds.west)/2,geometry=slopeAspect(dem),horizon=horizons(dem),bins=SOLAR_POLICY.horizonBins,dt=SOLAR_POLICY.stepMinutes/60;
 const totals=new Map(dem.cells.filter(c=>geometry.has(c.i)).map(c=>[c.i,{direct:0,morning:0,flat:0,sunHours:0,shadedHours:0,kwh:0,flatKwh:0}]));
 for(const day of plan.days){
  const start=Date.parse(day+'T00:00:00+05:30');
  for(let t=start;t<start+DAY;t+=SOLAR_POLICY.stepMinutes*60000){
   const sun=sunPosition(t,lat,lon);if(sun.altitude<=0)continue;
   const sinAlt=Math.sin(sun.altitude*RAD),cosAlt=Math.cos(sun.altitude*RAD),beam=clearSkyDirect(sun.altitude)*dt/1000,bin=Math.floor(sun.azimuth/360*bins)%bins;
   for(const [i,total] of totals){
    total.flat+=sinAlt*dt;total.flatKwh+=beam*sinAlt;
    const g=geometry.get(i),s=g.slope*RAD,cosI=g.aspect===null?sinAlt:Math.cos(s)*sinAlt+Math.sin(s)*cosAlt*Math.cos((sun.azimuth-g.aspect)*RAD);
    if(cosI<=0)continue;
    if(sun.altitude<horizon.get(i)[bin]){total.shadedHours+=dt;continue;}
    total.direct+=cosI*dt;total.kwh+=beam*cosI;total.sunHours+=dt;if(sun.hourAngle<0)total.morning+=cosI*dt;
   }
  }
 }
 const n=Math.max(1,plan.days.length);
 const cells=dem.cells.map(c=>{
  const t=totals.get(c.i),g=geometry.get(c.i);
  if(!t)return {...c,slope:null,aspect:null,aspectLabel:null,relative:null,morningShare:null,sunHours:null,shadedHours:null,directKwh:null,flatKwh:null};
  return {...c,slope:g.slope,aspect:g.aspect,aspectLabel:g.aspect===null?'Level':compass8(g.aspect)+'-facing',relative:t.flat>0?+(t.direct/t.flat).toFixed(3):null,morningShare:t.direct>0?+(t.morning/t.direct).toFixed(3):null,sunHours:+(t.sunHours/n).toFixed(2),shadedHours:+(t.shadedHours/n).toFixed(2),directKwh:+(t.kwh/n).toFixed(2),flatKwh:+(t.flatKwh/n).toFixed(2)};
 });
 const values=cells.filter(c=>c.zoneId&&finite(c.relative)).map(c=>c.relative);
 const result={bounds:dem.bounds,width:dem.width,height:dem.height,resolution:dem.resolution,basis:chosen,label:plan.label,days:plan.days.length,paths:plan.reference.map((d,k)=>({...sunPath(d,lat,lon),color:k?'#9fc7e8':'#f6d365'})),cells,min:values.length?Math.min(...values):null,max:values.length?Math.max(...values):null,range:values.length?Math.max(...values)-Math.min(...values):0,version:SOLAR_VERSION,method:'Clear-sky direct-beam geometry on the Copernicus 30 m surface: Horn slope / aspect, NOAA sun positions every 10 minutes and cast-shadow horizons walked across the same canopy-inclusive surface. Relative exposure divides the tilted, horizon-shaded direct beam by the flat unshaded beam at the same place. No cloud, diffuse-light, shade-tree or coffee-canopy modelling; not a light survey.'};
 memo.set(key,result);return result;
}
// Daily radiation at one cell over past days: the farm-scale modelled series projected
// onto this cell's slope and aspect hour by hour, with its terrain horizon, plus diffuse
// light through an isotropic sky-view factor. The weather part is shared across the
// farm; only the terrain factor is local. Nothing here is measured at the point.
export function pointRadiationSeries(dem,cell,history,now=Date.now(),{start=null}={}){
 if(!dem?.cells||!cell||!history?.hours?.length)return null;
 // Hours arrive as objects from the radiation route or as compact [seconds, DNI, DHI, GHI]
 // arrays from the season history; both describe the mean over the hour ending at the time.
 history={...history,hours:history.hours.map(h=>Array.isArray(h)?{time:h[0]*1000,dniWm2:h[1],diffuseWm2:h[2],globalWm2:h[3],cloud:null}:h)};
 const g=slopeAspect(dem).get(cell.i),hz=horizons(dem).get(cell.i);if(!g||!hz)return null;
 const {lat}=cellSize(dem),lon=(dem.bounds.east+dem.bounds.west)/2,s=g.slope*RAD,skyView=(1+Math.cos(s))/2,bins=SOLAR_POLICY.horizonBins,today=isoDateIST(now),days=new Map();
 for(const h of [...history.hours].sort((a,b)=>a.time-b.time)){
  const mid=h.time-1800000,sun=sunPosition(mid,lat,lon),date=isoDateIST(mid);
  const day=days.get(date)??{date,direct:0,diffuse:0,flat:0,clearDirect:0,cloud:[],hours:0};days.set(date,day);
  day.hours++;day.flat+=h.globalWm2/1000;day.diffuse+=h.diffuseWm2*skyView/1000;if(finite(h.cloud))day.cloud.push(h.cloud);
  if(sun.altitude<=0)continue;
  const cosI=g.aspect===null?Math.sin(sun.altitude*RAD):Math.cos(s)*Math.sin(sun.altitude*RAD)+Math.sin(s)*Math.cos(sun.altitude*RAD)*Math.cos((sun.azimuth-g.aspect)*RAD);
  if(cosI<=0||sun.altitude<hz[Math.floor(sun.azimuth/360*bins)%bins])continue;
  day.direct+=h.dniWm2*cosI/1000;day.clearDirect+=clearSkyDirect(sun.altitude)*cosI/1000;
 }
 const rows=[...days.values()].map(d=>({date:d.date,direct:+d.direct.toFixed(2),diffuse:+d.diffuse.toFixed(2),total:+(d.direct+d.diffuse).toFixed(2),flat:+d.flat.toFixed(2),clearDirect:+d.clearDirect.toFixed(2),cloud:d.cloud.length?Math.round(d.cloud.reduce((a,b)=>a+b,0)/d.cloud.length):null,hours:d.hours,partial:d.hours<24||d.date===today}));
 // Drop the fragment of the day before the first complete day; keep today's partial day at the end.
 const firstComplete=rows.findIndex(r=>!r.partial);if(firstComplete>0)rows.splice(0,firstComplete);
 if(start)rows.splice(0,rows.findIndex(r=>r.date>=start)<0?rows.length:rows.findIndex(r=>r.date>=start));
 const complete=rows.filter(r=>!r.partial),mean=a=>a.length?a.reduce((n,r)=>n+r.total,0)/a.length:null,recent=mean(complete.slice(-7)),earlier=mean(complete.slice(-14,-7));
 const deltaPct=finite(recent)&&finite(earlier)&&earlier>0?Math.round((recent-earlier)/earlier*100):null;
 // Season-to-date totals from the first row (or the requested start) to the last complete day,
 // with weekly sums for a compact chart. Potential is the clear-sky beam plus the modelled diffuse.
 const origin=start??rows[0]?.date??null,originMs=origin?Date.parse(origin+'T00:00:00+05:30'):null,weeks=new Map();
 for(const r of complete){const k=originMs?Math.floor((Date.parse(r.date+'T00:00:00+05:30')-originMs)/(7*DAY)):0,w=weeks.get(k)??{week:k+1,from:originMs?isoDateIST(originMs+k*7*DAY):r.date,days:0,totalKwh:0,flatKwh:0};weeks.set(k,w);w.days++;w.totalKwh+=r.total;w.flatKwh+=r.flat;}
 const totalKwh=+complete.reduce((n,r)=>n+r.total,0).toFixed(2),flatKwh=+complete.reduce((n,r)=>n+r.flat,0).toFixed(2),potentialKwh=+complete.reduce((n,r)=>n+r.clearDirect+r.diffuse,0).toFixed(2);
 return {rows,completeDays:complete.length,mean:mean(complete),recent,earlier,deltaPct,trend:deltaPct===null?'insufficient':Math.abs(deltaPct)<5?'steady':deltaPct>0?'rising':'falling',latest:complete.at(-1)??null,start:origin,totalKwh,flatKwh,potentialKwh,shareOfFlat:flatKwh>0?+(totalKwh/flatKwh).toFixed(3):null,shareOfPotential:potentialKwh>0?+(totalKwh/potentialKwh).toFixed(3):null,weeks:[...weeks.values()].sort((a,b)=>a.week-b.week).map(w=>({...w,totalKwh:+w.totalKwh.toFixed(2),flatKwh:+w.flatKwh.toFixed(2)})),slope:g.slope,aspect:g.aspect,skyView:+skyView.toFixed(3),source:history.source,modelLocation:history.modelLocation??null,retrievedAt:history.retrievedAt??null,checkedAt:history.checkedAt??null,stale:history.stale===true};
}
// Pair located cherry Brix / ripeness records with the modelled exposure of their cell so
// the estate can test, rather than assume, how exposure relates to its own grading results.
export function exposureOfRecords(solar,records=[]){
 return records.filter(r=>r.point&&r.conditions&&(finite(r.conditions.cherryBrix)||(r.conditions.harvestGrade&&r.conditions.harvestGrade!=='unknown'))).map(r=>{
  const c=solar?gridCell(solar,r.point.lon,r.point.lat):null;
  return {recordId:r.id,date:r.date,zoneId:r.zoneId,brix:finite(r.conditions.cherryBrix)?r.conditions.cherryBrix:null,grade:r.conditions.harvestGrade&&r.conditions.harvestGrade!=='unknown'?r.conditions.harvestGrade:null,relative:finite(c?.relative)?c.relative:null,aspectLabel:c?.aspectLabel??null,slope:finite(c?.slope)?c.slope:null,point:r.point};
 }).sort((a,b)=>(b.relative??-1)-(a.relative??-1)||b.date.localeCompare(a.date));
}
// Most- and least-exposed cells interleaved so a spread selection contrasts both ends.
export function exposureContrast(solar,zoneId){
 const cells=(solar?.cells||[]).filter(c=>c.zoneId===zoneId&&finite(c.relative));
 if(!cells.length||solar.range<SOLAR_POLICY.contrast)return {sunny:[],shaded:[],ordered:[],contrast:false};
 const sunny=[...cells].sort((a,b)=>b.relative-a.relative||b.directKwh-a.directKwh||a.i-b.i),shaded=[...sunny].reverse(),ordered=[];
 for(let k=0;k<sunny.length;k++)for(const [c,rank] of [[sunny[k],'high'],[shaded[k],'low']])if(!ordered.some(o=>o.i===c.i))ordered.push({...c,exposureRank:rank});
 return {sunny,shaded,ordered,contrast:true};
}
