/** An IANA zone plus the abbreviation shown beside the time. */
export interface FarmTimeZone {
  /** IANA name, e.g. `'Asia/Jakarta'` — what `Intl.DateTimeFormat` takes. */
  zone: string;
  /** Abbreviation shown beside the time, e.g. `'WIB'`. */
  label: string;
}

/** The product's home zone, and the fallback when coordinates say nothing. */
export const IST_ZONE: FarmTimeZone = { zone: 'Asia/Kolkata', label: 'IST' };

const WIB: FarmTimeZone = { zone: 'Asia/Jakarta', label: 'WIB' };
const WITA: FarmTimeZone = { zone: 'Asia/Makassar', label: 'WITA' };
const WIT: FarmTimeZone = { zone: 'Asia/Jayapura', label: 'WIT' };

/**
 * The Indonesian archipelago, roughly: 6°N–11°S, 95°E–141°E.
 *
 * Shared by `farmTimeZone` (below) and the cash book's currency default, so
 * "is this farm in Indonesia" has one answer instead of two copies of the
 * same bounding box drifting apart.
 */
export function isInIndonesia(
  latitude?: number | null,
  longitude?: number | null,
): boolean {
  if (latitude == null || longitude == null) {
    return false;
  }
  return (
    latitude <= 6 && latitude >= -11 && longitude >= 95 && longitude <= 141
  );
}

/**
 * TEMPORARY, and deliberately narrow.
 *
 * A reading belongs to the device that took it, so it should be read in that
 * device's own zone whatever the viewer's laptop is set to. Resolving that
 * properly needs a tz database keyed on coordinates, or — better — the device's
 * IANA zone sent by the API. Until one of those exists this covers the two
 * countries the product is deployed in and falls back to IST elsewhere rather
 * than guessing.
 *
 * IANA names rather than fixed offsets: `Intl.DateTimeFormat` takes those and
 * handles DST itself, while Angular's `DatePipe` silently ignores an IANA name
 * (its timezone argument only understands offsets like `'+0700'`) and quietly
 * formats in the browser's zone instead — a wrong answer with no error.
 */
export function farmTimeZone(
  latitude?: number | null,
  longitude?: number | null,
): FarmTimeZone {
  if (longitude == null || !isInIndonesia(latitude, longitude)) {
    return IST_ZONE;
  }

  // Its three zones are split by longitude. The WIB/WITA line runs between
  // Java and Bali at about 114.4°E — Kalibendo, at 114.28°E, is just inside
  // WIB (East Java).
  if (longitude < 114.4) {
    return WIB;
  }
  return longitude < 128 ? WITA : WIT;
}

/**
 * Parses a UTC timestamp that carries no zone marker.
 *
 * `utc_updatedat` arrives as `"2026-09-21 08:56:00"` — UTC by name, but with a
 * space instead of `T` and no `Z`, so `new Date()` would read it in the
 * viewer's zone and land hours out.
 */
export function parseUtcTimestamp(
  value: string | number | Date | null | undefined,
): Date | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === 'number') {
    const fromNumber = new Date(value);
    return Number.isNaN(fromNumber.getTime()) ? null : fromNumber;
  }

  const trimmed = value.trim();
  // Leave anything that already states its zone alone.
  const marked = /(?:Z|[+-]\d{2}:?\d{2})$/.test(trimmed);
  const normalised = marked
    ? trimmed.replace(' ', 'T')
    : `${trimmed.replace(' ', 'T')}Z`;
  const parsed = new Date(normalised);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
