import { useState, useCallback } from 'react';
import { GtfsData, AnalysisResult, SpacingResult } from '../types/gtfs';

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
        onComplete: (data: { gtfsData: GtfsData, analysisResults: AnalysisResult[], spacingResults: SpacingResult[] }) => void,
        startTimeMins: number = 7 * 60,
        endTimeMins: number = 22 * 60
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
                } else if (type === 'DONE') {
                    const { gtfsData, analysisResults, spacingResults } = e.data;
                    onComplete({ gtfsData, analysisResults, spacingResults });
                    setState({ loading: false, status: '', error: null });
                    worker.terminate();
                } else if (type === 'ERROR') {
                    setState({ loading: false, status: '', error: error || 'Worker failed' });
                    worker.terminate();
                }
            };

            worker.postMessage({
                file,
                startTimeMins,
                endTimeMins
            });

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
