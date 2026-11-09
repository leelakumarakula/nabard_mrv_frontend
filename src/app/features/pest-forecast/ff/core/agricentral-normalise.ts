/**
 * AgriCentral API responses -> the farm snapshot the WSB engines expect.
 *
 * A port of the twin backend's `src/data.js`. It used to run server-side, because the twin
 * was a separate service that called AgriCentral over the network. Inside this app there is
 * no separate service: the page already calls AgriCentral for everything else, so the
 * snapshot is assembled here from endpoints that exist and are already authenticated.
 *
 * That matters for one reason in particular. Sensor readings pass through calibration,
 * lab-anchoring and multi-factor correction on the server; `GetAllSensorsLatestDataV2`
 * already does all of it. Rebuilding that anywhere else would mean two implementations of
 * the same agronomy drifting apart. Here we only reshape what it returns.
 *
 * Every field below exists because an engine reads it. Shapes are not tidied on the way
 * through: `null` means the API did not supply a value, and stays null rather than becoming
 * zero, because the engines treat "not measured" and "measured as zero" differently.
 */

const validNumber = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null;

/** The API can send coordinates as numeric strings ("12.34"); read those as numbers. Blank or missing stays NaN. */
const numeric = (v: unknown): number =>
  typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;

/** AgriCentral wraps responses as `{succeeded, data}`; some endpoints return the body bare. */
export function payload<T = any>(raw: any): T {
  if (raw?.succeeded === false) throw new Error('AgriCentral did not return successful data');
  return (raw?.data ?? raw) as T;
}

export interface ElevationPoint { lat: number; lon: number; alt: number | null; accuracy: number | null; }
export interface Zone {
  id: string | null; name: string; tenantId: string | null; mainBoundary: boolean;
  rings: number[][][]; elevations: ElevationPoint[];
}
export interface Geometry {
  zones: Zone[];
  bounds: { west: number; east: number; south: number; north: number };
  center: { lat: number; lon: number };
  devices: Array<{ id: string; name: string; tenantId: string; lat: number; lon: number; type: unknown }>;
  elevations: ElevationPoint[];
  source: string; surfaceMethod: string;
  elevationMin: number | null; elevationMax: number | null;
  fullBoundaryConfirmed: boolean; verticalDatum: string;
}

/**
 * `POLYGON((lon lat, ...), (hole...))` to rings of [lon, lat].
 * Returns null for anything that is not a polygon, so the caller can fall back to the
 * ordered point list.
 */
export function parsePolygonWkt(wkt: unknown): number[][][] | null {
  // Tolerates `POLYGON Z ((...))`, `POLYGON ( (...) )` and stray whitespace, which a strict match turned into "no shape".
  const prefix = /^\s*POLYGON\s*(?:ZM|Z|M)?\s*\(\s*(?=\()/i;
  if (typeof wkt !== 'string' || !prefix.test(wkt)) return null;
  const body = wkt.replace(prefix, '').replace(/\)\s*$/, '');
  const ringStrings = body.match(/\([^()]+\)/g) || [];
  return ringStrings
    .map((str) =>
      str
        .slice(1, -1)
        .split(',')
        .map((pair) => pair.trim().split(/\s+/).map(Number))
        .filter((p) => p.length >= 2 && p.slice(0, 2).every(Number.isFinite))
        .map((p) => p.slice(0, 2)),
    )
    .filter((r) => r.length >= 3);
}

/** The radius of the estimated outline around a lone position, and how far it reaches beyond the farthest of several, in metres. */
const ESTIMATED_RADIUS_M = 30;

/**
 * The ring [lon, lat] around the positions of a farm with no mapped boundary: a circle centred
 * between them. One position gets a 30 m radius; several get 30 m beyond the farthest of them.
 */
function estimatedRing(spots: Array<{ lat: number; lon: number }>): number[][] {
  const lats = spots.map((p) => p.lat);
  const lons = spots.map((p) => p.lon);
  const lat0 = (Math.min(...lats) + Math.max(...lats)) / 2;
  const lon0 = (Math.min(...lons) + Math.max(...lons)) / 2;
  const mLat = 111320;
  const mLon = 111320 * Math.max(Math.cos((lat0 * Math.PI) / 180), 0.01);
  const farthest = Math.max(...spots.map((p) => Math.hypot((p.lat - lat0) * mLat, (p.lon - lon0) * mLon)));
  const radius = ESTIMATED_RADIUS_M + farthest;
  return Array.from({ length: 36 }, (_, i) => {
    const a = (i / 36) * 2 * Math.PI;
    return [lon0 + (Math.cos(a) * radius) / mLon, lat0 + (Math.sin(a) * radius) / mLat];
  });
}

/** `GET api/Data/GetFarmCoordinates/{farmId}` -> zones, bounds, devices, boundary altitudes. */
export function normalizeGeometry(
  raw: any,
  /** Positions to outline when the farm has no boundary and no mapped devices (sensor or station readings). */
  fallbackPoints: Array<{ lat: number; lon: number; tenantId?: string | null }> = [],
): Geometry {
  const data = payload<any>(raw) || {};

  const zones: Zone[] = ((data.farmCoordinates || []) as any[])
    .map((entry: any) => {
      const points = (entry.coordinates || [])
        .map((p: any) => ({
          ...p, lat: numeric(p.lat), long: numeric(p.long),
          alt: numeric(p.alt), accuracy: numeric(p.accuracy), number: numeric(p.number),
        }))
        .filter((p: any) => Number.isFinite(p.lat) && Number.isFinite(p.long))
        .sort((a: any, b: any) => (Number.isFinite(a.number) ? a.number : 0) - (Number.isFinite(b.number) ? b.number : 0));

      // Prefer the stored polygon; fall back to the ordered points for zones mapped
      // before the geometry column was populated.
      let rings = parsePolygonWkt(entry.area?.polygon);
      if (!rings && points.length >= 3) rings = [points.map((p: any) => [p.long, p.lat])];
      if (!rings?.length) return null;

      // Drop the repeated closing vertex: the engines close rings themselves, and a
      // duplicated last point would be counted twice in every edge test.
      rings = rings.map((r) =>
        r.length > 3 && r[0][0] === r[r.length - 1][0] && r[0][1] === r[r.length - 1][1]
          ? r.slice(0, -1)
          : r,
      );

      return {
        id: entry.area?.id ?? null,
        name: entry.area?.areaName || 'Mapped zone',
        tenantId: entry.area?.tenantId ?? null,
        mainBoundary: entry.area?.mainMapType === true,
        rings,
        // Recorded ground altitudes along the boundary. The absurd ones are dropped:
        // a GPS fix below -500 m or above 9000 m is a bad reading, not terrain.
        elevations: points
          .map((p: any) => ({
            lat: p.lat, lon: p.long,
            alt: validNumber(p.alt), accuracy: validNumber(p.accuracy),
          }))
          .filter((p: ElevationPoint) => p.alt !== null && p.alt > -500 && p.alt < 9000),
      } as Zone;
    })
    .filter((z): z is Zone => z !== null);

  const devices = ((data.deviceCoordinates || []) as any[])
    .map((v) => ({ ...v, lat: numeric(v.lat), long: numeric(v.long) }))
    .filter((v) => Number.isFinite(v.lat) && Number.isFinite(v.long))
    .map((v) => ({ id: v.macId, name: v.deviceName, tenantId: v.tenantId,
                   lat: v.lat, lon: v.long, type: v.deviceType }));

  // A farm with no boundary mapped yet: outline whatever positions it has (devices, then the
  // sensor and weather-station positions the caller found) within 30 m, so the map and the pest
  // layers still have a surface to draw on. It is an estimate, so it is not reported as a
  // confirmed boundary (`fullBoundaryConfirmed` stays false).
  if (!zones.length) {
    const spots = [...devices.map((d) => ({ lat: d.lat, lon: d.lon, tenantId: d.tenantId ?? null })), ...fallbackPoints];
    if (spots.length) {
      const tenants = new Set(spots.map((d) => d.tenantId ?? null));
      zones.push({
        id: 'estimated-boundary', name: 'Farm', mainBoundary: false,
        tenantId: tenants.size === 1 ? [...tenants][0] : null,
        rings: [estimatedRing(spots)],
        elevations: [],
      });
    }
  }

  if (!zones.length) {
    throw Object.assign(new Error('No usable polygon coordinates were returned for this farm'), {
      status: 422, code: 'no_geometry',
    });
  }

  const coords = zones.flatMap((z) => z.rings.flat());
  const bounds = {
    west: Math.min(...coords.map((p) => p[0])),
    east: Math.max(...coords.map((p) => p[0])),
    south: Math.min(...coords.map((p) => p[1])),
    north: Math.max(...coords.map((p) => p[1])),
  };
  const center = { lat: (bounds.north + bounds.south) / 2, lon: (bounds.east + bounds.west) / 2 };

  // One altitude per location: zones that share a boundary record the same corner twice.
  const unique = new Map<string, ElevationPoint>();
  zones.flatMap((z) => z.elevations)
       .forEach((p) => unique.set(`${p.lat.toFixed(8)},${p.lon.toFixed(8)}`, p));
  const elevations = [...unique.values()];

  return {
    zones, bounds, center, devices, elevations,
    source: 'AgriCentral GetFarmCoordinates',
    surfaceMethod: 'Inverse-distance interpolation of recorded boundary altitudes',
    elevationMin: elevations.length ? Math.min(...elevations.map((p) => p.alt as number)) : null,
    elevationMax: elevations.length ? Math.max(...elevations.map((p) => p.alt as number)) : null,
    fullBoundaryConfirmed: zones.some((z) => z.mainBoundary),
    verticalDatum: 'Not supplied by API',
  };
}

/** Positions the sensor and weather-station responses report, for a farm whose boundary and devices are not mapped. */
export function positionsFrom(
  sensorsRaw: unknown,
  weatherRaw: unknown,
): Array<{ lat: number; lon: number; tenantId: string | null }> {
  const spots: Array<{ lat: number; lon: number; tenantId: string | null }> = [];
  const take = (raw: unknown) => {
    let data: any;
    try { data = payload<any>(raw); } catch { return; }
    for (const item of Array.isArray(data) ? data : data ? [data] : []) {
      const lat = numeric(item?.lat ?? item?.Lat);
      const lon = numeric(item?.long ?? item?.Long);
      if (Number.isFinite(lat) && Number.isFinite(lon) && !(lat === 0 && lon === 0)) {
        spots.push({ lat, lon, tenantId: item?.tenantId ?? null });
      }
    }
  };
  take(sensorsRaw);
  take(weatherRaw);
  return spots;
}

/**
 * The location the farm was registered with, from `GET api/Estate/GetUserFarmsList`. It is the last
 * place to look for a farm with no boundary, no devices and no sensor or station position, so the
 * map and the forecast still have somewhere to be. A 0,0 pair is a blank form, not a place.
 */
export function registeredLocationFrom(
  farmsRaw: unknown,
  farmId: string,
): { lat: number; lon: number; tenantId: string | null } | null {
  let data: any;
  try { data = payload<any>(farmsRaw); } catch { return null; }
  const farm = (Array.isArray(data) ? data : []).find(
    (f: any) => String(f?.farmId ?? '').toLowerCase() === farmId.toLowerCase(),
  );
  const lat = numeric(farm?.latitude);
  const lon = numeric(farm?.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || (lat === 0 && lon === 0)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lat, lon, tenantId: null };
}

/**
 * `GET api/Data/GetAllSensorsLatestDataV2/{farmId}` -> one entry per soil device.
 *
 * The units notes are carried through deliberately: these are reported sensor percentages,
 * not volumetric water content, and the depth labels are provisional. The engines surface
 * those caveats rather than presenting the numbers as calibrated measurements.
 */
export function normalizeSensors(raw: any, geometry: Geometry | null): any[] {
  const data = payload<any>(raw);
  if (!Array.isArray(data)) throw new Error('Unexpected sensor response');

  return data.map((s: any) => ({
    id: s.macId, name: s.deviceName, tenantId: s.tenantId,
    zoneId: geometry?.zones.find((z) => z.tenantId === s.tenantId)?.id ?? null,
    lat: validNumber(s.lat), lon: validNumber(s.long),
    reportedAt: s.updateAt ?? null,
    // Device timestamps carry no timezone unless the string says so. The engines refuse to
    // apply freshness thresholds to an ambiguous time rather than guessing the offset.
    timeZoneExplicit: !!s.updateAt && /(Z|[+-]\d\d:\d\d)$/.test(s.updateAt),
    crops: (s.crops || []).map((c: any) => c.name),
    moistureTop: validNumber(s.soilProperties?.soilMoisturePercentage1),
    moistureBottom: validNumber(s.soilProperties?.soilMoisturePercentage2),
    temperature: validNumber(s.soilProperties?.temperature),
    ph: validNumber(s.soilProperties?.ph),
    ec: validNumber(s.soilProperties?.electricalConductivity),
    nitrogen: validNumber(s.soilNutrients?.nitrogen),
    phosphorus: validNumber(s.soilNutrients?.phosphorous),
    potassium: validNumber(s.soilNutrients?.potassium),
    solarRadiation: validNumber(s.extraParameters?.solarRadiation),
    lux: validNumber(s.extraParameters?.lux),
    moistureCalibration: 'Reported sensor percent; volumetric calibration not supplied',
    depthMapping: '20 / 60 cm labels provisional',
    nutrientUnits: 'Not supplied by API',
  }));
}

/** `GET WeatherForecast/forecast?lat=&lon=` -> three-hourly slots. OpenWeather shape. */
export function normalizeForecast(raw: any, location: { lat: number; lon: number }): any {
  const data = payload<any>(raw);
  if (!Array.isArray(data?.list) || !data.list.length) throw new Error('Forecast is not available');

  const slots = data.list
    .map((p: any) => ({
      time: Number(p.dt) * 1000,
      // The provider reports Kelvin.
      temperatureC: validNumber(p.main?.temp) === null ? null : p.main.temp - 273.15,
      humidity: validNumber(p.main?.humidity),
      pressure: validNumber(p.main?.pressure),
      // No `rain` key means no rain forecast for the interval, which is 0 - not unknown.
      rainMm: Object.hasOwn(p, 'rain') ? validNumber(p.rain?.['3h']) : 0,
      rainProbability: validNumber(p.pop) === null ? null : p.pop * 100,
      cloud: validNumber(p.clouds?.all),
      windMs: validNumber(p.wind?.speed),
      gustMs: validNumber(p.wind?.gust),
      windDegrees: validNumber(p.wind?.deg),
      condition: p.weather?.[0]?.description || 'Forecast',
      code: p.weather?.[0]?.id ?? null,
      night: p.sys?.pod === 'n',
    }))
    .filter((p: any) => Number.isFinite(p.time))
    .sort((a: any, b: any) => a.time - b.time);

  if (!slots.length) throw new Error('No usable forecast intervals were returned');

  return {
    slots, requestedLocation: location,
    modelLocation: data.city?.coord ?? null,
    locationName: data.city?.name ?? null,
    intervalHours: 3, windFieldsVersion: 1, windUnit: 'm/s',
    windConvention:
      'Meteorological FROM degrees; provider samples, not a measured continuous wind record',
    source: 'AgriCentral forecast / OpenWeather',
    temperatureInputUnit: 'Kelvin',
    rainInterval: '3 hours ending at the displayed time',
    timezone: 'Asia/Kolkata',
    sourceUrl: 'https://openweathermap.org/forecast5',
  };
}

/** `GET api/Calendar/GetUserCalendarEvents/{farmId}` -> the seasonal template and observed events. */
export function normalizeCalendar(raw: any): any {
  const data = payload<any>(raw) || {};
  const fields = (e: any) => ({ title: String(e.title || ''), start: e.start, end: e.end });
  return {
    common: (data.userCommonCalendarEvents || []).map(fields),
    observed: (data.userCalendarEvents || []).map(fields),
    source: 'AgriCentral farm calendar',
  };
}

/**
 * `GET api/Data/GetAllWeatherData?farmId=` -> the station's latest observation.
 *
 * Returns one entry per weather device on the farm, read from InfluxDB. The engines take a
 * single station reading, so the freshest device with an actual timestamp wins; a farm with
 * no weather device returns an empty list, which is a fact about the farm and reported as a
 * missing source rather than an error.
 *
 * Field names are accepted in either casing: the controller builds an anonymous object
 * mixing `tenantId` with `AirTemperature`, and whether that survives as written depends on
 * the serializer's naming policy. Reading both costs nothing and removes the dependency.
 */
export function normalizeWeather(raw: any): any {
  const data = payload<any>(raw);
  const list = Array.isArray(data) ? data : data ? [data] : [];
  if (!list.length) throw new Error('No weather station is mapped to this farm');

  const pick = (o: any, ...names: string[]) => {
    for (const n of names) {
      if (o?.[n] !== undefined && o[n] !== null) return o[n];
      const lower = n.charAt(0).toLowerCase() + n.slice(1);
      if (o?.[lower] !== undefined && o[lower] !== null) return o[lower];
    }
    return null;
  };

  // The newest reading that actually carries a time. A device reporting nothing yet would
  // otherwise win on list order and show the farm as having no observation at all.
  const stamped = list
    .map((d) => ({ d, at: String(pick(d, 'UpdateAt') ?? '') }))
    .filter((e) => e.at);
  const w = (stamped.sort((a, b) => b.at.localeCompare(a.at))[0] ?? { d: list[0], at: '' }).d;
  const reportedAt = normalizeIstStamp(String(pick(w, 'UpdateAt') ?? '') || null);

  return {
    temperatureC: validNumber(pick(w, 'AirTemperature')),
    humidity: validNumber(pick(w, 'AirHumidity')),
    pressure: validNumber(pick(w, 'AirPressure')),
    // Cumulative since the 08:30 IST rain-day boundary the controller works to, not an
    // hourly total - the engines read it as an accumulation, so the interval is stated.
    rainfall: validNumber(pick(w, 'Rainfall')),
    rainfallInterval: 'Cumulative since 8:30 in the morning',
    windSpeed: validNumber(pick(w, 'WindSpeed')),
    windUnit: 'Not supplied by API',
    windDirection: pick(w, 'WindDirection') ?? null,
    leafWetness: validNumber(pick(w, 'LeafWetness')),
    reportedAt,
    // True only because we gave the stamp its offset below. Without it the engines refuse to
    // apply any freshness threshold, and the station reading becomes display-only.
    timeZoneExplicit: !!reportedAt && /(Z|[+-]\d\d:\d\d)$/.test(reportedAt),
    deviceId: pick(w, 'MacId') ?? null,
    deviceName: pick(w, 'DeviceName') ?? null,
    lat: validNumber(pick(w, 'Lat')),
    lon: validNumber(pick(w, 'Long')),
    stations: list.length,
    source: 'AgriCentral MicroClime',
  };
}

/**
 * `"2026-10-01 17:21:00"` -> `"2026-10-01T17:21:00+05:30"`.
 *
 * The controller converts to IST and then formats without an offset, so the string says
 * nothing about its own timezone. The engines will not apply a six-hour freshness window to
 * an ambiguous time - and they are right not to, since reading IST as UTC would be out by
 * five and a half hours. We are not guessing here: the value is IST by construction, so we
 * say so. Anything that already carries an offset is left exactly as it is.
 */
function normalizeIstStamp(value: string | null): string | null {
  if (!value) return null;
  const s = value.trim();
  if (/(Z|[+-]\d\d:?\d\d)$/.test(s)) return s;
  const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}(?::\d{2})?)/.exec(s);
  return m ? `${m[1]}T${m[2]}+05:30` : s;
}
