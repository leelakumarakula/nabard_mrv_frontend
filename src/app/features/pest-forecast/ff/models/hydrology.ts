// @ts-nocheck
// Ported unchanged from Coffee-estate-twin/public/hydrology.js. Keep the logic byte-identical: the Node
// test suites and the Python backend parity test run against the original module.
// D8 routing on the unfilled surface. This is an inspection screen, not a flood model.
export function drainageScreen(dem){
 if(!dem?.cells?.length)return null;
 const {width,height,bounds}=dem,lat=(bounds.north+bounds.south)/2;
 const dx=(bounds.east-bounds.west)*111320*Math.cos(lat*Math.PI/180)/width,dy=(bounds.north-bounds.south)*111320/height;
 const cells=dem.cells.map(c=>({...c,to:null,slope:0,accumulation:1,sink:false,edge:false})),byIndex=new Map(cells.map(c=>[c.i,c]));
 for(const c of cells){
  if(!Number.isFinite(c.elevation))continue;
  let slope=0,neighbors=0;
  for(let dr=-1;dr<=1;dr++)for(let dc=-1;dc<=1;dc++){
   if(!dr&&!dc)continue;
   if(c.row+dr<0||c.row+dr>=height||c.col+dc<0||c.col+dc>=width){c.edge=true;continue;}
   const n=byIndex.get((c.row+dr)*width+c.col+dc);
   if(!Number.isFinite(n?.elevation)){c.edge=true;continue;}
   neighbors++;const fall=(c.elevation-n.elevation)/Math.hypot(dc*dx,dr*dy);
   if(fall>slope){slope=fall;c.to=n.i;}
  }
  c.slope=+(Math.atan(slope)*180/Math.PI).toFixed(1);
  c.sink=c.to===null&&!c.edge&&neighbors===8;
 }
 for(const c of [...cells].filter(c=>Number.isFinite(c.elevation)).sort((a,b)=>b.elevation-a.elevation))if(c.to!==null)byIndex.get(c.to).accumulation+=c.accumulation;
 const inside=cells.filter(c=>c.zoneId&&Number.isFinite(c.elevation)),sorted=inside.map(c=>c.accumulation).sort((a,b)=>a-b),cutoff=Math.max(4,sorted[Math.floor(sorted.length*.8)]||4);
 for(const c of cells){c.contributingAreaM2=Math.round(c.accumulation*dx*dy);c.convergence=c.accumulation>=cutoff;c.boundaryExit=!!c.zoneId&&c.to!==null&&!byIndex.get(c.to)?.zoneId;}
 return {...dem,cells,cutoff,cellAreaM2:dx*dy,coverage:inside.length/Math.max(1,cells.filter(c=>c.zoneId).length),method:dem.method+' D8 routes each cell to its steepest strictly lower neighbour. Unresolved flat/sink cells are inspection candidates. No depression filling, subsurface drainage, culverts, soil infiltration or full catchment routing is modeled.'};
}
