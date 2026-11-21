import fs from 'fs';
const fc=JSON.parse(fs.readFileSync('tmp/agency-pages-cache/release-mwl8qwjk/drt.json'));
const fs_=fc.features.filter(f=>f.geometry.type==='LineString'&&f.properties.routeShortName==='900');
console.log(fs_.length);
for(const f of fs_){const p=f.properties;console.log(p.directionId,p.headsign,p.day,p.serviceClass,p.tier,p.stopOrder?.length,JSON.stringify(p.sharedStretches), p.headwayByPeriod?.evening)}
console.log(Object.keys(fs_[0].properties).join(','));
