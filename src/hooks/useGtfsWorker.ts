import { useState, useCallback } from 'react';

/**
 * Map raw worker errors to user-facing messages.
 * The worker runs inside a separate thread — errors come back as strings.
 */
function classifyWorkerError(raw: string | undefined): string {
    if (!raw) return 'Worker failed — unknown error';
    const msg = raw.toLowerCase();

    // Node / V8 string length limits hit when decompressing very large feeds
    if (msg.includes('invalid string length') || msg.includes('string too long') || msg.includes('maximum call stack')) {
        return 'Feed too large to parse in the browser. This feed likely has 5M+ stop-time records (e.g. NYC, Paris, Netherlands). Try a smaller regional feed for now.';
    }

    // JSZip / ZIP corruption signals
    if (
        msg.includes('end of central directory') ||
        msg.includes('corrupt') ||
        msg.includes('bad zip') ||
        msg.includes('not a zip file') ||
        msg.includes('invalid zip') ||
        msg.includes('cannot decompress')
    ) {
        return 'This ZIP file appears to be corrupt or is not a valid GTFS feed. Try re-downloading the feed from the agency\'s website.';
    }

    // Missing required files
    if (msg.includes('required file') || msg.includes('missing') && msg.includes('.txt')) {
        return `GTFS feed is missing a required file: ${raw}`;
    }

    return raw;
}
import { GtfsData, SpacingResult, RawRouteDepartures } from '../types/gtfs';
import { ValidationReport } from '../core/validation';

interface WorkerRawResult {
    gtfsData: GtfsData;
    rawDepartures: RawRouteDepartures[];
    spacingResults: SpacingResult[];
    validationReport?: ValidationReport;
}

interface WorkerState {
    loading: boolean;
    status: string;
    error: string | null;
}

export function useGtfsWorker() {
    const [state, setState] = useState<WorkerState>({
        loading: false,
        status: '',
        error: null
    });

    const runAnalysis = useCallback((
        file: File,
        onComplete: (data: WorkerRawResult) => void,
    ) => {
        setState({ loading: true, status: 'Initializing worker...', error: null });

        try {
            const worker = new Worker(new URL('../workers/gtfs.worker.ts', import.meta.url), {
                type: 'module'
            });

            worker.onerror = (e) => {
                e.preventDefault();
                setState({ loading: false, status: '', error: e.message || 'Worker script failed to load' });
                worker.terminate();
            };

            worker.onmessage = (e) => {
                const { type, message, error } = e.data;

                if (type === 'STATUS') {
                    setState(prev => ({ ...prev, status: message }));
                } else if (type === 'RAW_DONE') {
                    const { gtfsData, rawDepartures, spacingResults, validationReport } = e.data;
                    onComplete({ gtfsData, rawDepartures, spacingResults, validationReport });
                    setState({ loading: false, status: '', error: null });
                    worker.terminate();
                } else if (type === 'ERROR') {
                    setState({ loading: false, status: '', error: classifyWorkerError(error) });
                    worker.terminate();
                }
            };

            worker.postMessage({ file });

        } catch (err) {
            setState({
                loading: false,
                status: '',
                error: err instanceof Error ? err.message : 'Failed to start worker'
            });
        }
    }, []);

    return {
        ...state,
        runAnalysis
    };
}
