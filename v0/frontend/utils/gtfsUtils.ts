import { GtfsData } from '../types/gtfs';
import { parseGtfsZip } from '../core/parseGtfs';

export * from '../types/gtfs';
export * from '../core/transit-logic';
export { synthesizeCalendarFromDates } from '../core/parseGtfs';
export { validateGtfs } from '../core/validation';
export type { ValidationReport, ValidationIssue } from '../core/validation';

export const processGtfsFile = async (file: File): Promise<GtfsData> => {
    return parseGtfsZip(file);
};

