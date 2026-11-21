import { headwayToTier } from '/Users/ryan/Developer/Code/Platforms/Atlas/pipeline/headway-utils.ts';
console.log([14,15,16,17,24,26,30].map(x=>x+':'+headwayToTier(x)).join(' '));
