// @ts-nocheck
// Ported unchanged from Coffee-estate-twin/public/radar-model.js. Keep the logic byte-identical: the Node
// test suites and the Python backend parity test run against the original module.
// Sentinel-1 radar (C-band, terrain-corrected gamma0 backscatter) as an all-weather cue.
// Radar measures structure and water content, not greenness, and single pixels are speckled,
// so values are averaged over a window in linear power before conversion to decibels and
// only scenes from one viewing geometry (relative orbit) are compared. A change is a reason
// to inspect; it does not say why anything changed and detects no pest or disease.
export const RADAR_VERSION='coffee-radar-2026-09-v1';
export const RADAR_POLICY={windowDays:90,maxScenes:8,minReference:2,speckleCells:1,changeDb:2,smallDb:1,wetDb:1.5,gridResolution:20,paddingM:60};
const finite=Number.isFinite;
export const toDb=v=>finite(v)&&v>0?10*Math.log10(v):null;
// Mean of linear power over a (2r+1)² window, ignoring masked / non-positive cells.
export function speckleMean(values,width,height,radius=RADAR_POLICY.speckleCells){
 const out=new Float64Array(values.length).fill(NaN);
 for(let row=0;row<height;row++)for(let col=0;col<width;col++){let sum=0,n=0;for(let dr=-radius;dr<=radius;dr++){const r=row+dr;if(r<0||r>=height)continue;for(let dc=-radius;dc<=radius;dc++){const c=col+dc;if(c<0||c>=width)continue;const v=values[r*width+c];if(finite(v)&&v>0){sum+=v;n++;}}}out[row*width+col]=n?sum/n:NaN;}
 return out;
}
const median=a=>{const v=a.filter(finite).sort((x,y)=>x-y);return v.length?(v.length%2?v[(v.length-1)/2]:(v[v.length/2-1]+v[v.length/2])/2):null;};
// Pick the viewing geometry with the most scenes so change is measured like-for-like.
export function chooseOrbit(scenes){
 const groups=new Map();
 for(const s of scenes){const key=`${s.orbitState||'?'}-${s.relativeOrbit??'?'}`;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(s);}
 let best=null;for(const [key,list] of groups){list.sort((a,b)=>Date.parse(b.acquiredAt)-Date.parse(a.acquiredAt));if(!best||list.length>best.list.length||(list.length===best.list.length&&Date.parse(list[0].acquiredAt)>Date.parse(best.list[0].acquiredAt)))best={key,list};}
 return best;
}
// scenes: [{id,acquiredAt,orbitState,relativeOrbit,vvDb:Float64Array|Array,vhDb}] on one grid,
// newest first. The newest scene is compared with the median of the earlier ones.
export function radarChange(scenes,positions){
 if(!scenes?.length)return null;
 const [latest,...earlier]=scenes;const refs=earlier.slice(0,RADAR_POLICY.maxScenes-1);
 const cells=positions.map(p=>{
  const vv=latest.vvDb[p.i],vh=latest.vhDb[p.i],refVv=median(refs.map(s=>s.vvDb[p.i])),refVh=median(refs.map(s=>s.vhDb[p.i])),n=refs.filter(s=>finite(s.vhDb[p.i])).length;
  const ok=finite(vv)&&finite(vh)&&finite(refVv)&&finite(refVh)&&n>=RADAR_POLICY.minReference;
  return {...p,vvDb:finite(vv)?+vv.toFixed(2):null,vhDb:finite(vh)?+vh.toFixed(2):null,refVvDb:finite(refVv)?+refVv.toFixed(2):null,refVhDb:finite(refVh)?+refVh.toFixed(2):null,ratioDb:finite(vv)&&finite(vh)?+(vh-vv).toFixed(2):null,dVh:ok?+(vh-refVh).toFixed(2):null,dVv:ok?+(vv-refVv).toFixed(2):null,refScenes:n};
 });
 const inside=cells.filter(c=>c.zoneId&&finite(c.dVh));
 return {version:RADAR_VERSION,latest:{id:latest.id,acquiredAt:latest.acquiredAt,orbitState:latest.orbitState,relativeOrbit:latest.relativeOrbit},reference:{count:refs.length,from:refs.at(-1)?.acquiredAt??null,to:refs[0]?.acquiredAt??null},cells,coverage:inside.length/Math.max(1,cells.filter(c=>c.zoneId).length),stats:inside.length?{dVh:{min:Math.min(...inside.map(c=>c.dVh)),max:Math.max(...inside.map(c=>c.dVh))},dVv:{min:Math.min(...inside.map(c=>c.dVv)),max:Math.max(...inside.map(c=>c.dVv))}}:null,thresholds:{changeDb:RADAR_POLICY.changeDb,smallDb:RADAR_POLICY.smallDb,wetDb:RADAR_POLICY.wetDb}};
}
export function changeClass(dDb){if(!finite(dDb))return 'none';const a=Math.abs(dDb);return a>=RADAR_POLICY.changeDb?(dDb<0?'drop':'rise'):a>=RADAR_POLICY.smallDb?(dDb<0?'small-drop':'small-rise'):'steady';}
