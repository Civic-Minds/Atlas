import type { GtfsData } from '../types/gtfs.js';

export function detectBusSubType(
  routeType: string | number | undefined,
  shortName: string,
  longName: string | null,
  agencySlug?: string,
): 'brt' | 'express' | 'coach' | 'local' | undefined {
  const rt = parseInt(String(routeType ?? '3'));
  if (rt !== 3) return undefined;
  const combined = `${shortName} ${longName ?? ''}`.toLowerCase();
  if (/\b(brt|bus rapid transit|viva|züm|zum|pulse|b-line|bline)\b/.test(combined)) return 'brt';
  if (/\b(express|xpress)\b/.test(combined)) return 'express';
  if (agencySlug === 'go') return 'coach';
  return 'local';
}

/** Build route_id → base fare (dollars). V2 → V1 → manual fallback. */
export function computeRouteBaseFares(gtfs: GtfsData, manualBaseFare?: number): Map<string, number | null> {
  const routeIdToFare = new Map<string, number | null>();

  if (gtfs.fareProducts && gtfs.fareProducts.length > 0) {
    const adultPrices: number[] = [];
    const riderCatById = new Map((gtfs.riderCategories ?? []).map(c => [c.rider_category_id, c]));

    for (const prod of gtfs.fareProducts) {
      const price = parseFloat(prod.amount);
      if (Number.isNaN(price) || price < 0) continue;

      let isAdult = true;
      if (prod.rider_category_id) {
        const cat = riderCatById.get(prod.rider_category_id);
        const name = (cat?.rider_category_name || '').toLowerCase();
        if (name && /(youth|child|senior|elder|disabled|student|concession)/.test(name)) {
          isAdult = false;
        }
      }
      if (isAdult) adultPrices.push(price);
    }

    if (adultPrices.length > 0) {
      const positive = adultPrices.filter(p => p > 0);
      const base = positive.length > 0 ? Math.min(...positive) : 0;
      for (const route of gtfs.routes ?? []) {
        routeIdToFare.set(route.route_id, base);
      }
      return routeIdToFare;
    }
  }

  const farePriceById = new Map<string, number>();
  for (const fa of gtfs.fareAttributes ?? []) {
    const price = parseFloat(fa.price);
    if (!Number.isNaN(price) && price >= 0) farePriceById.set(fa.fare_id, price);
  }

  for (const rule of gtfs.fareRules ?? []) {
    if (!rule.route_id) continue;
    const price = farePriceById.get(rule.fare_id);
    if (price === undefined) continue;
    const prev = routeIdToFare.get(rule.route_id);
    if (prev === undefined) {
      routeIdToFare.set(rule.route_id, price);
    } else if (price === 0 || (prev !== 0 && price < prev)) {
      routeIdToFare.set(rule.route_id, price);
    }
  }

  for (const route of gtfs.routes ?? []) {
    if (!routeIdToFare.has(route.route_id)) routeIdToFare.set(route.route_id, null);
  }

  if (manualBaseFare != null && manualBaseFare >= 0) {
    for (const [rid, val] of routeIdToFare) {
      if (val === null) routeIdToFare.set(rid, manualBaseFare);
    }
  }

  return routeIdToFare;
}
