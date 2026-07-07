/** GTFS HH:MM:SS (may exceed 24h) → seconds from service-day midnight. */
export function gtfsTimeToSec(t: string): number {
  const [hh, mm, ss = '0'] = t.split(':');
  return Number(hh) * 3600 + Number(mm) * 60 + Number(ss);
}

/** Local midnight (in `timeZone`) for the calendar day containing `epochSec`. */
export function serviceDayStartEpoch(epochSec: number, timeZone: string): number {
  const date = new Date(epochSec * 1000);
  const local = new Date(date.toLocaleString('en-US', { timeZone }));
  const diffMs = date.getTime() - local.getTime();
  local.setHours(0, 0, 0, 0);
  return Math.floor((local.getTime() + diffMs) / 1000);
}

type StopTimeEvent = { time?: string | number; delay?: string | number } | null | undefined;

function eventEpoch(event: StopTimeEvent): number | null {
  if (event?.time == null) return null;
  const t = Number(event.time);
  return Number.isFinite(t) ? t : null;
}

function eventDelaySec(event: StopTimeEvent): number | null {
  if (event?.delay == null) return null;
  const d = Number(event.delay);
  return Number.isFinite(d) ? d : null;
}

/** Read explicit delay from trip-level or any stop update (feeds like Burlington). */
export function explicitTripDelaySec(tripUpdate: {
  delay?: string | number;
  stopTimeUpdate?: Array<{ arrival?: StopTimeEvent; departure?: StopTimeEvent }>;
}): number | null {
  if (tripUpdate.delay != null) {
    const d = Number(tripUpdate.delay);
    if (Number.isFinite(d)) return d;
  }
  for (const stu of tripUpdate.stopTimeUpdate ?? []) {
    for (const event of [stu.arrival, stu.departure]) {
      const delay = eventDelaySec(event);
      if (delay != null) return delay;
    }
  }
  return null;
}

export function scheduledDelaySec(
  predictedEpoch: number,
  tripId: string,
  stopId: string,
  tripStopTimes: Record<string, Record<string, number>>,
  serviceDayStart: number,
): number | null {
  const schedSec = tripStopTimes[tripId]?.[stopId];
  if (schedSec == null) return null;
  return predictedEpoch - (serviceDayStart + schedSec);
}

function pickStopUpdate(
  tripUpdate: { stopTimeUpdate?: Array<{ stopId?: string; stopSequence?: number; arrival?: StopTimeEvent; departure?: StopTimeEvent }> },
  opts: { stopId?: string; stopSequence?: number },
) {
  const stus = tripUpdate.stopTimeUpdate ?? [];
  if (opts.stopId) {
    const byStop = stus.find(s => String(s.stopId) === String(opts.stopId));
    if (byStop) return byStop;
  }
  if (opts.stopSequence != null) {
    const bySeq = stus.find(s => Number(s.stopSequence) === Number(opts.stopSequence));
    if (bySeq) return bySeq;
  }
  return stus.length > 0 ? stus[stus.length - 1] : null;
}

function predictedEpochForStop(
  stu: { arrival?: StopTimeEvent; departure?: StopTimeEvent },
  currentStatus?: string | number,
): number | null {
  const status = String(currentStatus ?? '');
  if (status === 'IN_TRANSIT' || status === '2') {
    return eventEpoch(stu.departure) ?? eventEpoch(stu.arrival);
  }
  return eventEpoch(stu.arrival) ?? eventEpoch(stu.departure);
}

/** Delay for a trip update when the feed omits `delay` (e.g. TTC) but includes predicted times. */
export function delayFromTripUpdate(
  tripUpdate: {
    trip?: { tripId?: string };
    stopTimeUpdate?: Array<{ stopId?: string; stopSequence?: number; arrival?: StopTimeEvent; departure?: StopTimeEvent }>;
  },
  tripStopTimes: Record<string, Record<string, number>> | undefined,
  serviceDayStart: number,
  opts?: { stopId?: string; stopSequence?: number; currentStatus?: string | number },
): number | null {
  const explicit = explicitTripDelaySec(tripUpdate);
  if (explicit != null) return explicit;

  const tripId = tripUpdate.trip?.tripId;
  if (!tripId || !tripStopTimes) return null;

  const stu = pickStopUpdate(tripUpdate, opts ?? {});
  if (!stu?.stopId) return null;

  const predicted = predictedEpochForStop(stu, opts?.currentStatus);
  if (predicted == null) return null;

  return scheduledDelaySec(predicted, tripId, String(stu.stopId), tripStopTimes, serviceDayStart);
}

export function delayMinFromDelaySec(delaySec: number): number {
  return Math.round(delaySec / 60 * 10) / 10;
}
