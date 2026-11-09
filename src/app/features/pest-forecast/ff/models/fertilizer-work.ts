// @ts-nocheck
// Ported unchanged from Coffee-estate-twin/public/fertilizer-work.js. Keep the logic byte-identical: the Node
// test suites and the Python backend parity test run against the original module.
import { gridCell } from './terrain-overlay';
import { pointInZone } from './farm-model';

const finite=Number.isFinite;
const distance=(a,b)=>Math.hypot((a.lon-b.lon)*111320*Math.cos(a.lat*Math.PI/180),(a.lat-b.lat)*111320);

// Areas describe connected eligible analysis cells, not surveyed tree rows or routes.
export function applicationWorkPlan({grid,geometry,zoneId,settings={},method,start,weather,now=Date.now()}){
 const zone=geometry.zones.find(z=>z.id===zoneId);
 const eligible=(grid?.cells||[]).filter(c=>c.zoneId===zoneId&&c.state==='candidate'&&c.planReady&&finite(c.lat)&&finite(c.lon)&&zone&&pointInZone([c.lon,c.lat],zone));
 const byId=new Map(eligible.map(c=>[c.i,c])),remaining=new Set(byId.keys()),areas=[];
 while(remaining.size){
  const first=remaining.values().next().value,queue=[first],cells=[];remaining.delete(first);
  for(let n=0;n<queue.length;n++){
   const id=queue[n],col=id%grid.width;cells.push(byId.get(id));
   for(const next of [id-grid.width,id+grid.width,...(col>0?[id-1]:[]),...(col<grid.width-1?[id+1]:[])])if(remaining.delete(next))queue.push(next);
  }
  const centre={lon:cells.reduce((n,c)=>n+c.lon,0)/cells.length,lat:cells.reduce((n,c)=>n+c.lat,0)/cells.length};
  // Prefer a less sloping, non-converging surface for the initial proposal. This
  // is a transparent logistics heuristic, never an inference of nutrient demand.
  const ordered=[...cells].sort((a,b)=>Number(a.sink||a.convergence)-Number(b.sink||b.convergence)||(finite(a.slope)?a.slope:Infinity)-(finite(b.slope)?b.slope:Infinity)||distance(a,centre)-distance(b,centre)||a.i-b.i);
  areas.push({cells,point:ordered[0],centre});
 }
 const entry=settings.entryPoint;
 const validEntry=entry?.zoneId===zoneId&&finite(entry.lon)&&finite(entry.lat)&&zone&&pointInZone([entry.lon,entry.lat],zone);
 if(validEntry)for(const area of areas)area.point=[...area.cells].sort((a,b)=>distance(a,entry)-distance(b,entry)||a.i-b.i)[0];
 areas.sort((a,b)=>validEntry?distance(a.point,entry)-distance(b.point,entry):Number(a.point.sink||a.point.convergence)-Number(b.point.sink||b.point.convergence)||(finite(a.point.slope)?a.point.slope:Infinity)-(finite(b.point.slope)?b.point.slope:Infinity)||a.point.i-b.point.i);
 areas.forEach((area,i)=>{area.id=`A${i+1}`;area.point={...area.point,label:area.id,areaId:area.id};});
 const chosen=settings.workStart,cell=chosen?.zoneId===zoneId&&zone&&finite(chosen.lon)&&finite(chosen.lat)&&pointInZone([chosen.lon,chosen.lat],zone)?gridCell(grid,chosen.lon,chosen.lat):null;
 const chosenArea=cell&&areas.find(a=>a.cells.some(c=>c.i===cell.i));
 // The operator must confirm access again for a different period/method or if
 // weather changes. A stale confirmation can never create application clearance.
 const fingerprint=JSON.stringify([method,start,weather?.slot,weather?.rain24Mm]);
 const confirmed=!!(chosenArea&&finite(chosen.confirmedAt)&&now-chosen.confirmedAt>=0&&now-chosen.confirmedAt<=3600000&&chosen.method===method&&chosen.start===start&&chosen.fingerprint===fingerprint);
 const startPoint=chosenArea?{...cell,lat:chosen.lat,lon:chosen.lon,areaId:chosenArea.id,label:confirmed?'START':'START?'}:areas[0]?{...areas[0].point,label:'START?'}:null;
 const pins=areas.map(area=>area.id===startPoint?.areaId?startPoint:area.point);
 const reasons=[...new Set((grid?.cells||[]).filter(c=>c.zoneId===zoneId&&c.state!=='candidate').flatMap(c=>c.reasons||[]))];
 return {areas,pins,startPoint,confirmed,eligibleCells:eligible.length,needsPlan:!(grid?.cells||[]).some(c=>c.zoneId===zoneId&&c.planReady),fingerprint,entry:validEntry?entry:null,reasons,
  startBasis:validEntry?'Nearest eligible cell to your selected access point by straight-line distance. Confirm the actual access path.':'Proposed from an eligible area, preferring less sloping, non-converging surface cells. Access has not been surveyed.',
  scope:'Green areas follow the recorded due nutrient plan and operation checks. They do not measure nutrient deficiency or specify a dose.'};
}
