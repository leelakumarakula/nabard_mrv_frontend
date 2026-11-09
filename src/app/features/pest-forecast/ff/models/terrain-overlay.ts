// @ts-nocheck
// Ported unchanged from Coffee-estate-twin/public/terrain-overlay.js. Keep the logic byte-identical: the Node
// test suites and the Python backend parity test run against the original module.
import { geometryModel, pointInZone } from './farm-model';
const lookups=new WeakMap();
export function gridIndex(grid,lon,lat){
 if(!grid?.bounds||!Number.isFinite(lon)||!Number.isFinite(lat))return null;
 const b=grid.bounds;if(lon<b.west||lon>b.east||lat<b.south||lat>b.north)return null;
 const col=Math.min(grid.width-1,Math.floor((lon-b.west)/(b.east-b.west)*grid.width)),row=Math.min(grid.height-1,Math.floor((b.north-lat)/(b.north-b.south)*grid.height));return row*grid.width+col;
}
export function gridCell(grid,lon,lat){
 const index=gridIndex(grid,lon,lat);if(index===null)return null;
 if(!lookups.has(grid))lookups.set(grid,new Map(grid.cells.map(c=>[c.i,c])));return lookups.get(grid).get(index)??null;
}
export function surfaceModel(geometry,dem=null){
 const model=geometryModel(geometry),inside=dem?.cells?.filter(c=>c.zoneId&&Number.isFinite(c.elevation));
 if(!inside?.length)return {...model,heightSource:'boundary',min:geometry.elevationMin,max:geometry.elevationMax};
 const lookup=new Float64Array(dem.width*dem.height).fill(NaN),min=Math.min(...inside.map(c=>c.elevation)),max=Math.max(...inside.map(c=>c.elevation));
 // A flat array indexed by cell, not a Map: the surface is sampled hundreds of thousands of times per build.
 for(const c of dem.cells)if(Number.isFinite(c.elevation)&&c.i>=0&&c.i<lookup.length)lookup[c.i]=c.elevation;
 function elevation(x,z){
  const [lon,lat]=model.unproject(x,z),b=dem.bounds,gx=(lon-b.west)/(b.east-b.west)*dem.width-.5,gy=(b.north-lat)/(b.north-b.south)*dem.height-.5,col=Math.floor(gx),row=Math.floor(gy),tx=gx-col,ty=gy-row;
  let sum=0,weight=0;
  for(const [dc,dr,w] of [[0,0,(1-tx)*(1-ty)],[1,0,tx*(1-ty)],[0,1,(1-tx)*ty],[1,1,tx*ty]]){const cx=col+dc,ry=row+dr;if(cx<0||cx>=dem.width||ry<0||ry>=dem.height)continue;const e=lookup[ry*dem.width+cx];if(e===e&&w>0){sum+=e*w;weight+=w;}}
  return weight>0?sum/weight:null;
 }
 return {...model,base:min,elevation,heightSource:'satellite',min,max};
}
// Snap a device position to the mapped zone and analysis cell it falls in. GPS accuracy
// is reported separately from the 30 m cell; a fix outside every zone selects nothing.
export function positionInFarm(geometry,grid,{lat,lon,accuracy=null}={}){
 if(!geometry?.zones?.length||!Number.isFinite(lat)||!Number.isFinite(lon))return null;
 const zone=geometry.zones.find(z=>pointInZone([lon,lat],z))??null;
 const distanceTo=z=>Math.min(...z.rings[0].map(p=>Math.hypot((p[0]-lon)*111320*Math.cos(lat*Math.PI/180),(p[1]-lat)*111320)));
 const nearest=zone??geometry.zones.reduce((a,z)=>distanceTo(z)<distanceTo(a)?z:a);
 // Cell membership is judged at the cell centre, so a fix just inside a zone edge can sit in a
 // cell whose centre is outside it. Keep that cell's terrain values; the zone comes from the fix.
 const cell=zone&&grid?gridCell(grid,lon,lat):null,accuracyM=Number.isFinite(accuracy)?Math.round(accuracy):null,boundary=!!cell&&cell.zoneId!==zone.id;
 return {zone,nearest,nearestDistanceM:zone?0:Math.round(distanceTo(nearest)),cell,accuracyM,boundary,point:zone?{...(cell||{}),lat,lon,zoneId:zone.id,cellZoneId:cell?.zoneId??null,boundary,i:cell?cell.i:`ground-${lon}-${lat}`,located:true,accuracyM}:null};
}
export function spreadCandidates(cells,limit=6){
 // Select spatially spread inspection locations, preserving the input priority order.
 const chosen=[];for(const c of cells){if(chosen.length>=limit)break;if(!Number.isFinite(c.lon)||!Number.isFinite(c.lat))continue;if(chosen.some(p=>Math.hypot((p.lon-c.lon)*111320*Math.cos(c.lat*Math.PI/180),(p.lat-c.lat)*111320)<35))continue;chosen.push(c);}return chosen;
}
export function zoneInspectionPoints(geometry,zoneId){
 const zone=geometry.zones.find(z=>z.id===zoneId);if(!zone)return [];
 const xs=zone.rings.flat().map(p=>p[0]),ys=zone.rings.flat().map(p=>p[1]),b={west:Math.min(...xs),east:Math.max(...xs),south:Math.min(...ys),north:Math.max(...ys)},out=[];
 for(let row=0;row<5;row++)for(let col=0;col<7;col++){const lon=b.west+(col+.5)/7*(b.east-b.west),lat=b.north-(row+.5)/5*(b.north-b.south);if(pointInZone([lon,lat],zone))out.push({i:`zone-${zoneId}-${row}-${col}`,zoneId,lon,lat,planned:true});}
 if(!out.length)return [];
 const distance=(a,b)=>Math.hypot((a.lon-b.lon)*Math.cos(geometry.center.lat*Math.PI/180),a.lat-b.lat),centre={lon:(b.west+b.east)/2,lat:(b.south+b.north)/2};
 const chosen=[out.reduce((a,c)=>distance(c,centre)<distance(a,centre)?c:a)];
 while(chosen.length<Math.min(5,out.length)){
  const remaining=out.filter(c=>!chosen.includes(c));
  chosen.push(remaining.reduce((a,c)=>Math.min(...chosen.map(p=>distance(c,p)))>Math.min(...chosen.map(p=>distance(a,p)))?c:a));
 }
 return chosen;
}
