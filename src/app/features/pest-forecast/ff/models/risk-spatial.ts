// @ts-nocheck
// Ported unchanged from Coffee-estate-twin/public/risk-spatial.js. Keep the logic byte-identical: the Node
// test suites and the Python backend parity test run against the original module.
import { assessRisk, fieldContext, activeInspections } from './risk-model';
import { gridCell, gridIndex, spreadCandidates } from './terrain-overlay';
const finite=Number.isFinite,DAY=86400000;
export function riskSurface({topic,models,satellite,drainage,thermal,now=Date.now()}){
 const base=drainage?.cells?.some(c=>c.zoneId&&finite(c.elevation))?drainage:satellite?.current;
 const byZone=new Map(models.map(m=>[m.zone.id,m])),thermalAge=(now-Date.parse(thermal?.current?.acquiredAt))/DAY;
 const recentThermal=thermalAge>=0&&thermalAge<=7;
 const cells=(base?.cells||[]).map(c=>{
  const m=byZone.get(c.zoneId);if(!m)return {...c,riskLevel:0,reasons:[],gaps:['Outside mapped coffee zones']};
  // Located field observations apply only to their containing analysis cell.
  // They are not broadcast across the zone or treated as infection spread.
  const localRecords=m.records.filter(r=>r.point&&gridIndex(base,r.point.lon,r.point.lat)===c.i);
  const local=fieldContext(localRecords,now),context={...m.context,...local},v=k=>context[k]?.value;
  const a=assessRisk({topic,weather:m.weather,species:m.registeredSpecies,cycle:m.cycle,month:m.month,context,station:m.station,now});
  const latest=activeInspections(localRecords,topic,now).find(r=>r.affected>0);
  const s=m.sat.usable?gridCell(satellite?.current,c.lon,c.lat):null,t=recentThermal?gridCell(thermal?.current,c.lon,c.lat):null;
  const clear=s?.clear&&s.zoneId===c.zoneId,changed=clear&&finite(s.ndviChange)&&s.ndviChange<=-.1,dense=clear&&finite(s.ndvi)&&s.ndvi>=.65;
  const d=base===drainage?c:gridCell(drainage,c.lon,c.lat),flow=d?.zoneId===c.zoneId&&(d.sink||d.convergence);
  const host=v('species')&&v('species')!=='unknown'?v('species'):m.registeredSpecies,arabica=/arabica|mixed/i.test(host),robusta=/robusta|mixed/i.test(host);
  const reasons=[],sources=[];let localPriority=false;
  const add=(reason,source)=>{localPriority=true;reasons.push(reason);sources.push(source);};
  const located=(key,condition)=>local[key]&&condition;
  if(topic==='wsb'&&arabica){
   if(a.trigger&&changed)add('Canopy decline during an Arabica stem-inspection window; check stems to determine the cause.','Sentinel-2 change + host / season');
   if(located('shadePercent',v('shadePercent')<35))add('Low shade measured at this location; inspect exposed Arabica stems.','Located shade observation');
  }
  if(topic==='rust'&&a.trigger){
   if(located('leafWetnessHours',v('leafWetnessHours')>0))add('Leaf wetness reported here, with a favourable temperature / humidity screen.','Located leaf observation + weather');
   if(located('rustSusceptibility',v('rustSusceptibility')==='susceptible'))add('Susceptible plants recorded here while the rust weather screen is active.','Located cultivar observation + weather');
   if(located('airflow',v('airflow')==='restricted'))add('Reported slow drying here; inspect susceptible leaf undersides after the flagged wet sequence.','Located airflow observation + weather');
   if(changed&&(arabica||v('rustSusceptibility')==='susceptible'))add('Canopy decline overlaps a rust weather watch on a susceptible / Arabica host; walk the area to find the cause.','Sentinel-2 change + host + weather');
  }
  if(topic==='blackrot'&&a.trigger){
   if(flow)add('Converging / low surface under a persistent wet-weather watch; check how fast leaves dry and how the ground drains.','30 m surface proxy + weather');
   if(dense)add('Greener mixed leaf cover under persistent humid weather; check whether coffee bushes are crowded or slow drying.','Sentinel-2 leaf cover proxy + weather');
   if(located('airflow',v('airflow')==='restricted')||located('leafWetnessHours',v('leafWetnessHours')>=12))add('Slow drying / prolonged wet leaves reported at this location.','Located leaf cover observation');
  }
  if(topic==='shothole'&&a.trigger&&robusta){
   if(dense)add('Greener mixed leaf cover in a humid Robusta twig-borer watch; check shade and tender-twig damage.','Sentinel-2 leaf cover proxy + host + weather');
   if(located('shadePercent',v('shadePercent')>=70)||located('tenderTwigs',v('tenderTwigs')==='yes'))add('Located heavy shade or tender twigs support a twig inspection under this humid host-specific screen.','Located twig / shade observation');
  }
  if(topic==='mealybug'&&located('ants',v('ants')==='yes'))add('Ant attendance recorded here: inspect and identify colonies and natural enemies.','Located ant observation');
  if(topic==='berryborer'&&(located('residualBerries',v('residualBerries')==='yes')||located('fruitStage',['ripe','residual','green'].includes(v('fruitStage')))))add('Berry availability / residual fruit recorded here; examine entry holes and actual seed maturity.','Located fruit observation');
  if(topic==='root'){
   if(located('stumps',v('stumps')==='yes'))add('Rotting stumps / suspect root contacts recorded here; dig and examine the roots.','Located stump observation');
   if(located('standingWater',v('standingWater')==='yes'))add('Saturation recorded here; separate waterlogging injury from disease.','Located water observation');
   if(flow&&(m.weather.heavyRain||changed))add('Surface convergence plus rain loading or leaf cover decline warrants a ground / root check.','30 m surface + rain / leaf cover proxy');
  }
  if(topic==='heat'&&a.trigger){
   if(t?.zoneId===c.zoneId&&t.clear&&finite(t.surfaceC)&&t.surfaceC>=30)add('A surface observation within seven days was ≥30 °C; check leaf temperature and water status.','100 m dated Landsat surface + air forecast');
   if(located('shadePercent',v('shadePercent')<35))add('Measured low shade here coincides with an atmospheric heat / drying watch.','Located shade observation + weather');
   if(changed)add('Canopy decline coincides with atmospheric demand; investigate water status and other causes.','Sentinel-2 change + weather');
  }
  if(topic==='nutrition'){
   if(located('nutrition',v('nutrition')==='deficient'))add('A lab-tested deficiency is reported here; use that report for the actual plan.','Located nutrition report');
   if(located('standingWater',v('standingWater')==='yes')||(flow&&m.weather.heavyRain))add('Inspect drainage and defer application review here until soil condition is suitable.','Water observation / runoff proxy');
  }
  if(topic==='canopy'){
   if(m.weather.heat&&located('shadePercent',v('shadePercent')<35))add('Measured low shade during heat: preserve / review local protection.','Located shade + weather');
   if(m.weather.blackrotWatch&&(located('airflow',v('airflow')==='restricted')||dense))add('Slow-drying observation or green mixed tree-cover proxy in a wet spell: measure structure before adjusting shade.','Canopy observation / proxy + weather');
  }
  if(latest?.affected>0){reasons.unshift(`Reported ${topic} signs in ${latest.affected} / ${latest.inspected} plants on ${latest.date}.`);sources.unshift('Located field inspection');}
  const riskLevel=latest?.affected>0?3:localPriority?2:a.priority===0?0:1;
  if(!reasons.length)reasons.push(a.trigger?'Zone conditions favour a check; walk this cell to see what is there.':'Nothing stands out here right now. Keep up your regular rounds.');
  return {...c,riskLevel,localPriority:localPriority||latest?.affected>0,reasons,evidenceSources:[...new Set(sources)],gaps:a.gaps,assessment:a,status:riskLevel===3?'Signs found':riskLevel===2?'Local inspection cue':riskLevel===0?'Evidence insufficient':a.trigger?'Zone watch · no local distinction':'No local trigger',record:latest?.affected>0?latest:null,ndvi:clear?s.ndvi:null,ndviChange:clear?s.ndviChange:null};
 });
 const grid=base?{bounds:base.bounds,width:base.width,height:base.height,resolutionM:base===drainage?30:20,cells,kind:'screening',modelVersion:'coffee-screen-2026-09-v2'}:null;
 function candidates(zoneId){
  const m=byZone.get(zoneId);if(!m)return [];
  const located=activeInspections(m.records,topic,now).filter(r=>r.point);
  // A negative observation elsewhere must not erase a positive at another plant.
  const reported=located.filter(r=>r.affected>0).map(r=>({...r.point,i:'record-'+r.id,zoneId,record:r,riskLevel:3,status:'Signs found',reasons:[`${r.affected} / ${r.inspected} plants with signs found on ${r.date}.`],evidenceSources:['Located inspection'],gaps:['Field identification'],localPriority:true}));
  return spreadCandidates([...reported,...cells.filter(c=>c.zoneId===zoneId&&c.localPriority&&!c.record).sort((a,b)=>b.riskLevel-a.riskLevel||b.reasons.length-a.reasons.length||a.i-b.i)],5);
 }
 return {grid,candidates};
}
