// @ts-nocheck
// Ported unchanged from Coffee-estate-twin/public/field-layers.js. Keep the logic byte-identical: the Node
// test suites and the Python backend parity test run against the original module.
import { fieldDecisions, TOPICS, RULES, zoneSatellite } from './intelligence-model';
import { spreadCandidates } from './terrain-overlay';
import { riskSurface } from './risk-spatial';
import { addScoutingPlan, SCOUTING_GUIDES } from './scouting-plan';
import { fertilizerPlan } from './fertilizer-model';
import { solarExposure, exposureContrast, SOLAR_BASES } from './solar-model';
import { cachedExposureModel, displayColour, EXPOSURE_TOPICS, compositeLayer, COMPOSITE_KINDS } from './cwsb-model';
import { RADAR_POLICY } from './radar-model';

export const LAYER_INFO={
 change:['Canopy change','NDVI difference between clear observations. A decline is a reason to inspect; it does not identify a cause.'],
 wsb:['White stem borer scouting','Arabica host, flight season and exposure guide stem checks; canopy decline is a nonspecific supporting cue. Satellite pixels cannot confirm this pest.'],
 ndvi:['Canopy greenness','NDVI measures mixed-canopy greenness, including shade trees. Use it to see where to look first.'],
 ndmi:['Canopy moisture index','NDMI is an optical canopy index. It does not measure soil water or replace your devices.'],
 thermal:['Surface temperature','Landsat observes the land surface at overpass time. Air and coffee leaf temperatures can differ.'],
 drainage:['Drainage inspection','Low/flat cells and flow concentration on a 30 m surface model. Confirm ground levels and actual water movement.'],
 elevation:['Satellite elevation','Historical surface heights include tree canopy and buildings. They are not surveyed ground levels.'],
 solar:['Sun exposure · terrain model','Clear-sky direct-sun exposure modelled from the 30 m surface: slope, aspect and horizon shading for the selected sun-path basis. Compare berry ripening, drying and afternoon heat between places. It is not measured radiation; clouds, shade trees and coffee canopy are not modelled.'],
 exposure:['Environmental exposure · by pest or disease','Seasonal composites of Landsat surface heat, Sentinel-2 canopy density and terrain sunlight and wetness, combined per topic in the manner of the CWSB baseline: components normalised against a 250 m context, averaged equally and shown relative to this farm. Each map marks where conditions associated with that topic coincide; none detects a pest or disease.'],
 sndvi:['Canopy greenness · seasonal median','Per-cell median NDVI over the last complete hot / dry season, from up to 24 least-cloudy Sentinel-2 scenes. Cloud is handled by the median, so every farm gets a value; it describes the season\u2019s canopy structure, not today.'],
 sndmi:['Canopy moisture index · seasonal median','Per-cell median NDMI over the same seasonal composite. An optical canopy index, not soil water.'],
 slst:['Surface temperature · seasonal median','Per-cell median Landsat surface temperature over the hot / dry season, 100 m cells. Land surface at overpass time, not air or leaf temperature.'],
 anomaly:['Canopy anomaly · latest scene vs seasonal median','The latest clear Sentinel-2 NDVI minus each cell\u2019s seasonal median, for cells with enough clear observations. A cloud-robust replacement for comparing two single scenes; a decline is a reason to inspect, not a cause.'],
 twi:['Terrain wetness index · DSM','ln(contributing area / slope) from D8 routing on the Copernicus 30 m surface, which includes canopy. A continuous, relative wetness cue for drainage and root checks; not measured soil water.'],
 radarChange:['Radar change · Sentinel-1 VH','Change in cross-polarised radar backscatter between the newest Sentinel-1 pass and the median of earlier passes from the same orbit, averaged over 3×3 cells. Radar sees through cloud and responds to canopy structure and water content, not greenness. A change of 2 dB or more is a reason to inspect; it does not say why.'],
 radarWet:['Radar wetness cue · Sentinel-1 VV','Change in co-polarised radar backscatter against the same-orbit median. A rise often follows wetter soil or canopy, a fall drier conditions. Under shade coffee the canopy dominates the signal, so this is a coarse, cloud-proof cue for drainage and root checks, not measured soil water.'],
 moisture:['Device soil moisture','Each zone shows its assigned device’s upper-moisture reading. One point reading does not measure variation across the zone.'],
 ...Object.fromEntries(Object.entries(TOPICS).filter(([k])=>!['wsb','drainage'].includes(k)).map(([k,v])=>[k,[v+' · inspection priority','Disease-specific screening combines host, weather, crop stage and field context. Local colours require located observations or explicitly labelled spatial proxies. Unknown is not low risk.']])),
 nutrition:['Fertilizer operation planner','Colours screen the selected work period, method and recorded field conditions. They do not show a nutrient prescription or fertilizer quantity.']
};
export const PRIORITY_COLORS=['#35443e','#526954','#c6aa68','#c57c69'];
const clamp=v=>Math.max(0,Math.min(1,v));
const mix=(a,b,t)=>'#'+a.map((x,i)=>Math.round(x+(b[i]-x)*clamp(t)).toString(16).padStart(2,'0')).join('');
export function layerState({layer,farm,satellite,drainage,thermal,records=[],zoneId,floweringDate,includeScoutingPlan=false,fertilizerSettings={},solarBasis='today',cwsb=null,exposureTopic='cwsb',radar=null,now=Date.now()}){
 const models=farm.geometry.zones.map(z=>fieldDecisions({farm,satellite,drainage,thermal,records,zoneId:z.id,floweringDate,now}));
 const model=models.find(m=>m.zone.id===zoneId),topic=['thermal','solar','slst'].includes(layer)?'heat':['twi','radarWet'].includes(layer)?'drainage':['sndvi','sndmi','anomaly','radarChange'].includes(layer)?'canopy':layer==='exposure'?(EXPOSURE_TOPICS[exposureTopic]?.alertTopic||exposureTopic):TOPICS[layer]?layer:layer==='elevation'?'drainage':layer==='moisture'?'heat':'canopy';
 if(layer==='nutrition'){
  const fertilizer=fertilizerPlan({farm,models,drainage,satellite,zoneId,settings:fertilizerSettings,now});
  return {layer,topic,model,models,...fertilizer,fertilizer,advisory:true,candidateBasis:'A pins identify connected areas covered by a due nutrient plan with conditional application clearance. START? is a proposed starting point; START means you confirmed access for this period. Other colours remain excluded. No pin records completed work.',title:LAYER_INFO[layer][0],description:LAYER_INFO[layer][1],dem:drainage,scoutingAvailable:false,guide:null};
 }
 // Sun exposure is derived from the same 30 m surface as drainage; it shares that grid's cell indices.
 const solar=drainage&&(layer==='solar'||SCOUTING_GUIDES[layer])?solarExposure(drainage,{basis:SOLAR_BASES[solarBasis]?solarBasis:'today',now,calendar:farm.calendar}):null;
 const exposure=layer==='exposure'&&cwsb?cachedExposureModel({data:cwsb,topic:EXPOSURE_TOPICS[exposureTopic]?exposureTopic:'cwsb',now}):null;
 const advisory=!!TOPICS[layer]&&layer!=='drainage',risk=advisory?riskSurface({topic,models,satellite,drainage,thermal,now}):null;let grid=advisory?risk.grid:layer==='moisture'?null:['drainage','elevation'].includes(layer)?drainage:layer==='solar'?solar:['radarChange','radarWet'].includes(layer)?(radar?.cells?.length?radar:null):layer==='exposure'?(exposure?.grid??null):layer==='thermal'?thermal?.current:satellite?.current;
 const colors={},zoneColors={},eligible=new Map(models.map(m=>[m.zone.id,zoneSatellite(satellite,m.zone.id,now).usable]));
 // Seasonal composite views share the exposure composites and replace the working grid.
 const composite=COMPOSITE_KINDS[layer]&&cwsb?compositeLayer(cwsb,layer,{satellite,eligibleZones:eligible}):null;if(COMPOSITE_KINDS[layer])grid=composite?.grid??null;
 const elevations=(drainage?.cells||[]).filter(c=>c.zoneId&&Number.isFinite(c.elevation)).map(c=>c.elevation),lo=Math.min(...elevations),hi=Math.max(...elevations);
 for(const m of models){const a=m.alerts.find(a=>a.topic===topic);zoneColors[m.zone.id]=layer==='moisture'?(Number.isFinite(m.sensor?.moistureTop)?mix([178,148,88],[72,127,145],(m.sensor.moistureTop-10)/30):'#35443e'):advisory?PRIORITY_COLORS[a?.priority===0?0:1]:'#35443e';}
 for(const c of grid?.cells||[]){
  let color='#35443e';
  if(advisory)color=PRIORITY_COLORS[c.riskLevel??0];
  else if(layer==='solar'){if(solar&&Number.isFinite(c.relative))color=mix([58,90,120],[242,196,106],(c.relative-solar.min)/Math.max(.01,solar.max-solar.min));}
  else if(composite){const v=c[composite.key];if(Number.isFinite(v)){if(layer==='sndvi')color=mix([159,150,71],[79,145,108],(v+.1)/1.1);else if(layer==='sndmi')color=mix([88,134,86],[72,151,173],(v+.5)/1.3);else if(layer==='slst')color=mix([57,135,159],[224,136,113],(v-15)/25);else if(layer==='anomaly')color=v<=RULES.ndviDrop?'#d99770':v>=.1?'#acd18b':'#496957';else if(layer==='twi')color=mix([40,70,62],[103,184,202],(v-composite.stats.min)/Math.max(.01,composite.stats.max-composite.stats.min));}}
  else if(layer==='radarChange'){if(Number.isFinite(c.dVh))color=c.dVh<0?mix([73,105,87],[217,151,112],-c.dVh/3):mix([73,105,87],[172,209,139],c.dVh/3);}
  else if(layer==='radarWet'){if(Number.isFinite(c.dVv))color=mix([150,120,80],[72,151,173],(c.dVv+3)/6);}
  else if(layer==='exposure')color=displayColour(c.display);
  else if(['drainage','elevation'].includes(layer)&&Number.isFinite(c.elevation))color=layer==='drainage'?(c.sink?'#d99770':c.convergence?'#67b8ca':'#28463e'):mix([49,87,71],[196,206,137],(c.elevation-lo)/Math.max(1,hi-lo));
  else if(c.clear){
   if(layer==='thermal'&&Number.isFinite(c.surfaceC))color=mix([57,135,159],[224,136,113],(c.surfaceC-15)/25);
   else if(['change','wsb'].includes(layer)&&eligible.get(c.zoneId)&&Number.isFinite(c.ndviChange))color=c.ndviChange<=RULES.ndviDrop?'#d99770':c.ndviChange>=.1?'#acd18b':'#496957';
   else if(layer==='ndvi'&&Number.isFinite(c.ndvi))color=mix([159,150,71],[79,145,108],(c.ndvi+.1)/1.1);
   else if(layer==='ndmi'&&Number.isFinite(c.ndmi))color=mix([88,134,86],[72,151,173],(c.ndmi+.5)/1.3);
  }
  colors[c.i]=color;
 }
 let choices=[],basis='Suggested walk points · no detected hotspot';
 if(advisory){
  choices=risk.candidates(zoneId);basis='Disease-specific local evidence · not confirmed infection';
 }else if(layer==='drainage'){
  choices=(drainage?.cells||[]).filter(c=>c.zoneId===zoneId&&(c.sink||c.convergence)).sort((a,b)=>Number(b.sink)-Number(a.sink)||b.accumulation-a.accumulation);basis='Terrain candidates · inspect after rain';
 }else if(layer==='solar'){
  const contrast=exposureContrast(solar,zoneId);choices=contrast.ordered.map(c=>({...c,solarCue:c.exposureRank==='high'?'Most exposed ground in this zone':'Least exposed ground in this zone'}));basis=contrast.contrast?'Sun-exposure contrast stops · compare berry ripening, drying and afternoon heat between the most and least exposed ground':'Modelled exposure is nearly uniform in this zone · no contrast stops';
 }else if(['radarChange','radarWet'].includes(layer)){
  const compared=(radar?.cells||[]).filter(c=>c.zoneId===zoneId&&Number.isFinite(c.dVh)&&Number.isFinite(c.dVv));
  if(!radar)basis='Sentinel-1 radar passes are loading or unavailable for this farm.';
  else if(radar.status==='unavailable')basis=radar.reason||'No Sentinel-1 passes were found for this footprint.';
  else if(!compared.length)basis=`Only ${radar.scenes?.length??0} pass(es) on orbit ${radar.orbit||'?'} so far; at least ${RADAR_POLICY.minReference+1} same-orbit passes are needed before a change can be measured.`;
  else if(layer==='radarChange'){const drops=compared.filter(c=>c.dVh<=-RADAR_POLICY.changeDb).sort((a,b)=>a.dVh-b.dVh),rises=compared.filter(c=>c.dVh>=RADAR_POLICY.changeDb).sort((a,b)=>b.dVh-a.dVh);choices=[...drops,...rises];basis=`${compared.length} cells compared: newest pass ${radar.latest.acquiredAt.slice(0,10)} against the median of ${radar.reference.count} earlier passes on the same orbit; ${drops.length} dropped and ${rises.length} rose by ${RADAR_POLICY.changeDb} dB or more in VH. Radar change marks a structural or moisture change, not its cause.`;}
  else{choices=compared.filter(c=>c.dVv>=RADAR_POLICY.wetDb).sort((a,b)=>b.dVv-a.dVv);basis=`${compared.length} cells compared in VV against the same-orbit median; ${choices.length} rose by ${RADAR_POLICY.wetDb} dB or more, a possible wetter-surface cue. Check standing water and drainage on the ground; canopy changes also move this signal.`;}
 }else if(COMPOSITE_KINDS[layer]){
  const inside=composite?composite.grid.cells.filter(c=>c.zoneId===zoneId&&Number.isFinite(c[composite.key])):[];
  if(!composite)basis='Seasonal composites are loading or unavailable for this farm.';
  else if(layer==='anomaly'){choices=inside.filter(c=>c.anomaly<=RULES.ndviDrop).sort((a,b)=>a.anomaly-b.anomaly);basis=inside.length?`${inside.length} clear cells compared with their seasonal median (at least ${composite.minObservations} clear observations each); ${choices.length} declined by 0.10 or more. A decline is a reason to inspect, not a cause.`:'No clear current pixels with a usable seasonal median in this zone yet.';}
  else if(layer==='twi'){choices=[...inside].sort((a,b)=>b.twi-a.twi);basis='Wettest terrain by the wetness index · check standing water and drainage after rain';}
  else if(layer==='slst'){choices=[...inside].sort((a,b)=>b.surfaceC-a.surfaceC);basis='Hottest seasonal surface · check shade, exposure and water status';}
  else{choices=[...inside].sort((a,b)=>a[composite.key]-b[composite.key]);basis=layer==='sndvi'?'Lowest seasonal greenness · check canopy gaps, stress or bare ground':'Lowest seasonal canopy moisture index · check water status and canopy condition';}
 }else if(layer==='exposure'){
  choices=(exposure?.grid.cells||[]).filter(c=>c.zoneId===zoneId&&Number.isFinite(c.display)).sort((a,b)=>b.display-a.display).map(c=>({...c,exposureCue:`Highest relative ${exposure.title.toLowerCase()} exposure in this zone`}));
  basis=exposure?`${exposure.title} · ${exposure.phase.label} · ${exposure.phase.message} Stops mark the highest coinciding ${exposure.components.filter(k=>k.available).map(k=>k.label.toLowerCase()).join(', ')}; environmental coincidence, not detection.`:'Exposure composites are loading or unavailable for this farm.';
 }else if(layer==='thermal'){
  choices=(thermal?.current?.cells||[]).filter(c=>c.zoneId===zoneId&&c.clear&&Number.isFinite(c.surfaceC)).sort((a,b)=>b.surfaceC-a.surfaceC);basis='Warmest dated cells · check current field condition';
 }else if(!advisory&&!['elevation','moisture'].includes(layer)){
  const compared=(satellite?.current?.cells||[]).filter(c=>c.zoneId===zoneId&&eligible.get(zoneId)&&c.clear&&Number.isFinite(c.ndviChange));
  const shortGap=satellite?.baseline?.interval==='short'?satellite.baseline.gapDays:null,shortNote=shortGap?` Only ${shortGap} day${shortGap===1?'':'s'} separate the two clear scenes because no clear scene ten or more days older exists; differences this small mostly reflect atmosphere and viewing conditions, not canopy change.`:'';
  choices=compared.filter(c=>c.ndviChange<=RULES.ndviDrop).sort((a,b)=>a.ndviChange-b.ndviChange);basis='Canopy-change candidates · walk them to find the cause'+(shortGap?` · clear scenes only ${shortGap} days apart`:'');
  // A comparison with no decline is a finding, not an empty layer: say what the cells did.
  if(compared.length&&!choices.length){const up=compared.filter(c=>c.ndviChange>=.1).length,lo=Math.min(...compared.map(c=>c.ndviChange)),hi=Math.max(...compared.map(c=>c.ndviChange));basis=`${compared.length} cells compared between ${satellite.baseline.acquiredAt.slice(0,10)} and ${satellite.current.acquiredAt.slice(0,10)}: none declined by 0.10 or more (range ${lo>=0?'+':''}${lo.toFixed(2)} to ${hi>=0?'+':''}${hi.toFixed(2)}${up?`, ${up} increased by 0.10 or more`:''}). No decline candidates to inspect; canopy looks stable at this resolution.${shortNote}`;}
 }else{
  choices=records.filter(r=>r.zoneId===zoneId&&r.topic===topic&&r.point).sort((a,b)=>b.createdAt-a.createdAt).map(r=>({...r.point,i:'record-'+r.id,zoneId,record:r}));basis='Recorded field locations · recheck signs or practice';
 }
 let candidates=spreadCandidates(choices,5);
 const scoutingAvailable=!!SCOUTING_GUIDES[layer],guide=SCOUTING_GUIDES[layer]||(layer==='exposure'?SCOUTING_GUIDES[EXPOSURE_TOPICS[exposureTopic]?.alertTopic||exposureTopic]||null:null);
 if(scoutingAvailable&&includeScoutingPlan){candidates=addScoutingPlan({topic,model,geometry:farm.geometry,grid,priorityPoints:candidates,solar});const planned=candidates.filter(c=>c.planned).length;basis=`${candidates.length-planned} evidence-led stop(s) · ${planned} planned scouting stop(s). P pins gather observations; S pins follow existing evidence.`;}
 else if(guide)candidates=candidates.map((c,i)=>({...c,label:`S${i+1}`,scoutChecklist:guide.checks}));
 if(!candidates.length&&layer!=='exposure'&&!COMPOSITE_KINDS[layer]&&!['radarChange','radarWet'].includes(layer)&&!(layer==='change'&&basis.includes('compared between')))basis=advisory?'No supported local scouting pins yet. Zone-wide conditions cannot locate affected plants. Select a cell to record cultivar, symptoms or management conditions.':['change','wsb'].includes(layer)&&satellite?.current&&!satellite.baseline?`No earlier clear scene is available to compare with the ${satellite.current.acquiredAt.slice(0,10)} observation, so canopy change cannot be computed here yet. Use Canopy greenness · NDVI for the current scene.`:['change','wsb'].includes(layer)&&satellite?.current&&!eligible.get(zoneId)?'The latest clear scene is too old or too clouded over this zone for a change comparison. Use Canopy greenness · NDVI for what is visible.':'No qualifying locations in this layer. Select a map location to begin a field observation.';
 return {layer,topic,model,models,grid,colors,zoneColors,advisory,candidates,candidateBasis:basis,title:LAYER_INFO[layer][0],description:LAYER_INFO[layer][1],dem:drainage,scoutingAvailable,guide,includeScoutingPlan,solar,solarBasis,exposure,exposureTopic,composite,radar,sun:layer==='solar'&&solar?{lon:farm.geometry.center.lon,lat:farm.geometry.center.lat,paths:solar.paths,label:solar.label}:null};
}
