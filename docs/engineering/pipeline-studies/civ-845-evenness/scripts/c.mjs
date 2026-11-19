import fs from 'fs';
const fc=JSON.parse(fs.readFileSync('tmp/agency-pages-cache/release-mwl8qwjk/drt.json'));
const names=new Map();
fc.features.filter(f=>f.geometry.type==='Point').forEach(f=>names.set(String(f.properties.stopId),f.properties.stopName||f.properties.name));
console.log(fc.features.filter(f=>f.geometry.type==='Point').length, Object.keys(fc.features.find(f=>f.geometry.type==='Point')?.properties||{}));
for(const f of fc.features.filter(f=>f.geometry.type==='LineString'&&f.properties.routeShortName==='900'&&f.properties.day==='Weekday')){
 const p=f.properties;console.log('\n##',p.directionId,p.headsign);
 console.log(p.stopOrder.map((s,i)=>`${i}:${s}:${p.stopPeriodHeadways?.[s]?.evening??'-'}/${p.stopTiers?.[s]??'-'}/${p.stopPeriodCoverageHeadways?.[s]?.evening??'-'}`).join(' '));
}
