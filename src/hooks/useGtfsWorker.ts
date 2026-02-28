import { useState, useCallback } from 'react';
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
                    setState({ loading: false, status: '', error: error || 'Worker failed' });
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
