// @ts-nocheck
// Ported unchanged from Coffee-estate-twin/public/fertilizer-model.js. Keep the logic byte-identical: the Node
// test suites and the Python backend parity test run against the original module.
import { fieldContext } from './risk-model';
import { gridIndex, gridCell, zoneInspectionPoints } from './terrain-overlay';
import { applicationWorkPlan } from './fertilizer-work';

// Operational screening policies, not product labels, nutrient doses or fitted probabilities.
export const FERTILIZER_VERSION='coffee-application-2026-09-v2';
export const FERTILIZER_COLORS={hold:'#c57c69',review:'#c6aa68',candidate:'#81b895',unknown:'#35443e'};
export const FERTILIZER_LABELS={hold:'Do not apply',review:'Check first',candidate:'OK to apply',unknown:'Wait · forecast missing'};
export const FERTILIZER_POLICY={rain24Mm:20,rain3hMm:10,rainChanceReview:40,calmMs:.5,heatC:30,dryRh:40,surfaceSlopeReviewDeg:15};
const HOUR=3600000,STEP=3*HOUR,finite=Number.isFinite;
const valid=(v,min,max=Infinity)=>finite(v)&&v>=min&&v<=max;
export function compass(degrees){return valid(degrees,0,360)?['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'][Math.round(degrees/22.5)%16]:'Unknown';}
export function windVector(degrees){
 if(!valid(degrees,0,360))return null;
 const a=degrees*Math.PI/180;
 // Map x is east, z / SVG y is south. Meteorological bearings describe FROM.
 return {x:-Math.sin(a),z:Math.cos(a),from:degrees%360,to:(degrees+180)%360,fromLabel:compass(degrees),toLabel:compass((degrees+180)%360)};
}
export function placementArrow(cell,method='soil'){
 if(method!=='soil'||!valid(cell?.uphill,0,360)||!finite(cell?.lon)||!finite(cell?.lat))return null;
 const angle=cell.uphill*Math.PI/180;
 return {lon:cell.lon,lat:cell.lat,x:Math.sin(angle),z:-Math.cos(angle),bearing:cell.uphill,direction:compass(cell.uphill),confirmed:cell.uphillSource==='field',label:`Uphill ${compass(cell.uphill)}${cell.uphillSource==='field'?' · reported':' · from the map'}`};
}
export function applicationInstruction(assessment,method='soil',weather={}){
 const a=assessment||{},state=a.state||'unknown',direction=finite(a.uphill)?compass(a.uphill):null;
 const verdict={hold:'Do not apply',review:'Check first',candidate:'OK to apply',unknown:'Wait'}[state];
 const reason=state==='hold'?a.holds?.[0]:state==='unknown'?a.gaps?.[0]:state==='review'?a.reviews?.[0]:'Use only the approved nutrient split during the selected period, after checking the actual field and product conditions again.';
 let heading,detail,basis;
 if(method==='foliar'){
  heading='Aim at the plants being sprayed';
  detail=weather.wind&&!weather.wind.calm?`Wind carries droplets toward ${weather.wind.toLabel}. Check that downwind side for people, water and sensitive crops. Keep the spray on the intended leaves; wind alone cannot tell you a safe spray direction.`:'Check local wind and downwind receptors before spraying. A safe spray direction cannot be worked out from the available wind data.';
  basis='Follow the product label and application setup; the blue arrow shows forecast air movement.';
 }else if(a.groundSlope==='flat'){
  heading='Around the bush’s drip circle';detail='Ground is reported as level here. Use the approved drip-circle placement; keep fertilizer away from the stem, drains and water edges.';basis='Field-reported level ground; recheck at the actual bush.';
 }else if(direction){
  heading=`Uphill side · ${direction} (${Math.round(a.uphill)}°)`;
  detail=`Once ground direction is confirmed and application is permitted, place fertilizer in the upper half of each bush’s drip circle on its ${direction} side.`;
  basis=a.uphillSource==='field'?'Ground direction supplied in a field record; recheck at each bush.':'Read from the 30 m surface map. Check the higher-ground side as you place.';
 }else{
  heading='Find the higher-ground side first';detail='No compass placement direction is established here. Check the ground: on slopes use the upper half of the drip circle; on level ground use the planned drip-circle placement.';basis='Record level / sloping ground and, for a slope, its measured uphill compass bearing.';
 }
 return {state,verdict,reason:reason||'Complete the missing weather and field checks before application.',heading,detail,basis,permitted:state==='candidate'};
}
function orderedSlots(farm){return [...new Map((farm.forecast?.slots||[]).filter(s=>finite(s.time)).map(s=>[s.time,s])).values()].sort((a,b)=>a.time-b.time);}
function sequence(slots,start,count){return Array.from({length:count},(_,i)=>slots.find(s=>s.time===start+(i+1)*STEP)??null);}
function completeRain(slots){return slots.length>0&&slots.every(s=>valid(s?.rainMm,0));}
function sumRain(slots){return completeRain(slots)?slots.reduce((n,s)=>n+s.rainMm,0):null;}

export function applicationWeather({farm,start,method='soil',settings={},now=Date.now()}){
 const slots=orderedSlots(farm),fetched=Date.parse(farm.fetchedAt?.forecast),fresh=finite(fetched)&&now-fetched>=-300000&&now-fetched<=6*HOUR;
 const operation=slots.find(s=>s.time===start+STEP),rain24=sequence(slots,start,8),rain24Mm=sumRain(rain24),holds=[],reviews=[],gaps=[];
 const reasons=[],end=finite(start)?start+STEP:null,p=FERTILIZER_POLICY;
 const intervalValid=farm.forecast?.intervalHours===3;
 if(!fresh)gaps.push('Forecast must have been retrieved within six hours.');
 if(!intervalValid)gaps.push('A three-hour forecast interval is needed.');
 if(!finite(start)||start<now||!operation)gaps.push('Choose a complete upcoming three-hour work period.');
 if(!fresh||!intervalValid||!operation||start<now)return {state:'unknown',label:FERTILIZER_LABELS.unknown,start,end,holds,reviews,gaps,reasons,wind:null,rain24Mm:null,slot:operation??null};
 const windUnitsKnown=farm.forecast.windUnit==='m/s',vector=windUnitsKnown?windVector(operation.windDegrees):null,speed=windUnitsKnown&&valid(operation.windMs,0)?operation.windMs:null,gust=windUnitsKnown&&valid(operation.gustMs,0)?operation.gustMs:null;
 const wind=vector&&speed!==null?{...vector,speedMs:speed,gustMs:gust,time:operation.time,calm:speed<=p.calmMs}:null;
 if(method==='soil'){
  if(!completeRain(rain24))gaps.push('Eight consecutive rain intervals covering 24 hours from the work-period start.');
  const intense=rain24.some(s=>valid(s?.rainMm,0)&&s.rainMm>=p.rain3hMm);
  if(intense||rain24Mm>=p.rain24Mm)holds.push(`Heavy rain expected: ${rain24Mm===null?'24-hour rain total not available':rain24Mm.toFixed(1)+' mm in 24 hours'}${intense?'; one 3-hour period reaches 10 mm':''}. Postpone soil placement and check drainage.`);
  if(completeRain(rain24)&&!holds.length)reasons.push(`${rain24Mm.toFixed(1)} mm of rain expected in the next 24 hours; no 3-hour period reaches 10 mm.`);
  reasons.push('Wind is displayed for context; it does not veto hand placement of soil fertilizer. Spreading dust or spraying needs a different operation assessment.');
 }else{
  const name=typeof settings.product==='string'?settings.product.trim():'';
  const maxWind=valid(settings.maxWindMs,.1,30)?settings.maxWindMs:null,free=valid(settings.rainFreeHours,0,24)?settings.rainFreeHours:null;
  if(!name)reviews.push('Enter the leaf-spray product and its label reference.');
  if(maxWind===null)reviews.push('Enter the highest wind speed this product and equipment can handle; no standard limit is assumed.');
  if(free===null)reviews.push('Enter the label’s required rain-free hours after the operation ends.');
  const rainPeriods=sequence(slots,start,1+Math.ceil((free??0)/3)),rainMm=sumRain(rainPeriods);
  if(!completeRain(rainPeriods))gaps.push('Complete rain coverage for the work period and the product’s rain-free time.');
  if(rainPeriods.some(s=>valid(s?.rainMm,0)&&s.rainMm>0))holds.push('Rain is forecast during application or the required rain-free period; postpone leaf spraying.');
  if(free!==null&&rainMm===0)reasons.push(`No rain amount forecast during work and ${Math.ceil(free/3)*3} h after it (rounded up to complete forecast intervals).`);
  const probabilities=rainPeriods.map(s=>s?.rainProbability);
  if(!probabilities.every(v=>valid(v,0,100)))reviews.push('Rain probability is incomplete; a zero rain amount alone cannot clear spraying.');
  else if(Math.max(...probabilities)>=p.rainChanceReview)reviews.push(`Rain chance reaches ${Math.max(...probabilities).toFixed(0)}%; recheck the dry window.`);
  if(speed===null||gust===null||!vector)gaps.push('Wind speed and direction are needed to check leaf spraying.');
  const peak=windUnitsKnown&&valid(operation.peakWindMs,0)?Math.max(operation.peakWindMs,speed??0):speed;
  if(maxWind!==null&&((peak!==null&&peak>maxWind)||(gust!==null&&gust>maxWind)))holds.push(`Forecast wind is above your limit of ${(maxWind*3.6).toFixed(0)} km/h. Postpone spraying.`);
  if(speed!==null&&(valid(operation.minWindMs,0)?operation.minWindMs:speed)<=p.calmMs)reviews.push('Very light wind (about 2 km/h or less) can make spray drift unpredictably. Check on site; calm air is not a go-ahead to spray.');
  if(!valid(operation.temperatureC,-50,60)||!valid(operation.humidity,0,100))gaps.push('Temperature and humidity for the leaf-spray work period.');
  else if(operation.temperatureC>=p.heatC||operation.humidity<p.dryRh)reviews.push('Hot or dry air (30 °C or hotter, or humidity below 40%): check for plant stress and the product label’s heat and humidity limits.');
  if(operation.night)reviews.push('Night or early-morning conditions need on-site checks for visibility, dew and still air.');
  reasons.push('Recheck wind at bush height, downwind people / water / sensitive crops, product restrictions and nozzle setup at the time of work. The arrow is air movement, not a spray route.');
 }
 const state=holds.length?'hold':gaps.length?'unknown':reviews.length?'review':'candidate';
 return {state,label:FERTILIZER_LABELS[state],start,end,holds,reviews,gaps,reasons,wind,rain24Mm,slot:operation,fresh,source:farm.forecast.source};
}

function assessPlacement(context,weather,method,cell,drainage){
 const v=k=>context[k]?.value,holds=[...weather.holds],gaps=[...weather.gaps],reviews=[...weather.reviews],reasons=[...weather.reasons],evidenceSources=['Farm-scale forecast'];
 if(v('standingWater')==='yes'||v('soilState')==='saturated')holds.push('Standing water / saturated ground was reported here. Do not apply fertilizer until conditions are checked again.');
 if(v('soilState')==='dry')holds.push('Dry soil was reported here. Check plant water before applying.');
 if(!['moist','dry','saturated'].includes(v('soilState')))reviews.push('Record a recent ground moisture check before applying.');
 if(v('nutrientPlan')!=='ready')reviews.push(context.nutrientPlan?.used?'Nutrition work was recorded after this plan. Confirm the next due split before another application.':'Confirm a nutrient plan with the product, dose, due split and covered area in the field notes.');
 if(![method,'both'].includes(v('nutrientMethod')))reviews.push(`Confirm that the due nutrient plan covers ${method==='soil'?'solid fertilizer placed by hand':'this leaf nutrient spray'} in this area.`);
 if(v('runoffCheck')==='blocked')holds.push('Runoff routes or fertilizer exclusion areas are unresolved here. Do not apply here.');
 else if(v('runoffCheck')!=='clear')reviews.push('Check ground drainage, water edges and product-required exclusion buffers for this application area.');
 if(method==='foliar'&&v('sprayCheck')==='blocked')holds.push('The leaf-spray field / product check is blocked here. Do not spray.');
 else if(method==='foliar'&&v('sprayCheck')!=='clear')reviews.push('Record the product suitability, plant condition, downwind receptors and application setup check.');
 if(v('terrainCheck')==='blocked')holds.push('Unsafe access, erosion or unsuitable terrain was reported here. Do not start application here.');
 for(const key of ['soilState','standingWater','nutrientPlan','nutrientMethod','runoffCheck','terrainCheck',...(method==='foliar'?['sprayCheck']:[])])if(context[key]&&v(key)!=='unknown')evidenceSources.push(`${key}: field record ${context[key].date}`);
 if(v('soilState')==='moist')reasons.push(`Moist, workable ground reported ${context.soilState.date}; recheck at the work time.`);
 if(v('nutrientPlan')==='ready')reasons.push(`The due nutrient split is reported as planned (${context.nutrientPlan.date}). Use that document for quantities.`);
 const d=cell&&gridCell(drainage,cell.lon,cell.lat);let uphill=null,uphillSource=null;
 if(d&&cell&&d.zoneId===cell.zoneId){
  if((d.sink||d.convergence||d.slope>=FERTILIZER_POLICY.surfaceSlopeReviewDeg)&&v('terrainCheck')!=='clear'&&v('terrainCheck')!=='blocked')reviews.push('Check footing, erosion and method suitability at this steep / low / converging surface location before application. The 30 m surface map is only a cue to check the ground.');
  if(d.sink||d.convergence){reasons.push('This 30 m surface cell is low / converging. Check actual runoff and pooling on the ground.');evidenceSources.push('Historical Copernicus surface proxy');}
  const to=drainage?.cells.find(c=>c.i===d.to);
  if(to&&valid(d.slope,.1,90)){const east=(d.lon-to.lon)*Math.cos(d.lat*Math.PI/180),north=d.lat-to.lat;uphill=(Math.atan2(east,north)*180/Math.PI+360)%360;uphillSource='surface';}
 }
 if(v('groundSlope')==='flat'){uphill=null;uphillSource='field';}
 else if(valid(v('groundUphillDegrees'),0,360)){uphill=v('groundUphillDegrees')%360;uphillSource='field';evidenceSources.push(`Ground uphill bearing: field record ${context.groundUphillDegrees.date}`);}
 const state=holds.length?'hold':gaps.length?'unknown':reviews.length?'review':'candidate';
 const placement=method==='soil'?'Use the planned drip-circle placement. On a ground-confirmed slope, place in the upper half of the drip circle. Keep material away from the stem, drains and water edges.':'Apply only the specified leaf-spray product to its intended target under the approved field plan. Do not direct spray toward downwind receptors or infer a spray route from the wind arrow.';
 return {state,status:FERTILIZER_LABELS[state],holds,reviews,gaps:[...gaps,...reviews],reasons:[...holds,...reviews,...reasons],evidenceSources,uphill,uphillSource,groundSlope:v('groundSlope'),placement,planReady:v('nutrientPlan')==='ready',planScope:context.nutrientPlan?.point?'located record':'whole-zone record',planRecordId:context.nutrientPlan?.recordId,terrainChecked:v('terrainCheck')==='clear'};
}

export function fertilizerPlan({farm,models,drainage,satellite,zoneId,settings={},now=Date.now()}){
 const method=settings.method==='foliar'?'foliar':'soil',slots=orderedSlots(farm),starts=slots.map(s=>s.time-STEP).filter(t=>t>=now&&t<=now+72*HOUR);
 const start=starts.includes(settings.start)?settings.start:starts[0]??null;
 const makeWeather=t=>applicationWeather({farm,start:t,method,settings,now}),weather=makeWeather(start);
 const byZone=new Map(models.map(m=>[m.zone.id,m])),selectedModel=byZone.get(zoneId);
 // Context expiry is evaluated at the proposed operation, not just when the page opened.
 const scope=(m,cell,t)=>{
  const zone=fieldContext(m.records.filter(r=>!r.point),Math.max(now,t??now));
  const local=cell&&base?fieldContext(m.records.filter(r=>r.point&&gridIndex(base,r.point.lon,r.point.lat)===cell.i),Math.max(now,t??now)):{};
  const context={...zone,...local},planRecord=m.records.find(r=>r.id===context.nutrientPlan?.recordId);
  const stamp=r=>Date.parse(r.date+'T00:00:00+05:30'),newer=(a,b)=>stamp(a)>stamp(b)||(a.date===b.date&&(a.createdAt||0)>=(b.createdAt||0));
  const done=planRecord&&m.records.some(r=>r.kind==='practice'&&r.topic==='nutrition'&&(!r.point||(cell&&base&&gridIndex(base,r.point.lon,r.point.lat)===cell.i))&&newer(r,planRecord));
  if(done)context.nutrientPlan={...context.nutrientPlan,value:'notready',used:true};
  return context;
 };
 const base=drainage?.cells?.some(c=>c.zoneId&&finite(c.elevation))?drainage:satellite?.current;
 const cells=(base?.cells||[]).map(c=>{
  const m=byZone.get(c.zoneId);if(!m)return {...c,state:'unknown',reasons:[],gaps:[],status:'Outside mapped zones'};
  return {...c,...assessPlacement(scope(m,c,start),weather,method,c,drainage)};
 });
 const zoneAssessments=Object.fromEntries(models.map(m=>[m.zone.id,assessPlacement(scope(m,null,start),weather,method,null,drainage)]));
 const grid=base?{bounds:base.bounds,width:base.width,height:base.height,resolutionM:base===drainage?30:20,cells,kind:'fertilizer',modelVersion:FERTILIZER_VERSION}:null;
 const colors=Object.fromEntries(cells.map(c=>[c.i,FERTILIZER_COLORS[c.state]])),zoneColors=Object.fromEntries(models.map(m=>[m.zone.id,FERTILIZER_COLORS[zoneAssessments[m.zone.id].state]]));
 const work=applicationWorkPlan({grid,geometry:farm.geometry,zoneId,settings,method,start,weather,now});
 const candidates=work.pins.map(c=>({...c,markerColor:FERTILIZER_COLORS.candidate}));
 const windows=starts.map(t=>{const w=makeWeather(t),a=assessPlacement(scope(selectedModel,null,t),w,method,null,drainage);return {...w,zoneState:a.state,zoneStatus:a.status,zoneReasons:a.reasons};});
 const anchor=zoneInspectionPoints(farm.geometry,zoneId)[0],wind=weather.wind&&!weather.wind.calm&&anchor?{...weather.wind,lat:anchor.lat,lon:anchor.lon}:null;
 return {method,start,weather,windows,grid,colors,zoneColors,zoneAssessments,candidates,work,wind,counts:Object.fromEntries(Object.keys(FERTILIZER_COLORS).map(key=>[key,cells.filter(c=>c.zoneId===zoneId&&c.state===key).length])),modelVersion:FERTILIZER_VERSION};
}
