#!/usr/bin/env npx tsx
/** Generate the runtime agency index from the per-agency source files. */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { generateAgencyIndex } from './agencyIndexGeneration.js';

const root = resolve(import.meta.dirname, '..');
const outputPath = resolve(root, 'public/data/index.json');

const { contents, agencies } = generateAgencyIndex(resolve(root, 'config/agencies'));
writeFileSync(outputPath, contents);
console.log(`Generated ${outputPath} from ${agencies.length} agency files`);
