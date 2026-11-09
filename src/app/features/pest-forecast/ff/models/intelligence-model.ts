// @ts-nocheck
// Ported unchanged from Coffee-estate-twin/public/intelligence-model.js. Keep the logic byte-identical: the Node
// test suites and the Python backend parity test run against the original module.
import { cycleAt, isoDateIST } from './farm-model';
import { STAGES } from './model';
import { assessRisk, fieldContext, observedWeather, activeInspections } from './risk-model';
export const TOPICS={wsb:'White stem borer',rust:'Leaf rust',blackrot:'Black rot / koleroga',berryborer:'Coffee berry borer',shothole:'Shot-hole borer',mealybug:'Mealybugs and scale insects',root:'Root health',heat:'Heat and dry plants',drainage:'Drainage & standing water',nutrition:'Fertilization',canopy:'Shade and pruning'};
export const RULES={heatC:30,vpdKpa:2,humidRh:90,humidSamples:4,rain24Mm:20,rain3hMm:10,ndviDrop:-.10,maxForecastAgeHours:6,maxSatelliteAgeDays:21};
const DAY=86400000;
const finite=Number.isFinite;
export const futureDate=(time,days)=>isoDateIST(time+days*DAY);
export function vpd(temp,rh){return finite(temp)&&finite(rh)&&rh>=0&&rh<=100?.6108*Math.exp(17.27*temp/(temp+237.3))*(1-rh/100):null;}
export function weatherSignals(farm,now=Date.now()){
 const age=now-Date.parse(farm?.fetchedAt?.forecast),fresh=finite(age)&&age>=-300000&&age<=RULES.maxForecastAgeHours*3600000;
 const raw=fresh?(farm?.forecast?.slots||[]).filter(s=>finite(s.time)&&s.time>=now&&s.time<=now+48*3600000).sort((a,b)=>a.time-b.time):[];
 const slots=[...new Map(raw.map(s=>[s.time,s])).values()];
 const tempOk=s=>finite(s.temperatureC)&&s.temperatureC>=-20&&s.temperatureC<=60,humidOk=s=>finite(s.humidity)&&s.humidity>=0&&s.humidity<=100,rainOk=s=>finite(s.rainMm)&&s.rainMm>=0;
 const complete=s=>tempOk(s)&&humidOk(s)&&rainOk(s);
 const contiguous=(s,p)=>!p||s.time-p.time===10800000;
 function longest(predicate,minWet=0,validator=complete){let run=[],best=0;for(const s of slots){if(!validator(s)||!predicate(s)){run=[];continue;}if(run.length&&!contiguous(s,run.at(-1)))run=[];run.push(s);if(run.filter(x=>x.rainMm>0).length>=minWet)best=Math.max(best,run.length);}return best;}
 const available=longest(()=>true)>=6,heatAvailable=longest(()=>true,0,tempOk)>=6,blackrotAvailable=longest(()=>true,0,s=>humidOk(s)&&rainOk(s))>=6,humidityAvailable=longest(()=>true,0,humidOk)>=6,valid=slots.filter(complete),ts=slots.filter(tempOk),rain=slots.filter(s=>finite(s.rainMm)&&s.rainMm>=0),next24=slots.filter(s=>s.time<=now+DAY);
 const rainComplete=next24.length>=8&&next24[0].time-now<=10800000&&next24.every((s,i)=>finite(s.rainMm)&&s.rainMm>=0&&contiguous(s,next24[i-1]));
 const rain24=rainComplete?next24.reduce((a,s)=>a+s.rainMm,0):null,vpds=slots.filter(s=>tempOk(s)&&humidOk(s)).map(s=>vpd(s.temperatureC,s.humidity)).filter(finite);
 let applicationWindow=null;
 for(let i=0;i<=slots.length-8;i++){const segment=slots.slice(i,i+8);if(segment[0].time-10800000<now)continue;if(segment.every((s,j)=>finite(s.rainMm)&&s.rainMm>=0&&s.rainMm<RULES.rain3hMm&&contiguous(s,segment[j-1]))&&segment.reduce((a,s)=>a+s.rainMm,0)<RULES.rain24Mm){applicationWindow={start:segment[0].time-10800000,end:segment.at(-1).time};break;}}
 const rustRun=available?longest(s=>s.temperatureC>=22&&s.temperatureC<=27&&s.humidity>=80,1):0,blackrotRun=blackrotAvailable?longest(s=>s.humidity>=90,2,s=>humidOk(s)&&rainOk(s)):0,humidRun=humidityAvailable?longest(s=>s.humidity>=85,0,humidOk):0;
 const wetSamples=valid.filter(s=>s.rainMm>0).length,drySamples=valid.filter(s=>s.rainMm===0).length,warmSamples=valid.filter(s=>s.temperatureC>=27).length,persistentWet=available&&longest(s=>s.humidity>=90&&s.rainMm>0)>=4;
 const heatSlots=ts.filter(s=>s.temperatureC>=RULES.heatC||vpd(s.temperatureC,s.humidity)>=RULES.vpdKpa);
 return {available,heatAvailable,blackrotAvailable,humidityAvailable,fresh,slots,rain24,applicationWindow,peakRain:rain.length?Math.max(...rain.map(s=>s.rainMm)):null,maxTemp:ts.length?Math.max(...ts.map(s=>s.temperatureC)):null,maxVpd:vpds.length?Math.max(...vpds):null,rustRun,blackrotRun,humidRun,wetSamples,drySamples,warmSamples,persistentWet,rustWatch:rustRun>=2,blackrotWatch:blackrotRun>=4,mealyWatch:available&&warmSamples>=2&&wetSamples>=1&&drySamples>=4&&!persistentWet,humidSamples:valid.filter(s=>s.humidity>=90).length,humidityWatch:blackrotRun>=4,heat:heatAvailable&&heatSlots.length>0,heatTime:heatAvailable?heatSlots[0]?.time??null:null,heavyRain:rain24!==null&&rain24>=RULES.rain24Mm||rain.some(s=>s.rainMm>=RULES.rain3hMm),firstHeavy:rain.find(s=>s.rainMm>=RULES.rain3hMm)?.time??null};
}
export function zoneSatellite(satellite,zoneId,now=Date.now()){
 const current=satellite?.current,cells=(current?.cells||[]).filter(c=>c.zoneId===zoneId),clear=cells.filter(c=>c.clear),ageDays=current?(now-Date.parse(current.acquiredAt))/DAY:null;
 const usable=!!current&&ageDays>=0&&ageDays<=RULES.maxSatelliteAgeDays&&clear.length/Math.max(1,cells.length)>=.6;
 const matched=clear.filter(c=>finite(c.ndviChange)),changed=usable?matched.filter(c=>c.ndviChange<=RULES.ndviDrop):[];
 const mean=key=>{const a=clear.map(c=>c[key]).filter(finite);return a.length?a.reduce((s,v)=>s+v,0)/a.length:null;};
 return {cells,clear,ageDays,usable,matched,changed,coverage:clear.length/Math.max(1,cells.length),ndvi:mean('ndvi'),ndmi:mean('ndmi')};
}
const PRACTICES={
 wsb:['Walk Arabica rows; check stems for raised ridges, emergence holes and persistent wilt. Mark affected plants so they can be identified before sanitation.','Exposed Arabica stems and located previous observations.','Inspect before / during local adult flight; recheck marked stems.',7,'Satellite views show leaf cover only; check the stems on foot to find stem borer.'],
 rust:['Inspect lower and middle leaf undersides for orange powder and record leaf fall. Confirm the cause and cultivar before choosing control.','Located rust observations; inspect locally reported wet, susceptible foliage.','Inspect after favourable wet weather and revisit the same sampled plants.',7,'Weather shows when conditions favour rust; check the leaves. Use only products registered for coffee, and follow the label.'],
 blackrot:['Check inner foliage and berries for blackening and hanging fungal threads. Inspect slow drying and obstructed existing outlets; confirm the disease before sanitation.','Wet, crowded leaf cover and terrain convergence are inspection contexts, not confirmed infections.','Inspect during / after persistent wet spells and again after drying.',3,'Surface convergence does not establish leaf wetness or black rot.'],
 berryborer:['Inspect berry tips for entry holes and record affected plants and note berry sample counts separately. Check residual fruit and harvest sanitation; confirm the pest.','Located berry / residual-fruit observations and previously affected plants.','During verified berry development and harvest; review residual fruit after picking.',7,'Check berries and seed maturity on the plants; satellite greenness does not show berry borer.'],
 shothole:['Inspect tender twigs for small entry holes and wilt. Verify shot-hole borer before removing affected material; review excessive crowding locally.','Robusta twigs, especially field-reported humid, heavily shaded locations.','Increase twig checks during humid periods and September–January.',7,'Wilt and dense leaf cover are nonspecific; confirm the insect and twig damage.'],
 mealybug:['Inspect colonies, honeydew and ant attendance on growth, leaf junctions and berry clusters. Record natural enemies and distinguish mealybugs from scales.','Located colony / ant observations; do not infer colony distribution from NDVI.','Recheck colonies in warm spells with intermittent rain or irrigation.',7,'The weather rule guides mealybug scouting; check colonies on the plants.'],
 root:['Examine persistently wilted plants, collars and roots. Distinguish waterlogging from stump-contact disease, nutrition and other causes.','Located standing water, suspect stumps / roots and surface drainage candidates.','After reported ponding, rain loading or persistent wilting.',3,'Root pathogens require examination. Standing water alone does not identify a root disease.'],
 heat:['Inspect afternoon foliage, young plants and exposed rows. Retain useful shade and ground cover; confirm root-zone water and irrigation capacity before watering.','Measured exposed patches and dated warm surface cells when heat is forecast.','Check ahead of flagged forecast intervals and during afternoon stress.',3,'30 °C / 2 kPa are the heat points at which we ask you to check your plants.'],
 drainage:['Check low / converging surface locations after rain for standing-water extent, persistence and blocked outlets. Clear only confirmed obstructions in existing drains; survey before excavation.','Terrain candidates, road crossings and actual downstream outlets.','Inspect before substantial rain and after the event.',1,'The 30 m surface includes leaf cover and omits culverts / infiltration. No flood depth or new drain alignment is predicted.'],
 nutrition:['Use your recorded nutrient plan for nutrient quantities. Review the seasonal split only after checking actual soil moisture, crop stage and rain. Avoid stems and runoff pathways.','Use zone soil records and located field observations; doses follow your nutrient plan.','Hold application review during heavy rain or saturation; reassess with your nutrient plan.',7,'Apply only as your recorded nutrient plan says; a dry weather window is when to do it.'],
 canopy:['Measure shade and bush crowding locally. Preserve heat protection while reviewing confirmed slow drying. Schedule major pruning against verified harvest and rainfall.','Compare field-reported exposed and crowded locations; shade trees influence NDVI.','Review current stress now; confirm post-harvest timing for major work.',14,'NDVI is not shade percentage. More shade does not universally increase rust risk.']
};
export function fieldDecisions({farm,satellite,drainage,thermal,records=[],zoneId,floweringDate=null,now=Date.now()}){
 const zone=farm.geometry.zones.find(z=>z.id===zoneId)??farm.geometry.zones[0],sensor=farm.sensors?.find(s=>s.zoneId===zone.id);
 const zoneRecords=records.filter(r=>r.zoneId===zone.id).sort((a,b)=>b.date.localeCompare(a.date)||(b.createdAt||0)-(a.createdAt||0));
 const context=fieldContext(zoneRecords.filter(r=>!r.point),now),registeredSpecies=sensor?.crops?.join(', ')||farm.farm.crops.map(c=>c.name).join(', '),species=context.species?.value&&context.species.value!=='unknown'?context.species.value:registeredSpecies;
 const cycle=cycleAt(farm.calendar,now,floweringDate,species),weather=weatherSignals(farm,now),sat=zoneSatellite(satellite,zone.id,now),month=Number(isoDateIST(now).slice(5,7)),station=observedWeather(farm,now);
 const dcells=(drainage?.cells||[]).filter(c=>c.zoneId===zone.id&&finite(c.elevation)),thermalCells=(thermal?.current?.cells||[]).filter(c=>c.zoneId===zone.id&&c.clear);
 const alerts=Object.keys(TOPICS).map(topic=>{
  const assessment=assessRisk({topic,weather,species:registeredSpecies,cycle,month,context,station,now}),[action,where,when,days,limit]=PRACTICES[topic];
  const inspection=zoneRecords.find(r=>r.kind==='inspection'&&r.topic===topic),latest=activeInspections(zoneRecords,topic,now).find(r=>r.affected>0);
  if(latest?.affected>0){assessment.priority=3;assessment.status='Signs found';assessment.factors.unshift({name:'Inspection',value:`${latest.affected} of ${latest.inspected} plants had signs found on ${latest.date}.`,evidence:'field report',effect:'increase'});}
  const practice=zoneRecords.find(r=>r.kind==='practice'&&r.topic===topic),record=zoneRecords.find(r=>r.topic===topic),follow=record?.nextCheck,overdue=!!follow&&follow<isoDateIST(now),due=follow||futureDate(now,assessment.priority>=2?1:days);
  if(sensor&&['heat','root','drainage','nutrition'].includes(topic))assessment.gaps.push('Standing-water hours and soil conditions recorded in the field');
  return {...assessment,title:TOPICS[topic],priority:overdue?Math.max(assessment.priority,2):assessment.priority,why:assessment.factors.map(f=>`${f.name}: ${f.value}`),action,where,when,followDays:days,due,limit,inspection,practice,follow,overdue,zoneId:zone.id};
 });
 alerts.sort((a,b)=>b.priority-a.priority||a.due.localeCompare(b.due));
 return {zone,species,registeredSpecies,sensor,cycle,stageName:cycle.stage===null?'Stage not set':STAGES[cycle.stage].name,weather,sat,context,station,month,alerts,records:zoneRecords,drainage:{sinks:dcells.filter(c=>c.sink),flows:dcells.filter(c=>c.convergence),cells:dcells},thermalCells};
}
