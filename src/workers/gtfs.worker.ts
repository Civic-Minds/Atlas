import { SpacingResult } from '../types/gtfs';
import { computeRawDepartures, calculateStopSpacing, calculateCorridors } from '../core/transit-logic';
import { parseGtfsZip } from '../core/parseGtfs';
import { validateGtfs } from '../core/validation';

self.onmessage = async (e) => {
    const { type: requestType } = e.data;

    // Corridor analysis — runs on already-parsed GTFS data
    if (requestType === 'CORRIDORS') {
        try {
            const { gtfsData, day, startMins, endMins } = e.data;
            self.postMessage({ type: 'STATUS', message: 'Calculating corridor overlaps...' });
            const corridors = calculateCorridors(gtfsData, day, startMins, endMins);
            self.postMessage({ type: 'CORRIDORS_DONE', corridors });
        } catch (error) {
            self.postMessage({
                type: 'ERROR',
                error: error instanceof Error ? error.message : 'Corridor analysis failed'
            });
        }
        return;
    }

    // Default: full GTFS upload + raw extraction pipeline
    const { file } = e.data;

    try {
        const gtfsData = await parseGtfsZip(file, (message) => {
            self.postMessage({ type: 'STATUS', message });
        });

        // Run GTFS spec validation before analysis
        self.postMessage({ type: 'STATUS', message: 'Validating GTFS spec compliance...' });
        const validationReport = validateGtfs(gtfsData, file.name || 'Uploaded Feed');

        if (validationReport.errors > 0) {
            self.postMessage({
                type: 'STATUS',
                message: `⚠ ${validationReport.errors} validation errors found — results may be incomplete.`
            });
        }

        // Phase 1: Extract raw departures (per route/dir/day)
        self.postMessage({ type: 'STATUS', message: 'Extracting departure data per route/day/direction...' });
        const rawDepartures = computeRawDepartures(gtfsData);

        // Stop spacing diagnostics
        self.postMessage({ type: 'STATUS', message: 'Calculating stop spacing diagnostics...' });
        const spacingResults: SpacingResult[] = [];
        const checkedRoutes = new Set<string>();

        for (const raw of rawDepartures) {
            const key = `${raw.route}::${raw.dir}`;
            if (!checkedRoutes.has(key)) {
                const spacing = calculateStopSpacing(gtfsData, raw.route, raw.dir);
                if (spacing) spacingResults.push(spacing);
                checkedRoutes.add(key);
            }
        }

        // Send raw data to main thread — criteria application happens there
        self.postMessage({
            type: 'RAW_DONE',
            gtfsData,
            rawDepartures,
            spacingResults,
            validationReport
        });

    } catch (error) {
        self.postMessage({
            type: 'ERROR',
            error: error instanceof Error ? error.message : 'Unknown worker error'
        });
    }
};
