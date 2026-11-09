/**
 * The id of the one estimated "Farm" zone a farm with no drawn zones is outlined as. It is the web's own
 * stand-in, not a zone anyone mapped.
 */
export const ESTIMATED_BOUNDARY_ID = 'estimated-boundary';

/**
 * The zone id to save a field record under. The estimated "Farm" zone is not a real zone, so a record
 * filed on it carries no zone, as the farm app files one for a farm with no zones. Any other zone keeps
 * its id, and a record with no zone is shown on the farm's only zone (see [recordsWithZones]).
 */
export function zoneIdToSave(zoneId: string | null | undefined): string | null {
  return !zoneId || zoneId === ESTIMATED_BOUNDARY_ID ? null : zoneId;
}

/** The part of a field record the zone mapping reads and may fill in. */
export interface ZonedRecord {
  zoneId?: string | null;
}

/** The part of a farm the mapping reads: its zones. */
export interface ZonedFarm {
  geometry?: { zones?: { id: string }[] } | null;
}

/**
 * The farm's records with a zone on each. The farm app files a check on a farm with one zone, or with
 * no drawn zones at all, with no zone id; the web names the farm's only zone (for a farm with no drawn
 * zones, its one estimated "Farm" zone) and reads records zone by zone. So a record with no zone
 * belongs to the farm's only zone, and is shown there instead of being lost. A farm with several zones
 * is left alone: a record with no zone there cannot be placed.
 */
export function recordsWithZones<T extends ZonedRecord>(records: T[] | null | undefined, farm: ZonedFarm | null): T[] {
  const list = Array.isArray(records) ? records : [];
  const zones = farm?.geometry?.zones ?? [];
  if (zones.length !== 1) return list;
  const only = zones[0].id;
  return list.map((record) => (record.zoneId ? record : { ...record, zoneId: only }));
}
