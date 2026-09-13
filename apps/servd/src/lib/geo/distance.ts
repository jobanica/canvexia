/**
 * Straight-line ("as the crow flies") distance + distance-based delivery fee.
 * No paid map API — haversine over lat/lng, which is a fine basis for a fee
 * estimate. A road-distance multiplier can be layered on later if needed.
 */

/** Great-circle distance between two points, in kilometres. */
export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371; // Earth radius (km)
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export interface DistanceFeeConfig {
  baseFee: number; // centavos — flat starting fee
  perKm: number; // centavos charged per km beyond the free radius
  freeKm: number; // first N km included in the base fee (0 = none)
  minFee: number; // centavos — never charge less than this (0 = ignore)
  maxKm: number; // don't deliver beyond this many km (0 = unlimited)
  roadFactor: number; // multiply straight-line km to approximate road distance (e.g. 1.3)
}

export interface DistanceFeeResult {
  km: number; // straight-line distance
  billableKm: number; // after the road factor
  fee: number; // centavos
  outOfRange: boolean; // beyond maxKm
}

/** Computes the delivery fee for a straight-line distance under a config. */
export function computeDistanceFee(cfg: DistanceFeeConfig, straightKm: number): DistanceFeeResult {
  const billableKm = straightKm * (cfg.roadFactor > 0 ? cfg.roadFactor : 1);
  const outOfRange = cfg.maxKm > 0 && billableKm > cfg.maxKm;
  const chargeableKm = Math.max(0, billableKm - Math.max(0, cfg.freeKm));
  let fee = cfg.baseFee + Math.round(chargeableKm * cfg.perKm);
  if (cfg.minFee > 0) fee = Math.max(fee, cfg.minFee);
  return { km: straightKm, billableKm, fee: Math.max(0, fee), outOfRange };
}
