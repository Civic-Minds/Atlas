import JSZip from 'jszip';
import Papa from 'papaparse';
import { GtfsData } from '../types/gtfs';

export * from '../types/gtfs';
export * from '../core/transit-logic';

const parseCsv = <T>(text: string): Promise<T[]> => {
    return new Promise((resolve, reject) => {
        Papa.parse(text, {
            header: true,
            skipEmptyLines: true,
            complete: (results) => resolve(results.data as T[]),
            error: (error: any) => reject(error)
        });
    });
};

export const processGtfsFile = async (file: File): Promise<GtfsData> => {
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

    const data: Partial<GtfsData> = {
        shapes: [] // Default to empty array
    };

    for (const [key, filename] of Object.entries(files)) {
        const zipFile = zip.file(filename);
        if (zipFile) {
            const text = await zipFile.async('text');
            const parsed = await parseCsv(text);

            if (key === 'shapes') {
                // Group shapes by ID for efficient map rendering
                const groupedShapes = new Map();
                (parsed as any[]).forEach(p => {
                    if (!groupedShapes.has(p.shape_id)) groupedShapes.set(p.shape_id, []);
                    groupedShapes.get(p.shape_id).push([
                        parseFloat(p.shape_pt_lat),
                        parseFloat(p.shape_pt_lon)
                    ]);
                });
                data.shapes = Array.from(groupedShapes.entries()).map(([id, points]) => ({
                    id,
                    points
                }));
            } else {
                (data as any)[key] = parsed;
            }
        } else if (key !== 'feedInfo' && key !== 'shapes') {
            throw new Error(`Missing required GTFS file: ${filename}`);
        }
    }

    return data as GtfsData;
};

