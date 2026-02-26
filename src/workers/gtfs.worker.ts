import { GtfsData, SpacingResult } from '../types/gtfs';
import { calculateTiers, calculateStopSpacing, calculateCorridors } from '../core/transit-logic';
import { parseGtfsZip } from '../core/parseGtfs';
import { validateGtfs, ValidationReport } from '../core/validation';

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

    // Default: full GTFS upload + analysis pipeline
    const { file, startTimeMins, endTimeMins } = e.data;

    try {
        const gtfsData = await parseGtfsZip(file, (message) => {
            self.postMessage({ type: 'STATUS', message });
        });

        // Run GTFS spec validation before analysis
        self.postMessage({ type: 'STATUS', message: 'Validating GTFS spec compliance...' });
        const validationReport = validateGtfs(gtfsData, file.name || 'Uploaded Feed');

        // If there are critical errors, still continue analysis but report them
        if (validationReport.errors > 0) {
            self.postMessage({
                type: 'STATUS',
                message: `⚠ ${validationReport.errors} validation errors found — results may be incomplete.`
            });
        }

        self.postMessage({ type: 'STATUS', message: 'Calculating frequency tiers...' });
        const results = calculateTiers(gtfsData, startTimeMins, endTimeMins);

        self.postMessage({ type: 'STATUS', message: 'Calculating stop spacing diagnostics...' });
        const spacingResults: SpacingResult[] = [];
        const checkedRoutes = new Set<string>();

        for (const res of results) {
            const key = `${res.route}::${res.dir}`;
            if (!checkedRoutes.has(key)) {
                const spacing = calculateStopSpacing(gtfsData, res.route, res.dir);
                if (spacing) spacingResults.push(spacing);
                checkedRoutes.add(key);
            }
        }

        self.postMessage({
            type: 'DONE',
            gtfsData,
            analysisResults: results,
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

