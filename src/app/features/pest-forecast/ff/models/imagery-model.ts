// @ts-nocheck
// Ported unchanged from Coffee-estate-twin/public/imagery-model.js. Keep the logic byte-identical: the Node
// test suites and the Python backend parity test run against the original module.
// Photo base for the maps. Sentinel-2 true colour by default (free, dated, 10 m); optionally an aerial
// tile provider configured on the server. Shared by the Worker (stretch, scene choice, tile checks)
// and the browser (tile ranges for the mosaic). A photograph for orientation, never an analysis layer.
export const IMAGERY_VERSION='coffee-imagery-2026-09-v1';
export const IMAGERY_POLICY={resolution:10,paddingM:320,clearClasses:[4,5,6,7,11],percentiles:[2,98],gamma:1.15,minClear:.6,maxTiles:128};
export function percentile(sorted,p){if(!sorted.length)return NaN;const k=(sorted.length-1)*p/100,lo=Math.floor(k),hi=Math.ceil(k);return sorted[lo]+(sorted[hi]-sorted[lo])*(k-lo);}
// Reflectance channels (red, green, blue) to 8-bit RGB: a percentile stretch over cloud-free farm
// pixels so the photo uses the full range, then a mild gamma so shaded coffee is not black.
export function trueColourStretch(channels,clear,n,{percentiles=IMAGERY_POLICY.percentiles,gamma=IMAGERY_POLICY.gamma}={}){
 const rgb=new Uint8Array(n*3),ranges=channels.map(ch=>{
  let vals=[];for(let i=0;i<n;i++)if(clear[i]&&Number.isFinite(ch[i])&&ch[i]>0)vals.push(ch[i]);
  if(vals.length<10){vals=[];for(let i=0;i<n;i++)if(Number.isFinite(ch[i])&&ch[i]>0)vals.push(ch[i]);}
  vals.sort((a,b)=>a-b);const lo=vals.length?percentile(vals,percentiles[0]):0,hi=vals.length?Math.max(percentile(vals,percentiles[1]),lo+1e-4):1;return [lo,hi];});
 for(let i=0;i<n;i++)for(let b=0;b<3;b++){const [lo,hi]=ranges[b],v=channels[b][i],t=Number.isFinite(v)?Math.min(1,Math.max(0,(v-lo)/(hi-lo))):0;rgb[i*3+b]=Math.round(Math.pow(t,1/gamma)*255);}
 return {rgb,ranges};
}
// The least cloudy scene wins; ties go to the newest.
export function chooseClearest(scored){if(!scored?.length)return null;const when=s=>Date.parse(s.scene?.properties?.datetime||s.acquiredAt||0)||0;return [...scored].sort((a,b)=>b.clearFraction-a.clearFraction||when(b)-when(a))[0];}
// Web Mercator tile maths for aerial tile providers.
export function lonLatToTile(lon,lat,z){const n=2**z,x=Math.floor((lon+180)/360*n),latR=lat*Math.PI/180,y=Math.floor((1-Math.log(Math.tan(latR)+1/Math.cos(latR))/Math.PI)/2*n);return {x:Math.min(n-1,Math.max(0,x)),y:Math.min(n-1,Math.max(0,y))};}
export function tileBounds(z,x,y){const n=2**z,west=x/n*360-180,east=(x+1)/n*360-180,north=Math.atan(Math.sinh(Math.PI*(1-2*y/n)))*180/Math.PI,south=Math.atan(Math.sinh(Math.PI*(1-2*(y+1)/n)))*180/Math.PI;return {west,south,east,north};}
export function tileRange(bounds,z){const a=lonLatToTile(bounds.west,bounds.north,z),b=lonLatToTile(bounds.east,bounds.south,z),xMin=Math.min(a.x,b.x),xMax=Math.max(a.x,b.x),yMin=Math.min(a.y,b.y),yMax=Math.max(a.y,b.y),nw=tileBounds(z,xMin,yMin),se=tileBounds(z,xMax,yMax);return {z,xMin,xMax,yMin,yMax,cols:xMax-xMin+1,rows:yMax-yMin+1,bounds:{west:nw.west,north:nw.north,east:se.east,south:se.south}};}
export function tileIntersects(z,x,y,bounds,padDeg=0){const t=tileBounds(z,x,y);return !(t.east<bounds.west-padDeg||t.west>bounds.east+padDeg||t.north<bounds.south-padDeg||t.south>bounds.north+padDeg);}
