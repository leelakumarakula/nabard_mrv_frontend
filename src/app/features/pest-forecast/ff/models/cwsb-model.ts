// @ts-nocheck
// Ported unchanged from Coffee-estate-twin/public/cwsb-model.js. Keep the logic byte-identical: the Node
// test suites and the Python backend parity test run against the original module.
// Environmental exposure engine. The reference implementation is a port of the estate's Google
// Earth Engine script "CWSB Environmental Exposure Model - Baseline V5" (Kundur Hilltop Farm);
// the other topics reuse its structure with their own components and phase calendars. Every
// map marks where conditions associated with a pest, disease or stress coincide. None detects.
//
// Composites stay fixed to the last complete hot / dry season so the structural susceptibility
// pattern does not jump month to month; only the phase label and the sunlight date follow the
// viewing month. Components are normalised P10–P90 against a 250 m context, gaps take the
// context median, components are averaged with equal weights and the result is displayed
// relative to the farm's own P10–P90. No component weight is assigned by hand.
import { sunPosition, slopeAspect } from './solar-model';
import { gridCell } from './terrain-overlay';
import { isoDateIST } from './farm-model';
import { drainageScreen } from './hydrology';

export const CWSB_VERSION='cwsb-exposure-2026-09-v5-port';
export const EXPOSURE_VERSION='coffee-exposure-2026-09-v1';
export const CWSB_POLICY={
 hours:[6,7,8,9,10,11,12,13,14,15,16,17,18],
 // Observed hourly adult emergence counts supplied with the baseline model. They weight terrain
 // sunlight by time of day; they are not infestation probabilities.
 winterEmergence:[0,3.33,34,64,82.33,114,64.33,19,34.67,51.33,62.33,8.67,0],
 summerEmergence:[0,0,18,33.67,48.67,69,37,10,17.33,26,37.67,4.67,0],
 summerDate:'05-01',winterDate:'11-15',
 window:{start:'02-01',end:'06-01'},contextBufferM:250,percentiles:[10,90],
 fallback:{ndvi:[.2,.9],lstC:[15,40],solar:[0,1],twi:[2,14]},smoothM:{shade:10,heat:25,solar:20,final:15},
 palette:['#ffffff','#f7f8f4','#fffde8','#fff8ce','#fff0a5','#ffdf72','#f8c653','#eeab40','#df8e30']
};
const finite=Number.isFinite,RAD=Math.PI/180;
export function lifecyclePhase(month){
 if(month===3)return {key:'pre-summer',label:'BEFORE THE SUMMER FLIGHT',message:'Check stems now. The beetles fly in April and May.',preFlight:true,adultFlight:false,solarSeason:'summer',layerName:'CWSB pre-flight tracing priority'};
 if(month===4||month===5)return {key:'summer-flight',label:'SUMMER ADULT FLIGHT',message:'Beetles come out, mate and lay eggs.',preFlight:false,adultFlight:true,solarSeason:'summer',layerName:'CWSB adult-flight scouting priority'};
 if(month===9)return {key:'pre-winter',label:'BEFORE THE WINTER FLIGHT',message:'Check stems now. The beetles fly from October to December.',preFlight:true,adultFlight:false,solarSeason:'winter',layerName:'CWSB pre-flight tracing priority'};
 if(month>=10&&month<=12)return {key:'winter-flight',label:'WINTER ADULT FLIGHT',message:'Beetles come out, mate and lay eggs.',preFlight:false,adultFlight:true,solarSeason:'winter',layerName:'CWSB adult-flight scouting priority'};
 return {key:'susceptibility',label:'LOW FLIGHT SEASON',message:'Few beetles fly now. Grubs may still be inside stems.',preFlight:false,adultFlight:false,solarSeason:'annual',layerName:'CWSB environmental susceptibility'};
}
const monthPhase=(rules,fallback)=>month=>rules.find(r=>r.months.includes(month))?.phase??fallback;
const C={
 heat:{key:'heat',source:'lst',direction:1,label:'Heat',note:'Hotter median surface temperature.'},
 cool:{key:'cool',source:'lst',direction:-1,label:'Cooler surface',note:'Cooler median surface temperature.'},
 openness:{key:'shade',source:'ndvi',direction:-1,label:'Tree cover openness',note:'Sparser leaf cover (lower NDVI).'},
 canopy:{key:'canopy',source:'ndvi',direction:1,label:'Tree cover density',note:'Denser leaf cover (higher NDVI) dries more slowly and casts shade.'},
 emergenceSun:{key:'solar',source:'solar',profile:'emergence',direction:1,label:'Emergence-hour sunlight',note:'Terrain sunlight weighted by observed hourly adult emergence.'},
 sun:{key:'sun',source:'solar',profile:'daytime',direction:1,label:'Daytime sunlight',note:'Terrain sunlight, 06:00–18:00 IST, equal weights.'},
 lowSun:{key:'lowSun',source:'solar',profile:'daytime',direction:-1,label:'Low daytime sunlight',note:'Less terrain sunlight through the day.'},
 wet:{key:'wet',source:'twi',direction:1,label:'Terrain wetness',note:'Topographic wetness index from the surface model (flow accumulation over slope).'},
 low:{key:'low',source:'elevation',direction:-1,label:'Low-lying ground',note:'Lower relative elevation within the 250 m context.'}
};
// Topic definitions. Phase calendars follow the existing screening rules; components state the
// direction in which each environmental factor raises exposure for that topic.
export const EXPOSURE_TOPICS={
 cwsb:{title:'White stem borer',alertTopic:'wsb',version:CWSB_VERSION,basis:'Port of the estate’s Earth Engine script “CWSB Environmental Exposure Model – Baseline V5”: heat, open shade and emergence-weighted terrain sunlight.',components:[C.heat,C.openness,C.emergenceSun],phase:lifecyclePhase},
 rust:{title:'Leaf rust',alertTopic:'rust',basis:'By analogy with the CWSB baseline, from published rust ecology: infection needs prolonged leaf wetness at moderate temperatures, favoured by dense, slow-drying, shaded and wet locations.',components:[C.canopy,C.cool,C.lowSun,C.wet],
  phase:monthPhase([{months:[6,7,8,9],phase:{key:'buildup',label:'MONSOON RUST BUILD-UP',message:'Wet leaves can get infected. Check dense, cool places that dry slowly.',solarDate:'08-01'}},{months:[10,11,12],phase:{key:'peak',label:'POST-MONSOON RUST PEAK',message:'Most leaves fall now. Check the marked spots for rust.',solarDate:'11-01'}},{months:[1,2],phase:{key:'carryover',label:'POST-HARVEST CARRY-OVER',message:'Infected leaves left on the plant can start rust again next season.',solarDate:'01-15'}}],{key:'dry',label:'DRY-SEASON LOW',message:'Low risk of rust now. Only the shape of the land matters.',solarDate:'04-15'})},
 blackrot:{title:'Black rot / koleroga',alertTopic:'blackrot',basis:'Koleroga follows persistently wet leaves and mist in dense, low-lying, poorly ventilated shade during heavy monsoon rain.',components:[C.canopy,C.wet,C.lowSun,C.low],
  phase:monthPhase([{months:[6,7,8,9],phase:{key:'wet',label:'MONSOON WET LEAVES WATCH',message:'Black rot spreads in long rain and mist.',solarDate:'07-15'}}],{key:'structure',label:'LAND SHAPE ONLY',message:'Low risk now. The map shows where bushes stay wet and dense.',solarDate:'02-15'})},
 berryborer:{title:'Coffee berry borer',alertTopic:'berryborer',basis:'Berry borer populations build in warm, shaded, humid plots while berries are available; the screen combines heat, shade and low-lying ground.',components:[C.heat,{...C.canopy,label:'Tree cover density (shade)'},C.low],
  phase:monthPhase([{months:[6,7,8],phase:{key:'green',label:'GREEN CHERRY GROWTH',message:'Borers start to enter the growing cherries.',solarDate:'07-15'}},{months:[9,10,11],phase:{key:'ripening',label:'RIPENING · BORERS INCREASE',message:'Borers increase in ripening cherries. Check cherry tips at the marked spots.',solarDate:'10-15'}},{months:[12,1,2,3],phase:{key:'harvest',label:'HARVEST · CLEAR OLD CHERRIES',message:'Pick off and remove old cherries. The next borers breed in them.',solarDate:'12-15'}}],{key:'offseason',label:'OFF-SEASON OLD CHERRIES',message:'Borers live on in old cherries on the plants and the ground.',solarDate:'04-01'})},
 shothole:{title:'Shot-hole borer',alertTopic:'shothole',basis:'Shot-hole borer and its ambrosia fungus favour humid, heavily shaded Robusta with tender twigs.',components:[C.canopy,C.lowSun,C.wet],
  phase:monthPhase([{months:[9,10,11,12,1,2,3,4],phase:{key:'watch',label:'BORER SEASON',message:'September to January is the main season. Check soft twigs at the marked spots.',solarDate:'11-01'}}],{key:'structure',label:'LAND SHAPE ONLY',message:'Not the main season. The map shows humid, shaded spots.',solarDate:'05-01'})},
 mealybug:{title:'Mealybugs and scale insects',alertTopic:'mealybug',basis:'Mealybug colonies build in warm, dry, dusty, exposed conditions with intermittent moisture and ant attendance.',components:[C.heat,C.openness,C.sun],
  phase:monthPhase([{months:[2,3,4,5],phase:{key:'dry',label:'DRY SEASON COLONIES GROW',message:'Warm, dry weather helps mealybugs. Check clusters with ants.',solarDate:'04-01'}},{months:[6,7,8,9],phase:{key:'monsoon',label:'MONSOON FEWER MEALYBUGS',message:'Heavy rain keeps mealybugs down. The map shows where they come back.',solarDate:'08-01'}}],{key:'post',label:'POST-MONSOON WATCH',message:'Mealybugs come back as the rain eases.',solarDate:'11-15'})},
 root:{title:'Root health',alertTopic:'root',basis:'Waterlogging and root-contact diseases follow converging, low, poorly drained ground under dense leaf cover.',components:[C.wet,C.low,C.canopy],
  phase:monthPhase([{months:[6,7,8,9],phase:{key:'waterlogging',label:'WATERLOGGING RISK',message:'Soil is soaked in low ground. Check wilting plants and drains.',solarDate:'08-01'}},{months:[10,11],phase:{key:'saturated',label:'AFTER MONSOON SOAKED SOIL',message:'Low ground stays soaked after the rains.',solarDate:'10-15'}}],{key:'structure',label:'LAND SHAPE ONLY',message:'Dry months. The map shows where water would collect.',solarDate:'03-01'})},
 heat:{title:'Heat and dry plants',alertTopic:'heat',basis:'Heat and water stress concentrate on hot, open, sunlit ground.',components:[C.heat,C.openness,C.sun],
  phase:monthPhase([{months:[3,4,5],phase:{key:'peak',label:'PEAK HEAT · DRY PLANTS',message:'Hottest, driest months. Check rows in full sun and young plants.',solarDate:'04-15'}},{months:[2,6],phase:{key:'shoulder',label:'HEAT BUILDING OR EASING',message:'Getting warmer or cooler.',solarDate:'03-01'}}],{key:'low',label:'LOW HEAT PERIOD',message:'Cooler or wet months. Only open, sunny spots matter.',solarDate:'10-15'})},
 canopy:{title:'Shade and pruning',alertTopic:'canopy',basis:'Slow-drying, crowded leaf cover shows as dense, shaded, wet structure; the screen supports where to measure shade and crowding.',components:[C.canopy,C.lowSun,C.wet],
  phase:monthPhase([{months:[6,7,8,9],phase:{key:'wet',label:'WET-SEASON SLOW DRYING',message:'Crowded bushes dry slowly in the rains.',solarDate:'08-01'}},{months:[12,1,2],phase:{key:'pruning',label:'POST-HARVEST PRUNING WINDOW',message:'Finish harvest before heavy pruning.',solarDate:'01-15'}}],{key:'review',label:'SHADE AND PRUNING CHECK',message:'Check the shade and how crowded the bushes are.',solarDate:'04-15'})}
};
export function normalizeWeights(values){const total=values.reduce((a,b)=>a+b,0);return values.map(v=>total>0?v/total:0);}
// The hot / dry season window that anchors the composites. From June the current year's window
// is complete; before that the previous year's is used so the pattern does not jump monthly.
export function environmentalWindow(now=Date.now()){const today=isoDateIST(now),year=Number(today.slice(0,4))-(Number(today.slice(5,7))<6?1:0);return {year,start:`${year}-${CWSB_POLICY.window.start}`,end:`${year}-${CWSB_POLICY.window.end}`};}
// Lambertian terrain illumination (the hillshade formula) at each hour, weighted by that hour's
// share. Raw 0–1 per DEM cell; cast shadows are not included, as in the baseline script.
export function terrainSolar(dem,{date,weights,lat,lon}){
 const geometry=slopeAspect(dem),out=new Map();
 const hourly=CWSB_POLICY.hours.map((h,i)=>({h,w:weights[i]??0})).filter(x=>x.w>0).map(x=>({...x,sun:sunPosition(Date.parse(`${date}T${String(x.h).padStart(2,'0')}:00:00+05:30`),lat,lon)})).filter(x=>x.sun.altitude>0);
 for(const c of dem.cells){const g=geometry.get(c.i);if(!g)continue;const s=g.slope*RAD;let sum=0;for(const {w,sun} of hourly){const alt=sun.altitude*RAD,cosI=g.aspect===null?Math.sin(alt):Math.cos(s)*Math.sin(alt)+Math.sin(s)*Math.cos(alt)*Math.cos((sun.azimuth-g.aspect)*RAD);sum+=w*Math.max(0,cosI);}out.set(c.i,sum);}
 return out;
}
export function percentileRange(values,fallback,percentiles=CWSB_POLICY.percentiles){
 const v=values.filter(finite).sort((a,b)=>a-b);if(!v.length)return {low:fallback?.[0]??0,high:fallback?.[1]??1,fromData:false};
 const at=p=>v[Math.min(v.length-1,Math.max(0,Math.round(p/100*(v.length-1))))];return {low:at(percentiles[0]),high:at(percentiles[1]),fromData:true};
}
export const normaliser=({low,high})=>{const range=Math.max(high-low,1e-4);return v=>finite(v)?Math.min(1,Math.max(0,(v-low)/range)):null;};
const median=values=>{const v=values.filter(finite).sort((a,b)=>a-b);return v.length?(v.length%2?v[(v.length-1)/2]:(v[v.length/2-1]+v[v.length/2])/2):null;};
// Circular focal mean by cell distance. A radius under half a cell is the identity, which is
// what the baseline's 10–25 m radii amount to on 20–100 m analysis cells.
export function focalMean(grid,values,radiusM){
 const res=grid.resolution||20,r=radiusM/res;if(!(r>=.5))return values;
 const out=new Map(),reach=Math.ceil(r);
 for(const c of grid.cells){let sum=0,n=0;for(let dr=-reach;dr<=reach;dr++)for(let dc=-reach;dc<=reach;dc++){if(Math.hypot(dr,dc)>r)continue;const row=c.row+dr,col=c.col+dc;if(row<0||row>=grid.height||col<0||col>=grid.width)continue;const v=values.get(row*grid.width+col);if(finite(v)){sum+=v;n++;}}out.set(c.i,n?sum/n:(values.get(c.i)??null));}
 return out;
}
export function displayColour(display){if(!finite(display))return '#35443e';const p=CWSB_POLICY.palette;return p[Math.min(p.length-1,Math.max(0,Math.round(display*(p.length-1))))];}
const uniformWeights=CWSB_POLICY.hours.map(()=>1/CWSB_POLICY.hours.length);
// Combine on the 20 m canopy grid (or the DEM grid when no canopy composite exists). Heat,
// sunlight, wetness and elevation are sampled at each cell centre; a missing value takes its
// context median, as the baseline's gap fill does. Display is relative to the farm's P10–P90.
export function exposureModel({data,topic='cwsb',now=Date.now()}){
 const def=EXPOSURE_TOPICS[topic];if(!def||!data)return null;
 const base=data.ndvi?.grid?.cells?.length?data.ndvi.grid:null,dem=data.dem?.cells?.length?data.dem:null,lst=data.lst?.grid?.cells?.length?data.lst.grid:null;
 if(!base&&!dem)return null;
 const today=isoDateIST(now),month=Number(today.slice(5,7)),year=Number(today.slice(0,4)),phase=def.phase(month);
 const grid=base??{bounds:dem.bounds,width:dem.width,height:dem.height,resolution:dem.resolution||30,cells:dem.cells.map(c=>({...c}))};
 const centre={lat:(grid.bounds.north+grid.bounds.south)/2,lon:(grid.bounds.east+grid.bounds.west)/2};
 const solarDates={summer:`${year}-${CWSB_POLICY.summerDate}`,winter:`${year}-${CWSB_POLICY.winterDate}`,daytime:`${year}-${phase.solarDate||'03-21'}`};
 const profiles=new Map();
 const solarProfile=profile=>{
  if(!dem)return null;if(profiles.has(profile))return profiles.get(profile);
  let map;
  if(profile==='emergence'){const s=terrainSolar(dem,{date:solarDates.summer,weights:normalizeWeights(CWSB_POLICY.summerEmergence),...centre}),w=terrainSolar(dem,{date:solarDates.winter,weights:normalizeWeights(CWSB_POLICY.winterEmergence),...centre});map=new Map(dem.cells.map(c=>{const a=s.get(c.i),b=w.get(c.i);return [c.i,finite(a)&&finite(b)?(phase.solarSeason==='summer'?a:phase.solarSeason==='winter'?b:(a+b)/2):null];}));}
  else map=terrainSolar(dem,{date:solarDates.daytime,weights:uniformWeights,...centre});
  profiles.set(profile,map);return map;
 };
 const drainage=dem?drainageScreen(dem):null;
 const sample={
  ndvi:c=>finite(c.ndvi)?c.ndvi:null,
  lst:c=>{const t=lst?gridCell(lst,c.lon,c.lat):null;return finite(t?.surfaceC)?t.surfaceC:null;},
  solar:(c,comp)=>{const m=solarProfile(comp.profile||'daytime'),d=m?gridCell(dem,c.lon,c.lat):null,v=d?m.get(d.i):null;return finite(v)?v:null;},
  twi:c=>{const d=drainage?gridCell(drainage,c.lon,c.lat):null;if(!finite(d?.elevation))return null;return Math.log(Math.max(1,d.accumulation)*drainage.cellAreaM2/Math.tan(Math.max(d.slope,.1)*RAD));},
  elevation:c=>{const d=dem?gridCell(dem,c.lon,c.lat):null;return finite(d?.elevation)?d.elevation:null;}
 };
 const fallback={ndvi:CWSB_POLICY.fallback.ndvi,lst:CWSB_POLICY.fallback.lstC,solar:CWSB_POLICY.fallback.solar,twi:CWSB_POLICY.fallback.twi,elevation:null},smoothKey={ndvi:'shade',lst:'heat',solar:'solar',twi:'solar',elevation:'solar'};
 const fill=map=>{const m=median([...map.values()]);return new Map([...map].map(([i,v])=>[i,finite(v)?v:m]));};
 const components=def.components.map(comp=>{
  const raw=new Map(grid.cells.map(c=>[c.i,sample[comp.source](c,comp)])),available=[...raw.values()].some(finite),filled=fill(raw);
  const range=percentileRange([...filled.values()],fallback[comp.source]),norm=normaliser(range);
  const scored=focalMean(grid,new Map([...filled].map(([i,v])=>[i,finite(v)?(comp.direction<0?1-norm(v):norm(v)):null])),CWSB_POLICY.smoothM[smoothKey[comp.source]]);
  return {...comp,available,range,raw,scored};
 });
 const combined=new Map(grid.cells.map(c=>{const parts=components.filter(k=>k.available).map(k=>k.scored.get(c.i)).filter(finite);return [c.i,parts.length?parts.reduce((a,b)=>a+b,0)/parts.length:null];}));
 const smoothed=focalMean(grid,combined,CWSB_POLICY.smoothM.final);
 const display=percentileRange(grid.cells.filter(c=>c.zoneId).map(c=>smoothed.get(c.i)),[0,1]),toDisplay=normaliser(display);
 const cells=grid.cells.map(c=>{const parts={},raws={};for(const k of components){parts[k.key]=k.scored.get(c.i)??null;raws[k.key]=k.raw.get(c.i)??null;}return {...c,...parts,parts,raws,exposure:smoothed.get(c.i)??null,display:c.zoneId&&finite(smoothed.get(c.i))?toDisplay(smoothed.get(c.i)):null};});
 return {version:def.version||EXPOSURE_VERSION,topic,title:def.title,alertTopic:def.alertTopic||topic,basis:def.basis,phase,window:data.window??null,components:components.map(({key,label,note,direction,source,profile,available,range})=>({key,label,note,direction,source,profile:profile||null,available,range})),available:Object.fromEntries(components.map(k=>[k.key,k.available])),ranges:{display},solarDates,grid:{bounds:grid.bounds,width:grid.width,height:grid.height,resolution:grid.resolution,cells},scenes:{ndvi:data.ndvi?.scenes?.length??0,lst:data.lst?.scenes?.length??0},unavailable:data.unavailable??{},method:`Equal mean of ${components.length} components (${components.map(k=>k.label.toLowerCase()).join(', ')}), each normalised P10–P90 against a 250 m context and gap-filled with its context median; displayed relative to the farm (P10–P90). Environmental coincidence only; not a detection.`};
}
export const cwsbExposure=({data,now=Date.now()})=>exposureModel({data,topic:'cwsb',now});
// Angular port addition: an exposure map is a pure function of the composites, the topic and the IST
// month (phase calendar, sun-path dates), and costs a few hundred milliseconds; every redraw of the
// plan and the field map asked for it again. Kept per composites object, so a new download replaces it.
const exposureCache=new WeakMap();
export function cachedExposureModel({data,topic='cwsb',now=Date.now()}){
 if(!data||typeof data!=='object')return exposureModel({data,topic,now});
 const key=topic+'|'+isoDateIST(now).slice(0,7);let byKey=exposureCache.get(data);if(!byKey){byKey=new Map();exposureCache.set(data,byKey);}
 if(!byKey.has(key))byKey.set(key,exposureModel({data,topic,now}));return byKey.get(key);
}

// ---- Seasonal composite layers ------------------------------------------------------------
// Cloud-robust views of the same hot / dry season composites: per-cell medians of NDVI, NDMI
// and surface temperature, a terrain wetness index from the buffered surface model, and the
// anomaly of the latest clear scene against the seasonal NDVI median. Values are what the
// composite holds; nothing is interpolated under cloud.
export const COMPOSITE_KINDS={
 sndvi:{source:'ndvi',key:'ndvi',title:'Canopy greenness · seasonal median',unit:''},
 sndmi:{source:'ndvi',key:'ndmi',title:'Canopy moisture index · seasonal median',unit:''},
 slst:{source:'lst',key:'surfaceC',title:'Surface temperature · seasonal median',unit:' °C'},
 twi:{source:'dem',key:'twi',title:'Terrain wetness index · DSM',unit:''},
 anomaly:{source:'anomaly',key:'anomaly',title:'Canopy anomaly · latest scene vs seasonal median',unit:''}
};
export const ANOMALY_MIN_OBS=3;
export function wetnessIndex(dem){
 if(!dem?.cells?.length)return null;const drainage=drainageScreen(dem);if(!drainage)return null;
 return {...drainage,cells:drainage.cells.map(c=>({...c,twi:finite(c.elevation)?+Math.log(Math.max(1,c.accumulation)*drainage.cellAreaM2/Math.tan(Math.max(c.slope,.1)*RAD)).toFixed(3):null}))};
}
export function compositeLayer(data,kind,{satellite=null,eligibleZones=null}={}){
 const def=COMPOSITE_KINDS[kind];if(!def||!data)return null;
 let grid=null,extra={};
 if(def.source==='ndvi'){if(!data.ndvi?.grid?.cells?.length)return null;grid=data.ndvi.grid;extra={scenes:data.ndvi.scenes?.length??0};}
 else if(def.source==='lst'){
  if(!data.lst?.grid?.cells?.length)return null;
  // Sample the 100 m medians onto the 20 m canopy grid when it exists, so a farm smaller than
  // one thermal cell still receives the value of the cell it lies in.
  grid=data.ndvi?.grid?.cells?.length?{...data.ndvi.grid,cells:data.ndvi.grid.cells.map(c=>{const t=gridCell(data.lst.grid,c.lon,c.lat);return {...c,surfaceC:finite(t?.surfaceC)?t.surfaceC:null,n:t?.n??0};})}:data.lst.grid;
  extra={scenes:data.lst.scenes?.length??0,nativeResolution:data.lst.grid.resolution||100};
 }
 else if(def.source==='dem'){grid=wetnessIndex(data.dem);if(!grid)return null;}
 else{
  const current=satellite?.current;if(!current?.cells?.length||!data.ndvi?.grid?.cells?.length)return null;
  const cells=current.cells.map(c=>{const m=gridCell(data.ndvi.grid,c.lon,c.lat),usable=c.clear&&finite(c.ndvi)&&finite(m?.ndvi)&&(m.n??0)>=ANOMALY_MIN_OBS&&(!eligibleZones||eligibleZones.get(c.zoneId));return {...c,medianNdvi:finite(m?.ndvi)?m.ndvi:null,n:m?.n??0,anomaly:usable?+(c.ndvi-m.ndvi).toFixed(4):null};});
  grid={bounds:current.bounds,width:current.width,height:current.height,resolution:current.resolution||20,cells};extra={acquiredAt:current.acquiredAt,scenes:data.ndvi.scenes?.length??0,minObservations:ANOMALY_MIN_OBS};
 }
 const values=grid.cells.filter(c=>c.zoneId&&finite(c[def.key])).map(c=>c[def.key]);
 const stats=values.length?{min:Math.min(...values),max:Math.max(...values),mean:values.reduce((a,b)=>a+b,0)/values.length,count:values.length}:{min:null,max:null,mean:null,count:0};
 const method=def.source==='anomaly'?`Latest clear Sentinel-2 NDVI minus the per-cell seasonal median, for cells with at least ${ANOMALY_MIN_OBS} clear observations in the composite. A decline is a reason to inspect, not a cause.`:def.source==='dem'?'ln(contributing area / tan slope) from D8 routing on the Copernicus 30 m surface, which includes canopy: a relative wetness cue, not measured soil water.':'Per-cell median of clear observations over the hot / dry season window; cloud is handled by the median, not by one chosen scene.';
 return {kind,title:def.title,key:def.key,unit:def.unit,grid,stats,window:data.window??null,...extra,method};
}
