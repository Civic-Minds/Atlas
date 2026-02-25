import JSZip from 'jszip';
import Papa from 'papaparse';
import { GtfsData, SpacingResult } from '../types/gtfs';
import { calculateTiers, calculateStopSpacing } from '../core/transit-logic';


const parseCsv = <T>(text: string): T[] => {
    const result = Papa.parse(text, {
        header: true,
        skipEmptyLines: true,
    });
    return result.data as T[];
};

self.onmessage = async (e) => {
    const { file, startTimeMins, endTimeMins } = e.data;

    try {
        self.postMessage({ type: 'STATUS', message: 'Loading ZIP archive...' });
        const zip = await JSZip.loadAsync(file);

        const files = {
            routes: 'routes.txt',
            trips: 'trips.txt',
            stops: 'stops.txt',
            stopTimes: 'stop_times.txt',
            calendar: 'calendar.txt',
            shapes: 'shapes.txt',
            feedInfo: 'feed_info.txt'
        };

        const gtfsData: Partial<GtfsData> = {
            shapes: []
        };

        for (const [key, filename] of Object.entries(files)) {
            self.postMessage({ type: 'STATUS', message: `Parsing ${filename}...` });
            const zipFile = zip.file(filename);
            if (zipFile) {
                const text = await zipFile.async('text');
                const parsed = parseCsv(text);

                if (key === 'shapes') {
                    const groupedShapes = new Map();
                    (parsed as any[]).forEach(p => {
                        if (!groupedShapes.has(p.shape_id)) groupedShapes.set(p.shape_id, []);
                        groupedShapes.get(p.shape_id).push([
                            parseFloat(p.shape_pt_lat),
                            parseFloat(p.shape_pt_lon)
                        ]);
                    });
                    gtfsData.shapes = Array.from(groupedShapes.entries()).map(([id, points]) => ({
                        id,
                        points
                    }));
                } else {
                    (gtfsData as any)[key] = parsed;
                }
            } else if (key !== 'feedInfo' && key !== 'shapes') {
                throw new Error(`Missing required GTFS file: ${filename}`);
            }
        }

        self.postMessage({ type: 'STATUS', message: 'Calculating frequency tiers...' });
        const results = calculateTiers(gtfsData as GtfsData, startTimeMins, endTimeMins);

        self.postMessage({ type: 'STATUS', message: 'Calculating stop spacing diagnostics...' });
        const spacingResults: SpacingResult[] = [];
        const checkedRoutes = new Set<string>();

        for (const res of results) {
            const key = `${res.route}::${res.dir}`;
            if (!checkedRoutes.has(key)) {
                const spacing = calculateStopSpacing(gtfsData as GtfsData, res.route, res.dir);
                if (spacing) spacingResults.push(spacing);
                checkedRoutes.add(key);
            }
        }

        self.postMessage({
            type: 'DONE',
            gtfsData: gtfsData,
            analysisResults: results,
            spacingResults
        });

    } catch (error) {
        self.postMessage({
            type: 'ERROR',
            error: error instanceof Error ? error.message : 'Unknown worker error'
        });
    }
};
