// @ts-nocheck
// Ported unchanged from Coffee-estate-twin/public/season-variety.js. Keep the logic byte-identical: the Node
// test suites and the Python backend parity test run against the original module.
// Season and variety filter. Off by default; when the grower switches it on, action cards and
// season maps for problems that are out of season this month, or that do not attack the variety
// recorded for the zone, are set aside. It orders attention. It never declares a zone safe: larvae,
// inoculum and residual berries persist between phases, and unknown or mixed plantings are never excluded.
export const SEASON_VARIETY_VERSION='season-variety-2026-09-v1';
const MONTHS=['January','February','March','April','May','June','July','August','September','October','November','December'];
// Active months per topic, as shown to the grower. Topics without a window (drainage, nutrition) always pass.
export const SEASON_WINDOWS={
 wsb:[3,4,5,9,10,11,12],cwsb:[3,4,5,9,10,11,12],
 rust:[6,7,8,9,10,11,12,1,2],
 blackrot:[6,7,8,9,10,11],
 berryborer:[6,7,8,9,10,11,12,1],
 shothole:[9,10,11,12,1],
 mealybug:[2,3,4,5],
 root:[6,7,8,9,10,11],
 heat:[2,3,4,5,6],
 canopy:[6,7,8,9,12,1,2]
};
export const SEASON_LABELS={
 wsb:'adult flights April to May and October to December, tracing in March and September',cwsb:'adult flights April to May and October to December, tracing in March and September',
 rust:'build-up June to September, peak October to December, carry-over January to February',
 blackrot:'active June to September, drying October to November',
 berryborer:'green berries June to August, ripening September to November, harvest sanitation December to January',
 shothole:'population peak September to January',
 mealybug:'dry-season build-up February to May',
 root:'waterlogging June to September, saturated soils October to November',
 heat:'peak March to May, shoulder months February and June',
 canopy:'slow drying June to September, pruning window December to February'
};
// Which planted coffee each problem is worth screening on. Absent means both.
export const VARIETY_HOSTS={wsb:['arabica'],cwsb:['arabica'],shothole:['robusta'],rust:['arabica']};
// 'Arabica', 'Robusta', 'Mixed Arabica / Robusta' or a registered crop list such as 'Coffee Arabica, Pepper'.
export function plantedSpecies(text){
 const s=String(text||'').toLowerCase(),a=/arabica/.test(s),r=/robusta/.test(s);
 return a&&r?'mixed':a?'arabica':r?'robusta':null;
}
export function topicGate(topic,{month,species=null,rustSusceptibility=null}={}){
 const window=SEASON_WINDOWS[topic],inSeason=!window||!Number.isInteger(month)||window.includes(month);
 const hosts=VARIETY_HOSTS[topic],kind=plantedSpecies(species);
 // Unknown or mixed planting never excludes. A recorded rust-susceptible cultivar keeps rust on any planting.
 const hostMatch=!hosts||!kind||kind==='mixed'||hosts.includes(kind)||(topic==='rust'&&rustSusceptibility==='susceptible');
 const reasons=[];
 if(!inSeason)reasons.push(`out of season in ${MONTHS[month-1]} (${SEASON_LABELS[topic]})`);
 if(!hostMatch)reasons.push(`${hosts.join(' or ')} problem; this zone is recorded as ${kind}`);
 return {topic,inSeason,hostMatch,pass:inSeason&&hostMatch,reasons,varietyKnown:!!kind,gated:!!(window||hosts)};
}
// Cards with reported signs or an overdue follow-up are evidence, not screening, and are never set aside.
export function gateAlerts(alerts,ctx,{keep=a=>a.priority>=3||a.overdue===true}={}){
 const kept=[],hidden=[];
 for(const a of alerts){const gate=topicGate(a.topic,ctx);const pass=gate.pass||keep(a);(pass?kept:hidden).push({...a,gate:{...gate,keptByEvidence:!gate.pass&&pass}});}
 return {kept,hidden,version:SEASON_VARIETY_VERSION};
}
