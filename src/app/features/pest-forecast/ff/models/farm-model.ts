// @ts-nocheck
// Ported unchanged from Coffee-estate-twin/public/farm-model.js. Keep the logic byte-identical: the Node
// test suites and the Python backend parity test run against the original module.
export const FARM_ID='0c1e6f77-9b1d-441e-bda5-6531d8724f48';
export const DAY=86400000;
export function istDateParts(time){return Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(time)).filter(x=>x.type!=='literal').map(x=>[x.type,Number(x.value)]));}
export function isoDateIST(time){const p=istDateParts(time);return `${p.year}-${String(p.month).padStart(2,'0')}-${String(p.day).padStart(2,'0')}`;}
function stageFromTitle(title){const s=title.toLowerCase();if(/pre-harvest|berry development|bean fill/.test(s))return 6;if(/harvest/.test(s))return 8;if(/flower/.test(s))return 4;if(/fruit sett/.test(s))return 5;if(/prun|shade management/.test(s))return 12;return null;}
export function cycleAt(calendar,time=Date.now(),floweringDate=null,species='Arabica'){
  if(floweringDate){
    const start=Date.parse(floweringDate+'T00:00:00+05:30');const days=Math.floor((time-start)/DAY);
    if(Number.isFinite(start)&&days>=0&&days<500){
      const robusta=/robusta/i.test(species);const limits=robusta?[10,45,225,300,350]:[10,45,180,240,290];
      let stage=4,progress=0;const stages=[4,5,6,7,8,12];let lower=0;
      for(let i=0;i<limits.length+1;i++){const upper=limits[i]??500;if(days<=upper){stage=stages[i];progress=(days-lower)/Math.max(1,upper-lower);break;}lower=upper;}
      return {stage,progress,basis:'flowering-estimate',label:'From your flowering date',detail:`${days} days after your locally entered flowering date.`,sourceTitle:'Local flowering date',days};
    }
  }
  const d=istDateParts(time),date=Date.UTC(d.year,d.month-1,d.day);
  for(const event of calendar?.common||[]){
    const originalStart=new Date(event.start),originalEnd=new Date(event.end);
    if(!Number.isFinite(+originalStart)||!Number.isFinite(+originalEnd))continue;
    for(const year of [d.year-1,d.year]){
      const start=Date.UTC(year,originalStart.getUTCMonth(),originalStart.getUTCDate());
      const wraps=originalEnd.getUTCMonth()<originalStart.getUTCMonth()||(originalEnd.getUTCMonth()===originalStart.getUTCMonth()&&originalEnd.getUTCDate()<originalStart.getUTCDate());
      const end=Date.UTC(year+(wraps?1:0),originalEnd.getUTCMonth(),originalEnd.getUTCDate())+DAY;
      if(date>=start&&date<end){const stage=stageFromTitle(event.title);if(stage!==null)return {stage,progress:(date-start)/(end-start),basis:'seasonal-estimate',label:'Seasonal estimate',detail:`${originalStart.getUTCFullYear()} estate calendar template projected onto ${d.year}.`,sourceTitle:event.title,sourceYear:originalStart.getUTCFullYear()};}
    }
  }
  return {stage:null,progress:0,basis:'unknown',label:'Crop stage not set',detail:'No applicable calendar stage or flowering date is available.',sourceTitle:null};
}
export function pointInRing(point,ring){let inside=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if(((a[1]>point[1])!==(b[1]>point[1]))&&(point[0]<(b[0]-a[0])*(point[1]-a[1])/(b[1]-a[1])+a[0]))inside=!inside;}return inside;}
export function pointInZone(point,zone){return pointInRing(point,zone.rings[0])&&!zone.rings.slice(1).some(r=>pointInRing(point,r));}
export function geometryModel(geometry){
  const origin=geometry.center,cos=Math.cos(origin.lat*Math.PI/180);
  const project=(lon,lat)=>[(lon-origin.lon)*111320*cos,-(lat-origin.lat)*111320];
  const unproject=(x,z)=>[origin.lon+x/(111320*cos),origin.lat-z/111320];
  const width=(geometry.bounds.east-geometry.bounds.west)*111320*cos,depth=(geometry.bounds.north-geometry.bounds.south)*111320;
  const scale=54/Math.max(width,depth,1),base=geometry.elevationMin??0;
  const samples=geometry.elevations.map(p=>({point:project(p.lon,p.lat),alt:p.alt}));
  function elevation(x,z){
    if(!samples.length)return null;
    const nearest=samples.map(p=>({alt:p.alt,d:(p.point[0]-x)**2+(p.point[1]-z)**2})).sort((a,b)=>a.d-b.d).slice(0,6);
    if(nearest[0].d<.01)return nearest[0].alt;
    let total=0,weight=0;nearest.forEach(p=>{const w=1/p.d;total+=p.alt*w;weight+=w;});return total/weight;
  }
  function ringArea(r){const p=r.map(([lon,lat])=>project(lon,lat));let a=0;p.forEach((v,i)=>{const n=p[(i+1)%p.length];a+=v[0]*n[1]-n[0]*v[1];});return Math.abs(a/2);}
  const zones=geometry.zones.map(z=>({...z,areaM2:ringArea(z.rings[0])-z.rings.slice(1).reduce((a,r)=>a+ringArea(r),0)}));
  return {origin,project,unproject,width,depth,scale,base,elevation,zones,totalArea:zones.reduce((sum,z)=>sum+z.areaM2,0)};
}
export function vaporPressureDeficit(temp,rh){if(!Number.isFinite(temp)||!Number.isFinite(rh))return null;return .6108*Math.exp(17.27*temp/(temp+237.3))*(1-Math.max(0,Math.min(100,rh))/100);}

export const WATER_DEFAULTS={depth:[300,300,400],theta:[.24,.26,.27],fc:[.32,.34,.36],sat:[.44,.46,.48],wp:[.12,.15,.17]};
export function waterStep(start,{rain=0,demand=0,hours=3,mulch=false}={}){
  if(!Array.isArray(start)||start.length!==3||start.some(v=>!Number.isFinite(v)||v<0)||![rain,demand,hours].every(v=>Number.isFinite(v)&&v>=0)||hours===0)throw new Error('Invalid water-model inputs');
  const cfg=WATER_DEFAULTS,s=start.slice(),initial=s.reduce((a,b)=>a+b,0),interception=.12*rain;
  const throughfall=rain-interception,runoff=Math.max(0,throughfall-35*hours/24),infiltration=throughfall-runoff;
  let incoming=infiltration;
  const transfer=[];
  for(let i=0;i<3;i++){s[i]+=incoming;const overflow=Math.max(0,s[i]-cfg.sat[i]*cfg.depth[i]);s[i]-=overflow;const gravity=Math.max(0,s[i]-cfg.fc[i]*cfg.depth[i])*(1-Math.pow(.55,hours/24));s[i]-=gravity;incoming=overflow+gravity;transfer.push(incoming);}
  const drainage=incoming,evaporation=Math.min(Math.max(0,s[0]-cfg.wp[0]*cfg.depth[0]),demand*.4*(mulch?.45:1));s[0]-=evaporation;
  let transpiration=0;[.55,.35,.1].forEach((w,i)=>{const t=Math.min(Math.max(0,s[i]-cfg.wp[i]*cfg.depth[i]),demand*.6*w);s[i]-=t;transpiration+=t;});
  const final=s.reduce((a,b)=>a+b,0),et=evaporation+transpiration,residual=initial+rain-final-interception-runoff-drainage-et;
  return {layers:s,initial,final,interception,runoff,infiltration,transfer,drainage,evaporation,transpiration,et,residual,theta:s.map((v,i)=>v/cfg.depth[i])};
}
export function projectForecast(slots,{dailyDemand=4,mulch=false}={}){
  if(!Number.isFinite(dailyDemand)||dailyDemand<0||dailyDemand>10)throw new Error('Invalid assumed demand');
  let layers=WATER_DEFAULTS.theta.map((v,i)=>v*WATER_DEFAULTS.depth[i]);const initial=layers.reduce((a,b)=>a+b,0);
  const totals={rain:0,et:0,interception:0,runoff:0,drainage:0};
  return slots.map(slot=>{
    const hour=Number(new Intl.DateTimeFormat('en-GB',{hour:'2-digit',hourCycle:'h23',timeZone:'Asia/Kolkata'}).format(new Date(slot.time)));
    const demand=dailyDemand/8*(hour>=6&&hour<18?1.5:.5);
    const step=waterStep(layers,{rain:slot.rainMm,demand,hours:3,mulch});layers=step.layers;
    totals.rain+=slot.rainMm;for(const k of ['et','interception','runoff','drainage'])totals[k]+=step[k];
    return {...slot,water:step,cumulative:{...totals,change:step.final-initial,storage:step.final,residual:initial+totals.rain-step.final-totals.et-totals.interception-totals.runoff-totals.drainage}};
  });
}
export function effectNotes(slot,cycle,projection){
  if(!slot)return [];
  const rain=slot.rainMm||0,rh=slot.humidity;
  const vpd=vaporPressureDeficit(slot.temperatureC,rh);
  return [
    {title:rain>0?'Rain enters the root-zone scenario':'No rain in this forecast interval',value:`${rain.toFixed(1)} mm / 3 h`,text:projection?`${projection.water.infiltration.toFixed(1)} mm infiltrates; ${projection.water.runoff.toFixed(1)} mm becomes surface runoff under the stated soil assumptions.`:'Rainfall shown is the forecast.'},
    {title:'Leaf drying conditions',value:rh===null?'Unavailable':`${Math.round(rh)}% humidity`,text:rh>=90?'High forecast humidity can slow leaf and cherry drying. Check leaves and cherries in shaded rows.':`Air drying demand ${vpd===null?'unavailable':vpd.toFixed(2)+' kPa VPD'}.`},
    {title:'Crop-stage context',value:cycle?.stage===null?'Not set':cycle?.stage>=8?'Harvest / post-harvest':cycle?.stage===4?'Flowering':cycle?.stage===5?'Fruit set':'Berry development',text:cycle?.stage>=8?'Compare wet and dry forecast intervals with picking and drying plans. Product moisture still needs direct measurement.':cycle?.stage===4?'Record real flower opening and rainfall timing. Weather does not confirm that flowering occurred.':'Water and atmospheric conditions provide context for developing fruit. The scene does not predict yield or berry size.'}
  ];
}
