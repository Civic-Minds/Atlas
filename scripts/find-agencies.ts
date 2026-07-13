import fs from 'fs';
import path from 'path';

interface Agency {
  slug: string;
  name: string;
  region: string;
  feedUrl?: string;
  mdbFeedUrl?: string;
}

const main = () => {
  const indexPath = path.resolve('public/data/index.json');
  const indexData = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
  const agencies: Agency[] = indexData.agencies;

  const gtfsDir = '/Users/ryan/Desktop/Data/GTFS/Files/Canada/Ontario/';
  const files = fs.readdirSync(gtfsDir);
  console.log(`Found ${files.length} files in GTFS directory.`);

  const matches: { agency: Agency; file: string }[] = [];

  for (const agency of agencies) {
    if (agency.region !== 'Ontario') continue;
    // Find closest filename match
    const cleanName = agency.name.toLowerCase().replace(/transit/g, '').replace(/street railway/g, '').trim();
    const matchedFile = files.find(f => {
      const lf = f.toLowerCase();
      return lf.endsWith('.zip') && (
        lf.includes(agency.slug) ||
        lf.includes(cleanName) ||
        agency.name.toLowerCase().includes(f.replace('.zip', '').toLowerCase())
      );
    });

    if (matchedFile) {
      matches.push({ agency, file: matchedFile });
    }
  }

  console.log(`Matched ${matches.length} agencies:`);
  for (const m of matches) {
    console.log(`- ${m.agency.name} (slug: ${m.agency.slug}) -> ${m.file}`);
  }
};

main();
