import fs from 'fs';
const fc=JSON.parse(fs.readFileSync('tmp/agency-pages-cache/release-mwl8qwjk/drt.json'));
const ks=new Set();fc.features.forEach(f=>Object.keys(f.properties).forEach(k=>ks.add(k)));
console.log([...ks].filter(k=>/stretch|stopTiers|Period/i.test(k)).join(' '));
