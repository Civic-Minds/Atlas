"use strict";
/**
 * Server-side GTFS parser.
 * Node.js port of src/core/parseGtfs.ts — accepts a Buffer instead of File.
 * Uses JSZip + PapaParser (both work in Node).
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseGtfsBuffer = parseGtfsBuffer;
exports.parseStopTimesForCorridors = parseStopTimesForCorridors;
const jszip_1 = __importDefault(require("jszip"));
const papaparse_1 = __importDefault(require("papaparse"));
function parseCsv(text) {
    const result = papaparse_1.default.parse(text, {
        header: true,
        skipEmptyLines: true,
        transform: (value) => value.trim(),
        transformHeader: (header) => header.trim().replace(/^\uFEFF/, '').replace(/^"|"$/g, ''),
    });
    return result.data;
}
function synthesizeCalendar(calendarDates) {
    const addedByService = new Map();
    for (const cd of calendarDates) {
        if (cd.exception_type !== '1')
            continue;
        if (!addedByService.has(cd.service_id))
            addedByService.set(cd.service_id, []);
        addedByService.get(cd.service_id).push(cd.date);
    }
    const results = [];
    for (const [serviceId, dates] of addedByService) {
        const dayCounts = [0, 0, 0, 0, 0, 0, 0];
        let minDate = dates[0];
        let maxDate = dates[0];
        for (const dateStr of dates) {
            const y = parseInt(dateStr.substring(0, 4));
            const m = parseInt(dateStr.substring(4, 6)) - 1;
            const d = parseInt(dateStr.substring(6, 8));
            const dow = new Date(y, m, d).getDay();
            dayCounts[dow]++;
            if (dateStr < minDate)
                minDate = dateStr;
            if (dateStr > maxDate)
                maxDate = dateStr;
        }
        const totalWeeks = Math.max(1, dates.length / 7);
        const threshold = Math.max(2, totalWeeks * 0.2);
        const entry = {
            service_id: serviceId,
            monday: dayCounts[1] >= threshold ? '1' : '0',
            tuesday: dayCounts[2] >= threshold ? '1' : '0',
            wednesday: dayCounts[3] >= threshold ? '1' : '0',
            thursday: dayCounts[4] >= threshold ? '1' : '0',
            friday: dayCounts[5] >= threshold ? '1' : '0',
            saturday: dayCounts[6] >= threshold ? '1' : '0',
            sunday: dayCounts[0] >= threshold ? '1' : '0',
            start_date: minDate,
            end_date: maxDate,
        };
        const hasActiveDay = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
            .some(d => entry[d] === '1');
        if (hasActiveDay)
            results.push(entry);
    }
    return results;
}
async function parseGtfsBuffer(buffer) {
    const zip = await jszip_1.default.loadAsync(buffer);
    // Auto-detect subdirectory layout
    let basePath = '';
    if (!zip.file('routes.txt')) {
        const routesEntry = Object.keys(zip.files).find(f => f.endsWith('/routes.txt') && !zip.files[f].dir);
        if (routesEntry)
            basePath = routesEntry.slice(0, -'routes.txt'.length);
    }
    async function readFile(name) {
        const f = zip.file(basePath + name);
        return f ? f.async('text') : null;
    }
    const routesTxt = await readFile('routes.txt');
    if (!routesTxt)
        throw new Error('Missing required GTFS file: routes.txt');
    const tripsTxt = await readFile('trips.txt');
    if (!tripsTxt)
        throw new Error('Missing required GTFS file: trips.txt');
    const stopsTxt = await readFile('stops.txt');
    if (!stopsTxt)
        throw new Error('Missing required GTFS file: stops.txt');
    // Read stop_times.txt as a Node.js stream — never decompress the whole file into a string.
    // stop_times.txt is 200-500MB decompressed for large feeds (TTC, NYC MTA).
    const stopTimesEntry = zip.file(basePath + 'stop_times.txt');
    if (!stopTimesEntry)
        throw new Error('Missing required GTFS file: stop_times.txt');
    const agenciesTxt = await readFile('agency.txt');
    const calendarTxt = await readFile('calendar.txt');
    const calDatesTxt = await readFile('calendar_dates.txt');
    const feedInfoTxt = await readFile('feed_info.txt');
    const freqsTxt = await readFile('frequencies.txt');
    const shapesTxt = await readFile('shapes.txt');
    const routes = parseCsv(routesTxt);
    const trips = parseCsv(tripsTxt);
    const stops = parseCsv(stopsTxt);
    // Stream stop_times, keeping only the first departure per trip.
    const tripFirstDep = new Map();
    let stopTimesHeader = null;
    await new Promise((resolve, reject) => {
        const stream = stopTimesEntry.nodeStream();
        papaparse_1.default.parse(stream, {
            header: true,
            skipEmptyLines: true,
            transform: (v) => v.trim(),
            transformHeader: (h) => h.trim().replace(/^\uFEFF/, '').replace(/^"|"$/g, ''),
            step: (row) => {
                const st = row.data;
                const seq = parseInt(st.stop_sequence);
                if (isNaN(seq) || !st.trip_id)
                    return;
                const existing = tripFirstDep.get(st.trip_id);
                if (existing === undefined || seq < existing.seq) {
                    const raw = st.departure_time || st.arrival_time || '';
                    const parts = raw.split(':');
                    if (parts.length < 2)
                        return;
                    const h = parseInt(parts[0]), m = parseInt(parts[1]);
                    if (isNaN(h) || isNaN(m))
                        return;
                    tripFirstDep.set(st.trip_id, { depTime: h * 60 + m, seq });
                }
            },
            complete: () => resolve(),
            error: (err) => reject(err),
        });
    });
    const stopTimes = [];
    const agencies = agenciesTxt ? parseCsv(agenciesTxt) : [];
    const calendarDates = calDatesTxt ? parseCsv(calDatesTxt) : [];
    const feedInfo = feedInfoTxt ? parseCsv(feedInfoTxt) : [];
    const frequencies = freqsTxt ? parseCsv(freqsTxt) : [];
    const shapePoints = shapesTxt ? parseCsv(shapesTxt) : [];
    let calendar = calendarTxt ? parseCsv(calendarTxt) : [];
    if (calendar.length === 0 && calendarDates.length > 0) {
        calendar = synthesizeCalendar(calendarDates);
    }
    if (calendar.length === 0 && calendarDates.length === 0) {
        throw new Error('GTFS feed must contain either calendar.txt or calendar_dates.txt');
    }
    // Single-agency feeds: fill in agency_id on routes if missing
    if (agencies.length === 1 && agencies[0].agency_id) {
        for (const r of routes) {
            if (!r.agency_id)
                r.agency_id = agencies[0].agency_id;
        }
    }
    // Synthesize agency from feed_info if agency.txt is missing
    if (agencies.length === 0) {
        const name = feedInfo[0]?.feed_publisher_name ?? 'Unknown Agency';
        agencies.push({ agency_name: name });
    }
    return { agencies, routes, stops, trips, tripFirstDep, calendar, calendarDates, feedInfo, frequencies, shapePoints };
}
/**
 * Stream stop_times.txt a second time to build stop-pair departure data.
 * Only emits links for trips in `activeTripIds` — keeps memory footprint small.
 * Returns a Map keyed by "stopA->stopB".
 */
async function parseStopTimesForCorridors(buffer, activeTripIds) {
    const zip = await jszip_1.default.loadAsync(buffer);
    let basePath = '';
    if (!zip.file('routes.txt')) {
        const routesEntry = Object.keys(zip.files).find(f => f.endsWith('/routes.txt') && !zip.files[f].dir);
        if (routesEntry)
            basePath = routesEntry.slice(0, -'routes.txt'.length);
    }
    const stopTimesEntry = zip.file(basePath + 'stop_times.txt');
    if (!stopTimesEntry)
        throw new Error('Missing required GTFS file: stop_times.txt');
    const links = new Map();
    // Track the last seen stop per trip: tripId → { stopId, depMins, seq }
    const prev = new Map();
    await new Promise((resolve, reject) => {
        const stream = stopTimesEntry.nodeStream();
        papaparse_1.default.parse(stream, {
            header: true,
            skipEmptyLines: true,
            transform: (v) => v.trim(),
            transformHeader: (h) => h.trim().replace(/^\uFEFF/, '').replace(/^"|"$/g, ''),
            step: (row) => {
                const st = row.data;
                if (!st.trip_id || !activeTripIds.has(st.trip_id))
                    return;
                const seq = parseInt(st.stop_sequence);
                if (isNaN(seq) || !st.stop_id)
                    return;
                const raw = st.departure_time || st.arrival_time || '';
                const parts = raw.split(':');
                if (parts.length < 2)
                    return;
                const h = parseInt(parts[0]), m = parseInt(parts[1]);
                if (isNaN(h) || isNaN(m))
                    return;
                const depMins = h * 60 + m;
                const p = prev.get(st.trip_id);
                if (p !== undefined && seq > p.seq) {
                    const linkId = `${p.stopId}->${st.stop_id}`;
                    if (!links.has(linkId)) {
                        links.set(linkId, { stopA: p.stopId, stopB: st.stop_id, tripDeps: new Map() });
                    }
                    // Only record the first time we see this trip on this link
                    const link = links.get(linkId);
                    if (!link.tripDeps.has(st.trip_id)) {
                        link.tripDeps.set(st.trip_id, p.depMins);
                    }
                }
                prev.set(st.trip_id, { stopId: st.stop_id, depMins, seq });
            },
            complete: () => resolve(),
            error: (err) => reject(err),
        });
    });
    return links;
}
