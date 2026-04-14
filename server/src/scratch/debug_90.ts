import { parseGtfsBuffer } from '../import/parse-gtfs';
import fs from 'fs';
import path from 'path';

async function listRoutes() {
  const zipPath = path.resolve(__dirname, '../../../public/data/samples/gtfs-sample.zip');
  const gtfs = await parseGtfsBuffer(fs.readFileSync(zipPath));
  
  console.log(`Routes: ${gtfs.routes.map(r => r.route_id).join(', ')}`);
}

listRoutes();
