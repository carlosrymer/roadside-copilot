/**
 * Provider ranking, pure and data-free: callers pass the provider pool in.
 * Kept out of `data.ts` so the eval harness can reuse the real ranking logic
 * without pulling in the bundler-only `.md` policy-document imports.
 */

export interface Coord {
  lat: number;
  lng: number;
}

export interface RankableProvider extends Coord {
  id: string;
  capabilities: string[];
  avgDispatchMinutes: number;
}

/** Great-circle distance in miles between two coordinates. */
export function distanceMiles(a: Coord, b: Coord): number {
  const R = 3958.8;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export type Ranked<T> = T & { distanceMiles: number; etaMinutes: number };

/**
 * Rank providers near an origin, optionally requiring a capability. ETA is the
 * provider's dispatch time plus a rough drive estimate at 35 mph.
 */
export function rankProviders<T extends RankableProvider>(
  pool: T[],
  origin: Coord,
  capability?: string,
): Ranked<T>[] {
  const eligible = capability ? pool.filter((g) => g.capabilities.includes(capability)) : pool;
  return eligible
    .map((g) => {
      const miles = distanceMiles(origin, g);
      return {
        ...g,
        distanceMiles: Math.round(miles * 10) / 10,
        etaMinutes: g.avgDispatchMinutes + Math.round((miles / 35) * 60),
      };
    })
    .sort((a, b) => a.distanceMiles - b.distanceMiles);
}

/**
 * Pick the best provider for a capability, degrading the way dispatch actually
 * does: exact capability → any tow → anyone at all.
 */
export function selectProvider<T extends RankableProvider>(
  pool: T[],
  origin: Coord,
  capability?: string,
): Ranked<T>[] {
  let ranked = rankProviders(pool, origin, capability);
  if (ranked.length === 0) ranked = rankProviders(pool, origin, 'tow');
  if (ranked.length === 0) ranked = rankProviders(pool, origin);
  return ranked;
}
