// @ts-nocheck
// Ported unchanged from Coffee-estate-twin/public/season-model.js. Keep the logic byte-identical: the Node
// test suites and the Python backend parity test run against the original module.
// Season-to-date thermal time from a shared, farm-scale temperature history. Degree-days
// are an uncalibrated development index for comparing seasons and reading published
// ranges; they do not predict a ripening date or cup quality at Palthope.
import { isoDateIST, DAY } from './farm-model';

export const SEASON_VERSION='coffee-season-2026-09-v1';
// baseC: development base used in Arabica phenology studies. hotC matches the existing heat
// screen. literatureGdd: flowering-to-ripe thermal sums reported for Arabica in Brazilian
// studies; a reading aid only. windowDays: history requested from the archive.
export const SEASON_POLICY={baseC:10,hotC:30,literatureGdd:[2600,2900],windowDays:400,fallbackDays:90,minHours:20};
const finite=Number.isFinite,isoDate=/^\d{4}-\d{2}-\d{2}$/;

// The flowering anchor: a locally entered flowering date first, else the estate calendar's
// flowering-window start projected onto the most recent occurrence, else nothing.
export function floweringAnchor(calendar,floweringDate,now=Date.now()){
 const today=isoDateIST(now);
 if(isoDate.test(floweringDate||'')){const t=Date.parse(floweringDate+'T00:00:00+05:30');if(finite(t)&&floweringDate<=today&&now-t<=500*DAY)return {date:floweringDate,basis:'flowering-date',label:'Locally entered flowering date'};}
 const year=Number(today.slice(0,4));let best=null;
 for(const e of calendar?.common||[]){
  if(!/flower/i.test(e.title||''))continue;const s=new Date(e.start);if(!finite(+s))continue;
  for(const y of [year-1,year]){const date=`${y}-${String(s.getUTCMonth()+1).padStart(2,'0')}-${String(s.getUTCDate()).padStart(2,'0')}`;if(date<=today&&(!best||date>best.date))best={date,basis:'calendar-template',label:`Estate calendar flowering window start (${s.getUTCFullYear()} template projected)`,title:e.title};}
 }
 return best;
}
// Accumulate from the anchor to yesterday; today is shown separately as partial. Weeks are
// counted from the anchor. Coverage compares complete days with the days expected.
export function seasonToDate(history,{anchor=null,now=Date.now()}={}){
 const today=isoDateIST(now),start=anchor?.date??isoDateIST(now-SEASON_POLICY.fallbackDays*DAY);
 const days=(history?.days||[]).filter(d=>isoDate.test(d.date||'')&&d.date>=start&&d.date<=today).sort((a,b)=>a.date.localeCompare(b.date));
 const startMs=Date.parse(start+'T00:00:00+05:30'),weekOf=date=>Math.floor((Date.parse(date+'T00:00:00+05:30')-startMs)/(7*DAY));
 let gdd=0;const rows=[],weeks=new Map();
 for(const d of days){
  const complete=!d.partial&&d.hours>=SEASON_POLICY.minHours&&finite(d.tMean),inc=complete?Math.max(0,d.tMean-SEASON_POLICY.baseC):null;
  if(complete)gdd+=inc;
  rows.push({...d,complete,gdd:complete?+inc.toFixed(2):null,cumulativeGdd:+gdd.toFixed(1)});
  if(!complete)continue;
  const k=weekOf(d.date),w=weeks.get(k)??{week:k+1,from:isoDateIST(startMs+k*7*DAY),days:0,rainMm:0,rainKnown:0,hotHours:0,temps:[]};weeks.set(k,w);
  w.days++;w.hotHours+=d.hotHours||0;w.temps.push(d.tMean);if(finite(d.rainMm)){w.rainMm+=d.rainMm;w.rainKnown++;}
 }
 const complete=rows.filter(r=>r.complete),expectedDays=Math.max(0,Math.round((Date.parse(today+'T00:00:00+05:30')-startMs)/DAY)),temps=complete.map(r=>r.tMean);
 const literature=anchor?{low:SEASON_POLICY.literatureGdd[0],high:SEASON_POLICY.literatureGdd[1],shareOfLow:+(gdd/SEASON_POLICY.literatureGdd[0]).toFixed(3),shareOfHigh:+(gdd/SEASON_POLICY.literatureGdd[1]).toFixed(3)}:null;
 return {version:SEASON_VERSION,anchor,start,today,rows,gdd:+gdd.toFixed(1),baseC:SEASON_POLICY.baseC,hotC:SEASON_POLICY.hotC,daysSinceAnchor:expectedDays,completeDays:complete.length,expectedDays,coverage:expectedDays?+(complete.length/expectedDays).toFixed(3):null,meanTemp:temps.length?+(temps.reduce((a,b)=>a+b,0)/temps.length).toFixed(1):null,maxTemp:complete.length?Math.max(...complete.map(r=>r.tMax)):null,hotHours:complete.reduce((n,r)=>n+(r.hotHours||0),0),hotDays:complete.filter(r=>r.tMax>=SEASON_POLICY.hotC).length,rainMm:+complete.reduce((n,r)=>n+(finite(r.rainMm)?r.rainMm:0),0).toFixed(1),rainKnownDays:complete.filter(r=>finite(r.rainMm)).length,weeks:[...weeks.values()].sort((a,b)=>a.week-b.week).map(w=>({...w,rainMm:+w.rainMm.toFixed(1),meanTemp:+(w.temps.reduce((a,b)=>a+b,0)/w.temps.length).toFixed(1),temps:undefined})),literature,latest:complete.at(-1)??null,todaySoFar:rows.find(r=>r.date===today&&!r.complete)??null,sources:history?.sources??null,retrievedAt:history?.retrievedAt??null,checkedAt:history?.checkedAt??null,stale:history?.stale===true};
}
