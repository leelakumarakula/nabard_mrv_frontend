// @ts-nocheck
// Ported unchanged from Coffee-estate-twin/public/scouting-plan.js. Keep the logic byte-identical: the Node
// test suites and the Python backend parity test run against the original module.
import { pointInZone } from './farm-model';
import { spreadCandidates, zoneInspectionPoints, gridCell } from './terrain-overlay';
import { SOLAR_POLICY } from './solar-model';

// Scouting is allowed before an alert. These plans choose samples to inspect;
// they never turn missing evidence into a disease detection or recolour risk.
export const SCOUTING_GUIDES={
 wsb:{target:'Arabica stems and exposure',checks:['Note the coffee species and inspect the main stem for raised ridges and emergence holes.','Check persistent wilt and compare exposed and shaded stems; mark affected plants so they can be identified.'],weather:'Host and adult-flight season guide timing; sun exposure and actual adult activity refine stem checks. Rainy, cloudy weather can delay flight.',soil:'Moisture helps investigate plant water stress. A dry or wilting plant is not evidence of stem borer; check the stem and other causes.'},
 rust:{target:'Leaf undersides and drying conditions',checks:['Inspect lower and middle leaf undersides for orange powder and record leaf fall.','Compare susceptible varieties and foliage drying across leaf cover conditions; record wetness duration and airflow.'],weather:'Warm, humid conditions with rain support a rust check. A fresh station snapshot plus observed wet leaves can also prompt review. Spores and susceptible leaves still need checking.',soil:'Soil moisture describes root-zone conditions, not free water on leaves. It does not replace leaf-wetness observations or diagnose rust. Nutrition follows your recorded nutrient plan.'},
 blackrot:{target:'Inner foliage, berries and slow drying',checks:['Inspect inner leaves and berries for blackening and hanging fungal threads.','Check actual mist, leaf drying, crowding and blocked drainage; distinguish waterlogging from infected foliage.'],weather:'Repeated humid, rainy intervals prompt inspection for prolonged leaf wetness. One humid snapshot cannot establish the duration of a wet spell.',soil:'Persistent wet soil supports a drainage check, but does not prove that leaves remain wet. Link dated soil observations with rainfall and measured leaf drying.'},
 berryborer:{target:'Fruiting branches and residual berries',checks:['First check berries and their development; inspect berry tips for entry holes.','Check old berries on the tree and ground. Record affected plants and berry sample counts separately in the note.'],weather:'Temperature and rainfall provide activity context; priority comes from fruit on the plants, sanitation and your inspections.',soil:'There is no direct soil-moisture trigger for berry borer in this model. Moisture can support crop-condition checks; berry inspection and sanitation evidence determine scouting priority.'},
 shothole:{target:'Tender twigs, especially in Robusta',checks:['Confirm the host and inspect tender or wilting twigs for small entry holes.','Measure shade and check humidity / air movement around bushes; confirm the insect before removing material.'],weather:'Robusta, tender twigs, humid conditions and the seasonal window guide the screen. Sampling greener leaf cover checks whether it actually corresponds to heavy shade.',soil:'Soil moisture is supporting plant-condition evidence. The screen uses humidity, host and twig conditions; wet soil alone does not locate shot-hole borer.'},
 mealybug:{target:'Colonies, ant attendance and natural enemies',checks:['Inspect young growth, leaf junctions and berry clusters for colonies, honeydew and attending ants.','Distinguish mealybugs from scales and record beneficial insects; compare representative rows before selecting treatment.'],weather:'Warm periods with intermittent moisture prompt a colony check. Persistent wet weather uses a different interpretation. Field irrigation is not captured by rainfall alone.',soil:'Moisture readings can help review irrigation context, but cannot identify colonies. Record irrigation timing and direct ant / insect observations.'},
 root:{target:'Root collars, wet patches and old stumps',checks:['Check persistent wilt, root collars, actual soil condition and nearby rotting stumps or affected roots.','Record standing-water duration and outlets; seek a root examination to distinguish waterlogging, disease and nutrition.'],weather:'Forecast rain prompts checks of converging / low surface locations before and after the event. Actual ponding must be observed.',soil:'Upper and lower soil water show how wet the ground is. Repeated wet readings plus saturation seen in the field point to waterlogging.'}
};
const distance=(a,b)=>Math.hypot((a.lon-b.lon)*111320*Math.cos(a.lat*Math.PI/180),(a.lat-b.lat)*111320);
export function addScoutingPlan({topic,model,geometry,grid,priorityPoints=[],limit=5,solar=null}){
 const guide=SCOUTING_GUIDES[topic];if(!guide||!model)return priorityPoints;
 const zone=model.zone,inside=p=>p.zoneId===zone.id&&Number.isFinite(p.lon)&&Number.isFinite(p.lat)&&pointInZone([p.lon,p.lat],zone);
 const chosen=spreadCandidates(priorityPoints.filter(inside),limit).map(p=>({...p,planned:false,scoutChecklist:guide.checks}));
 const pool=(grid?.cells?.filter(inside)||[]).length?grid.cells.filter(inside):zoneInspectionPoints(geometry,zone.id);
 const alert=model.alerts.find(a=>a.topic===topic),fits=p=>inside(p)&&chosen.every(c=>distance(c,p)>=35);
 function add(pool,reason,source){
  if(chosen.length>=limit)return;
  const p=pool.find(fits);if(!p)return;
  chosen.push({...p,i:`plan-${topic}-${zone.id}-${p.i}`,planned:true,localPriority:false,record:null,status:'Planned scouting · observation needed',scoutChecklist:guide.checks,reasons:[reason+(p.date?` Previous record: ${p.date}.`:''),`Current zone assessment: ${alert?.status||'Not evaluated'}. Visit timing: ${alert?.when||'Confirm current field conditions.'}`],evidenceSources:[source],gaps:alert?.gaps||[],samplingTarget:guide.target});
 }
 // Recorded places remain useful for follow-up after the active-sign window.
 const history=model.records.filter(r=>r.topic===topic&&r.point).map(r=>({...r.point,i:'history-'+r.id,zoneId:zone.id,date:r.date}));
 if(history.length)add(history,`Revisit a recorded ${guide.target.toLowerCase()} inspection location; check its journal history before drawing conclusions.`,'Historical field location · current condition unknown');
 const clear=pool.filter(c=>Number.isFinite(c.ndvi)),range=clear.length?Math.max(...clear.map(c=>c.ndvi))-Math.min(...clear.map(c=>c.ndvi)):0;
 const high=[...clear].sort((a,b)=>b.ndvi-a.ndvi||String(a.i).localeCompare(String(b.i))),low=[...high].reverse();
 if(['blackrot','root'].includes(topic))add(pool.filter(c=>c.sink||c.convergence).sort((a,b)=>(b.accumulation||0)-(a.accumulation||0)),'Sample a low / converging surface location to check actual drainage and nearby plant condition. This is a survey target even without a current weather alert.','30 m surface sampling · check ground condition');
 if(range>=.08){
  if(topic==='wsb')add(low,'Sample the lower-greenness part of this zone to check actual stem exposure. Low NDVI does not identify bare stems or infestation.','Recent clear leaf cover contrast · check exposure');
  if(['blackrot','shothole'].includes(topic))add(high,'Sample the greener part of this zone to check actual shade, bush crowding and drying. Shade trees can dominate this signal.','Recent clear leaf cover contrast · check structure');
  if(topic==='rust'){
   add(high,'Inspect leaf undersides in a greener leaf cover setting and measure actual drying / airflow. Greenness does not establish rust risk.','Recent clear leaf cover contrast · leaf sampling');
   add(low,'Compare leaves in a lower-greenness leaf cover setting. Look for nutrition, exposure, management or disease explanations.','Recent clear leaf cover contrast · comparison sample');
  }
 }
 // Modelled terrain sun exposure offers a contrast sample for ripening and stem-exposure
 // checks. It is clear-sky geometry on a canopy-inclusive surface, not measured light.
 if(solar&&solar.range>=SOLAR_POLICY.contrast&&['berryborer','wsb'].includes(topic)){
  const lit=pool.map(c=>({...c,sun:gridCell(solar,c.lon,c.lat)})).filter(c=>Number.isFinite(c.sun?.relative)&&c.sun.zoneId===zone.id),sunny=[...lit].sort((a,b)=>b.sun.relative-a.sun.relative||String(a.i).localeCompare(String(b.i))),shaded=[...sunny].reverse();
  if(topic==='berryborer'){
   add(sunny,'Sample berries on the most sun-exposed terrain in this zone to compare ripening stage, sunscald and entry holes. Exposure is modelled from the 30 m surface, not measured light.','Modelled sun exposure · terrain geometry, not a berry-load map');
   add(shaded,'Compare berries on the least sun-exposed terrain in this zone; slower ripening or wetter leaves need direct observation.','Modelled sun exposure · terrain geometry, not a berry-load map');
  }
  if(topic==='wsb')add(sunny,'Sample Arabica stems on the most sun-exposed terrain to check actual stem exposure. Modelled exposure does not identify infestation.','Modelled sun exposure · terrain geometry, not a stem survey');
 }
 // Complete a spatially spread baseline; do not rotate points merely to make
 // disease maps look different. Fruit/colony maps cannot be inferred from NDVI.
 const centre={lon:zone.rings[0].reduce((s,p)=>s+p[0],0)/zone.rings[0].length,lat:zone.rings[0].reduce((s,p)=>s+p[1],0)/zone.rings[0].length};
 while(chosen.length<limit){
  const remaining=pool.filter(fits);if(!remaining.length)break;
  remaining.sort((a,b)=>chosen.length?Math.min(...chosen.map(p=>distance(b,p)))-Math.min(...chosen.map(p=>distance(a,p))):distance(a,centre)-distance(b,centre));
  add(remaining,`Baseline coverage stop: inspect ${guide.target.toLowerCase()} on comparable plants nearby. Its position provides geographic coverage; no local infestation is implied.`,'Mapped zone geometry · representative sampling');
 }
 let p=0,s=0;return chosen.map(c=>({...c,label:c.planned?`P${++p}`:`S${++s}`}));
}
