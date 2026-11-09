// @ts-nocheck
// Ported unchanged from Coffee-estate-twin/public/risk-model.js. Keep the logic byte-identical: the Node
// test suites and the Python backend parity test run against the original module.
// Screening rules, not fitted disease probabilities. Thresholds and missing inputs
// are deliberately inspectable. Observation location is never spread to a zone.
const readableStamp=raw=>{const m=/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(raw||'');if(!m)return raw||'time unavailable';const h=+m[4],mon=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][+m[2]-1];return `${+m[3]} ${mon}, ${h%12||12}:${m[5]} ${h<12?'AM':'PM'}`;};
export const MODEL_VERSION='coffee-screen-2026-09-v2';
export const SOURCES={
 rust:'https://ccri100.org/new-ui/pdf/pathology/INTEGRATED%20MANAGEMENT%20OF%20COFFEE%20LEAF%20RUST%20DISEASE.pdf',
 shade:'https://worldcoffeeresearch.org/news/2020/when-it-comes-to-coffee-leaf-rust-is-shade-good-or-bad-for-coffee',
 wsb:'https://coffeeboard.gov.in/Planter/WSM-Eng.pdf',
 shothole:'https://ccri100.org/new-ui/pdf/entomology/MANAGEMENT%20OF%20SHOT%20HOLE%20BORER.pdf',
 mealybug:'https://ccri100.org/new-ui/pdf/entomology/MANAGEMENT%20OF%20SUCKING%20PESTS.pdf',
 root:'https://ccri100.org/new-ui/pdf/pathology/INTEGRATED%20MANAGEMENT%20OF%20ROOT%20DISEASES.pdf',
 berryborer:'https://www3.ctahr.hawaii.edu/oc/freepubs/pdf/IP-47.pdf',
 board:'https://coffeeboard.gov.in/planter.aspx'
};
// Expiry is an application review policy, not a biological persistence estimate.
export const FIELD_INPUTS={
 species:{label:'Planted coffee',options:{arabica:'Arabica',robusta:'Robusta',mixed:'Mixed Arabica / Robusta'},days:180},
 rustSusceptibility:{label:'Cultivar rust susceptibility',options:{susceptible:'Known susceptible',tolerant:'Known tolerant'},days:180},
 fruitStage:{label:'Observed fruit stage',options:{none:'No berries',green:'Green developing berries',ripe:'Ripe / harvest berries',residual:'Residual berries after harvest'},days:14},
 fruitLoad:{label:'Fruit load',options:{normal:'Normal for these plants',heavy:'Heavy crop load'},days:30},
 airflow:{label:'Air movement through bushes',options:{open:'Open / ventilated',restricted:'Crowded / slow drying'},days:30},
 nutrition:{label:'Nutrition evidence',options:{adequate:'Recent nutrient plan / adequate status',deficient:'Deficiency reported'},days:90},
 nutrientPlan:{label:'Fertilizer plan for this split',options:{ready:'Nutrient plan with product, dose and due split recorded in notes',notready:'Plan or next split not yet confirmed'},days:30},
 nutrientMethod:{label:'Application method covered by the due nutrient plan',options:{soil:'Solid fertilizer placed by hand',foliar:'Leaf nutrient spray',both:'Both methods explicitly covered in the recorded plan'},days:30},
 soilState:{label:'Ground check for fertilizer placement',options:{dry:'Dry soil / water stress needs review',moist:'Moist and workable, not saturated',saturated:'Saturated / waterlogged'},days:2},
 runoffCheck:{label:'Ground drainage and fertilizer exclusion areas',options:{clear:'Checked drains, water edges and required buffers; application area identified',blocked:'Runoff route / exclusion area unresolved'},days:2},
 terrainCheck:{label:'Slopes, low ground and access in the recorded area',options:{clear:'Footing, erosion and runoff checked; this method is suitable throughout the recorded area',blocked:'Unsafe access, erosion or unsuitable terrain; do not work here'},days:2},
 groundSlope:{label:'Observed ground at this location',options:{flat:'Level ground',sloping:'Sloping ground'},days:180},
 groundUphillDegrees:{label:'Measured uphill compass bearing · 0° N, 90° E, 180° S, 270° W',min:0,max:360,days:180},
 sprayCheck:{label:'Leaf-spray field check',options:{clear:'Product suitability, plants, downwind receptors and application setup checked',blocked:'Field / product checks not clear'},days:1},
 residualBerries:{label:'Old berries on trees / ground',options:{yes:'Present',no:'Checked, none found'},days:14},
 ants:{label:'Ants attending colonies',options:{yes:'Observed',no:'Checked, none seen'},days:14},
 stumps:{label:'Rotting stumps / affected neighbouring roots',options:{yes:'Present',no:'Checked, absent'},days:180},
 standingWater:{label:'Standing water / saturated soil',options:{yes:'Observed',no:'Checked, absent'},days:2},
 tenderTwigs:{label:'Tender twigs available',options:{yes:'Present',no:'Checked, absent'},days:14},
 leafWetnessHours:{label:'Observed leaf wetness hours in the work day',min:0,max:24,days:1},
 cherryBrix:{label:'Measured cherry Brix at this location · °Bx refractometer',min:0,max:40,days:14},
 harvestGrade:{label:'Observed cherry ripeness at this location',options:{unripe:'Mostly green / unripe',mixed:'Mixed ripeness on the branch',ripe:'Mostly ripe, even colour',overripe:'Overripe / dried on the tree'},days:14},
 shadePercent:{label:'Measured shade cover',min:0,max:100,days:30}
};
const DAY=86400000,finite=Number.isFinite;
export function recordAge(record,now){const t=Date.parse(record.date+'T00:00:00+05:30');return finite(t)?(now-t)/DAY:Infinity;}
export function recentRecords(records,now,days=14){return records.filter(r=>recordAge(r,now)>=0&&recordAge(r,now)<=days).sort((a,b)=>b.date.localeCompare(a.date)||(b.createdAt||0)-(a.createdAt||0));}
export function activeInspections(records,topic,now){
 const seen=new Set();return recentRecords(records.filter(r=>r.kind==='inspection'&&r.topic===topic),now).filter(r=>{
  const key=r.point?`${r.point.lat.toFixed(6)},${r.point.lon.toFixed(6)}`:'zone';if(seen.has(key))return false;seen.add(key);return true;
 });
}
export function fieldContext(records,now=Date.now()){
 const out={};
 for(const r of recentRecords(records,now,366))for(const [key,spec] of Object.entries(FIELD_INPUTS)){
  const value=key==='shadePercent'?(r.shadePercent??r.conditions?.[key]):r.conditions?.[key];
  // A newer explicit unknown clears an older assertion.
  if(!(key in out)&&value!==undefined&&recordAge(r,now)<=spec.days)out[key]={value,date:r.date,recordId:r.id,point:r.point??null};
 }
 return out;
}
const known=v=>v!==undefined&&v!==null&&v!=='unknown';
export function observedWeather(farm,now){
 const w=farm?.weather,t=Date.parse(w?.reportedAt),explicit=w?.timeZoneExplicit===true&&/(?:Z|[+-]\d\d:\d\d)$/.test(w?.reportedAt||'');
 const fresh=explicit&&finite(t)&&now-t>=-300000&&now-t<=6*3600000;
 return {fresh,temperatureC:fresh&&finite(w.temperatureC)?w.temperatureC:null,humidity:fresh&&finite(w.humidity)?w.humidity:null,leafWetness:w?.leafWetness??null,reportedAt:w?.reportedAt??null};
}
export function assessRisk({topic,weather:w,species,cycle,month,context={},station={},now=Date.now()}){
 const v=k=>context[k]?.value, factors=[],gaps=[];
 const factor=(name,value,evidence='forecast',effect='context')=>factors.push({name,value,evidence,effect});
 const input=(key,effect='context')=>{const value=v(key),spec=FIELD_INPUTS[key];if(!known(value)){gaps.push(spec.label);return undefined;}factor(spec.label,`${spec.options?.[value]??value}${key==='shadePercent'?'%':key==='leafWetnessHours'?' h':''} · ${context[key].date}`,'field report',effect);return value;};
 const host=known(v('species'))?v('species'):species||'',arabica=/arabica|mixed/i.test(host),robusta=/robusta|mixed/i.test(host),hostKnown=arabica||robusta;
 let priority=1,status='Routine inspection',mechanism='',trigger=false;
 if(['rust','wsb','shothole','mealybug'].includes(topic)){factor('Host',hostKnown?host:'Not recorded',known(v('species'))?'field report':'device registration');if(!known(v('species')))gaps.push('Record the planted rows and cultivar for this zone');}
 const weatherFactor=(name,detail,available=w.available)=>{factor(name,available?detail:'No complete, fresh forecast sequence',available?'forecast':'missing');if(!available)gaps.push('Fresh temperature, humidity and rain forecast');};
 if(topic==='rust'){
  mechanism='Susceptible leaves + free water + suitable temperature permit fungal infection; rust spores and actual wetness duration remain necessary field evidence.';
  const susceptibility=input('rustSusceptibility'),wet=input('leafWetnessHours'),load=input('fruitLoad'),nutrition=input('nutrition');input('airflow');input('shadePercent');
  weatherFactor('Warm, humid wet-weather screen',`${w.rustRun} consecutive 3-hour samples at 22–27 °C and humidity of 80% or more, with rain in the sequence`);
  const observed=station.fresh&&station.temperatureC>=22&&station.temperatureC<=27&&station.humidity>=80&&wet>0;
  trigger=!!(w.rustWatch||observed);
  priority=trigger?2:w.available?1:0;status=trigger?'Rust conditions · inspect':w.available?'No rust weather trigger':'Rust weather unknown';
  const lowerSusceptibility=susceptibility==='tolerant'||(!arabica&&robusta&&susceptibility!=='susceptible');
  if(trigger&&lowerSusceptibility&&!(load==='heavy'&&nutrition==='deficient')){priority=1;status='Tolerant host · wet-weather review';}
  else if(trigger&&(susceptibility==='susceptible'||arabica))status='Susceptible host · rust weather watch';
  factor('Susceptibility modifier',susceptibility==='tolerant'||(!arabica&&robusta)?'Tolerance lowers concern; it does not exclude rust.':susceptibility==='susceptible'||arabica?'Susceptible cultivar or Arabica host adds concern.':'Cultivar susceptibility is unknown.','host context');
  if(load==='heavy'&&nutrition==='deficient')factor('Plant burden','Heavy fruit load and reported nutrient deficiency add inspection priority.','field report','increase');
  gaps.push('Rust spores / leaf check by inspection','Hours of leaf wetness measured in the field');
  factor('Shade interpretation','Shade alone has no fixed risk direction. Inspect drying, airflow, rain exposure and plant condition.','research context');
 }else if(topic==='blackrot'){
  mechanism='Koleroga screening follows sustained humid, wet leaf conditions and slow drying, separately from rust’s temperature screen.';
  const airflow=input('airflow'),shade=input('shadePercent'),wet=input('leafWetnessHours');
  weatherFactor('Persistent humid rain sequence',`${w.blackrotRun} consecutive 3-hour samples at humidity of 90% or more, with rain in at least two samples`,w.blackrotAvailable);
  trigger=!!(w.blackrotWatch||(station.fresh&&station.humidity>=90&&wet>=12));priority=trigger?2:w.blackrotAvailable?1:0;status=trigger?'Persistent wet-leaf watch':w.blackrotAvailable?'No persistent wet trigger':'Wet-leaf evidence needed';
  if(airflow==='restricted'||shade>=70)factor('Drying constraint','Reported crowding / high shade warrants checking inner foliage during wet spells.','field report','increase');
  gaps.push('Hanging mist and actual leaf cover drying history','Fungal threads / affected leaves and berries confirmed in the field');
 }else if(topic==='wsb'){
  mechanism='Arabica stems, seasonal adult flight and exposure guide scouting. Bright, hot conditions favour activity; wet, cloudy spells can delay emergence.';
  const shade=input('shadePercent'),flight=[4,5,10,11,12].includes(month),preflight=[3,9].includes(month);
  trigger=arabica&&(flight||preflight);priority=trigger?2:hostKnown?1:0;status=trigger?(preflight?'Pre-flight stem inspection':'Seasonal stem-borer watch'):'Host / stem inspection';
  factor('Flight calendar',preflight?'March / September pre-flight planning':flight?'Typical April–May / October–December flight period':'Outside default flight window','seasonal estimate');
  if(w.available)factor('Flight weather',w.persistentWet?'Wet forecast may delay flight; it does not cancel stem checks.':'Check actual sun exposure and local adult / trap activity.');
  if(shade<35)factor('Stem exposure','Low measured shade: inspect exposed Arabica stems.','field report','increase');
  gaps.push('Stem symptoms, infestation history and local adult / trap observations');
 }else if(topic==='shothole'){
  mechanism='Shot-hole borer favours Robusta and tender twigs; its associated ambrosia fungus benefits from humid, heavily shaded conditions.';
  const shade=input('shadePercent'),twigs=input('tenderTwigs'),airflow=input('airflow'),season=[9,10,11,12,1].includes(month);
  weatherFactor('Humid-period context',`${w.humidRun} consecutive 3-hour samples at humidity of 85% or more`,w.humidityAvailable);
  trigger=robusta&&w.humidRun>=4&&(season||shade>=70||airflow==='restricted')&&twigs!=='no';priority=trigger?2:!w.available&&!hostKnown?0:1;status=trigger?'Humid twig-borer watch':'Twig / host review';
  factor('Season',season?'September–January population-watch period':'Outside the default September–January peak','seasonal estimate');
  gaps.push('Twig entry holes and pest identification; wilt alone is nonspecific');
 }else if(topic==='mealybug'){
  mechanism='Mealybug activity is screened for warmth with intermittent moisture and ant attendance. Persistent cool, wet weather is not the same trigger. Scales still require separate identification.';
  const ants=input('ants');weatherFactor('Warm intermittent-moisture screen',`${w.warmSamples} samples ≥27 °C; ${w.wetSamples} rainy and ${w.drySamples} dry samples; prolonged wet sequence ${w.persistentWet?'present':'absent'}`);
  trigger=ants==='yes'||w.mealyWatch;priority=trigger?2:w.available?1:0;status=ants==='yes'?'Ant-attended colony check':w.mealyWatch?'Warm / intermittent-moisture watch':w.available?'No mealybug weather trigger':'Colony evidence needed';
  if(w.persistentWet)factor('Persistent wet spell','Continuous wet conditions do not activate the warm / intermittent-moisture rule.');
  gaps.push('Mealybug versus scale identification, colony counts and natural enemies','Irrigation history; weather rain does not capture irrigation');
 }else if(topic==='berryborer'){
  mechanism='Berries available for breeding, residual fruit and local infestation drive this pest screen. Weather influences development but cannot replace berry inspection.';
  const stage=input('fruitStage'),residual=input('residualBerries'),estimated=[6,7,8].includes(cycle.stage);
  trigger=['green','ripe','residual'].includes(stage)||residual==='yes';priority=trigger?2:1;status=trigger?'Berry / sanitation inspection':estimated&&!stage?'Estimated berry-stage watch':'Confirm berry availability';
  factor('Crop-cycle basis',stage?'Field-reported fruit condition overrides the calendar.':estimated?'Calendar suggests berries; check seed maturity and fruit on the plants.':'No fruit stage recorded yet.','phenology');
  if(w.available)factor('Temperature context',`Forecast maximum ${w.maxTemp.toFixed(1)} °C; no uncalibrated temperature-to-infestation conversion.`);
  gaps.push('Berry entry holes / traps / infestation history','No within-zone berry-load or sanitation map without located observations');
 }else if(topic==='root'){
  mechanism='Root health separates waterlogging stress from diseases associated with infected roots or old stumps. Wet soil alone does not identify a pathogen.';
  const pond=input('standingWater'),stumps=input('stumps');
  trigger=pond==='yes'||stumps==='yes'||w.heavyRain;priority=trigger?2:1;status=pond==='yes'?'Reported saturation · check roots':stumps==='yes'?'Root-contact / stump inspection':w.heavyRain?'Rain-related root check':'Root cause review';
  factor('Rain context',w.available?(w.heavyRain?'Heavy-rain screen active; inspect actual drainage.':'No heavy-rain screen triggered.'):'Forecast unavailable',w.available?'forecast':'missing');
  gaps.push('Root / collar examination and disease identification','Calibrated root-zone moisture, persistence and drainage history');
 }else if(topic==='heat'){
  mechanism='Air temperature and vapour-pressure deficit screen atmospheric demand; dated surface temperature and local shade guide where to inspect.';
  input('shadePercent');const observed=station.fresh&&station.temperatureC>=30;
  trigger=w.heat||observed;priority=trigger?2:w.heatAvailable?1:0;status=trigger?'Heat / drying watch':w.heatAvailable?'No heat weather trigger':'Heat weather unknown';
  weatherFactor('Atmospheric demand',`Maximum ${finite(w.maxTemp)?w.maxTemp.toFixed(1):'unknown'} °C; VPD ${finite(w.maxVpd)?w.maxVpd.toFixed(2):'unknown'} kPa`,w.heatAvailable);
  gaps.push('Calibrated soil moisture and plant water response','Young-plant and irrigation coverage map');
 }else if(topic==='drainage'){
  mechanism='Rain loading plus surface depressions / converging flow identify inspection candidates; actual ponding depends on surveyed ground, infiltration and outlets.';
  const pond=input('standingWater');trigger=w.heavyRain||pond==='yes';priority=trigger?2:1;status=pond==='yes'?'Standing water reported':w.heavyRain?'Rain readiness':'Terrain screening';
  factor('Upcoming rain',finite(w.rain24)?`${w.rain24.toFixed(1)} mm in the next 24 h`:'Complete 24-hour rainfall unavailable',finite(w.rain24)?'forecast':'missing');
  gaps.push('Drain / culvert survey, infiltration and ponding duration');
 }else if(topic==='nutrition'){
  mechanism='Fertilizer planning follows crop stage and your nutrient plan. Rain and saturated soil postpone it; doses follow your recorded plan.';
  const nutrition=input('nutrition'),pond=input('standingWater');input('fruitLoad');
  trigger=w.heavyRain||pond==='yes'||nutrition==='deficient';priority=trigger?2:1;status=w.heavyRain||pond==='yes'?'Check first':nutrition==='deficient'?'Review laboratory plan':'Soil-test / split review';
  factor('Seasonal split',[9,10,11].includes(month)?'Post-monsoon planning; confirm actual rain and crop stage':[4,5].includes(month)?'Pre-monsoon planning; confirm actual rain and crop stage':[4,5].includes(cycle.stage)?'Estimated post-blossom context':'Check current crop-stage and nutrient budget','seasonal estimate');
  gaps.push('Nutrient quantities and approved zone plan','Recorded nutrient plan for dose and timing');
 }else if(topic==='canopy'){
  mechanism='Canopy work balances shade protection during heat against observed crowding and slow drying. NDVI measures mixed leaf cover, not shade percentage.';
  input('shadePercent');const airflow=input('airflow');trigger=w.heat||(w.blackrotWatch&&airflow==='restricted');priority=trigger?2:1;status=w.heat?'Preserve heat protection':trigger?'Review slow-drying leaf cover':'Measure leaf cover structure';
  factor('Crop timing',cycle.stage===12?'Estimated post-harvest care; confirm field stage before major pruning.':'Time major pruning after harvest, before the next season.','phenology');
  gaps.push('Measured local shade and coffee-bush structure; shade trees can dominate NDVI');
 }
 if(station.fresh&&['rust','blackrot','heat'].includes(topic))factor('Current weather station',`${finite(station.temperatureC)?station.temperatureC:'unknown'} °C / ${finite(station.humidity)?station.humidity:'unknown'}% humidity · ${readableStamp(station.reportedAt)}`,'observed');
 if(['rust','blackrot'].includes(topic)&&station.leafWetness!==null&&station.leafWetness!==undefined)gaps.push('Hours of leaf wetness recorded in the field');
 return {topic,priority,status,trigger,mechanism,factors,gaps:[...new Set(gaps)],source:SOURCES[topic]||SOURCES.board,modelVersion:MODEL_VERSION};
}
