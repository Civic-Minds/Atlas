/**
 * Safely escape a value for CSV output.
 * - Wraps in double-quotes if the value contains commas, quotes, or newlines
 * - Escapes embedded double-quotes by doubling them (" → "")
 * - Prefixes formula-trigger characters (=, +, -, @) with a single quote
 *   to prevent CSV injection when opened in Excel
 */
const escapeCsvValue = (val: unknown): string => {
    if (val === null || val === undefined) return '';
    let str = String(val);

    // Prevent CSV injection — prefix formula-triggering characters
    if (/^[=+\-@\t\r]/.test(str)) {
        str = `'${str}`;
    }

    // Wrap and escape if value contains special characters
    if (str.includes('"') || str.includes(',') || str.includes('\n') || str.includes('\r')) {
        return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
};

/**
 * Trigger a file download and clean up the blob URL to prevent memory leaks.
 */
const triggerDownload = (blob: Blob, filename: string) => {
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    // Revoke after a short delay to ensure the download starts
    setTimeout(() => URL.revokeObjectURL(url), 1000);
};

/**
 * Utility to export data as CSV
 */
export const downloadCsv = (data: any[], filename: string) => {
    if (data.length === 0) return;

    const headers = Object.keys(data[0]);
    const csvContent = [
        headers.map(escapeCsvValue).join(','),
        ...data.map(row =>
            headers.map(header => escapeCsvValue(row[header])).join(',')
        )
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    triggerDownload(blob, filename);
};

/**
 * Utility to export GTFS analysis as GeoJSON
 */
export const downloadGeoJson = (features: any[], filename: string) => {
    const geojson = {
        type: 'FeatureCollection',
        features: features
    };

    const blob = new Blob([JSON.stringify(geojson, null, 2)], { type: 'application/json' });
    triggerDownload(blob, filename);
};
