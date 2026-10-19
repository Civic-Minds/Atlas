import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve } from 'node:path';

const exec = promisify(execFile);
const root = resolve(import.meta.dirname, '..');
const zip = resolve(root, 'data/source/2021_92-150-X_eng.zip');
const source = resolve(root, 'data/source/DA.csv');
const output = resolve(root, 'data/derived/population-areas.geojson');

await mkdir(resolve(root, 'data/source'), { recursive: true });
await mkdir(resolve(root, 'data/derived'), { recursive: true });
try { await readFile(source); } catch {
  await exec('unzip', ['-p', zip, '*/DA.csv'], { cwd: root, maxBuffer: 20 * 1024 * 1024 }).then(({ stdout }) => writeFile(source, stdout));
}
const lines = (await readFile(source, 'utf8')).trim().split(/\r?\n/);
const headers = lines.shift().replaceAll('"', '').split(',');
const index = Object.fromEntries(headers.map((header, i) => [header, i]));
const features = [];
for (const line of lines) {
  const values = line.replaceAll('"', '').split(',');
  const lat = Number(values[index.DArplat]);
  const lon = Number(values[index.DArplong]);
  const population = Number(values[index.DApop_2021]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isFinite(population)) continue;
  features.push({
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [lon, lat] },
    properties: { DAUID: values[index.DAuid], population, CMAUID: values[index.CMAuid], PRUID: values[index.PRuid] },
  });
}
await writeFile(output, JSON.stringify({ type: 'FeatureCollection', features }));
console.log(JSON.stringify({ output, disseminationAreas: features.length, population: features.reduce((sum, feature) => sum + feature.properties.population, 0) }, null, 2));
