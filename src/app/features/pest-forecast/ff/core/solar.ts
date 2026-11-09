/**
 * Approximate solar position (NOAA-style, within about a degree), enough to place the sun over the
 * estate and describe where it stands.
 */
export interface SolarPosition {
  /** Radians above the horizon (negative after sunset). */
  altitude: number;
  /** Radians clockwise from north. */
  azimuth: number;
}

export function solarPosition(lat: number, lon: number, date: Date): SolarPosition {
  const rad = Math.PI / 180;
  const n = (date.getTime() - Date.UTC(date.getUTCFullYear(), 0, 0)) / 864e5;
  const b = (360 / 365) * (n - 81) * rad;
  const equationOfTime = 9.87 * Math.sin(2 * b) - 7.53 * Math.cos(b) - 1.5 * Math.sin(b);
  const declination = 23.44 * rad * Math.sin((360 / 365) * (284 + n) * rad);
  const utcHours = date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600;
  const hourAngle = (utcHours + lon / 15 + equationOfTime / 60 - 12) * 15 * rad;
  const phi = lat * rad;
  const altitude = Math.asin(Math.sin(phi) * Math.sin(declination) + Math.cos(phi) * Math.cos(declination) * Math.cos(hourAngle));
  const azimuth = Math.atan2(Math.sin(hourAngle), Math.cos(hourAngle) * Math.sin(phi) - Math.tan(declination) * Math.cos(phi)) + Math.PI;
  return { altitude, azimuth };
}

const POINTS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

/** Eight-point compass name for an azimuth in radians clockwise from north. */
export function compassPoint(azimuth: number): string {
  const deg = (((azimuth * 180) / Math.PI) % 360 + 360) % 360;
  return POINTS[Math.round(deg / 45) % 8];
}

/** One-line description of the sun for the scene overlay, e.g. "Sun · SE · 62° up". */
export function describeSun(lat: number, lon: number, date = new Date()): string {
  const { altitude, azimuth } = solarPosition(lat, lon, date);
  const deg = Math.round((altitude * 180) / Math.PI);
  if (deg > 0) return `Sun · ${compassPoint(azimuth)} · ${deg}° up`;
  return `Night · sun ${-deg}° below the horizon`;
}

export interface SunDay {
  /** Degrees above the horizon now (negative at night). */
  altitudeDeg: number;
  compass: string;
  /** 0 at sunrise, 1 at sunset; outside that range at night. */
  fraction: number;
  sunrise: string;
  sunset: string;
  text: string;
}

const IST_TIME = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

/** The sun's place in today's arc for the estate: where it is now and when it rises and sets (IST). */
export function sunDay(lat: number, lon: number, date = new Date()): SunDay {
  const rad = Math.PI / 180;
  const { altitude, azimuth } = solarPosition(lat, lon, date);
  const n = (date.getTime() - Date.UTC(date.getUTCFullYear(), 0, 0)) / 864e5;
  const b = (360 / 365) * (n - 81) * rad;
  const equationOfTime = 9.87 * Math.sin(2 * b) - 7.53 * Math.cos(b) - 1.5 * Math.sin(b);
  const declination = 23.44 * rad * Math.sin((360 / 365) * (284 + n) * rad);
  const cosH0 = Math.max(-1, Math.min(1, -Math.tan(lat * rad) * Math.tan(declination)));
  const h0 = Math.acos(cosH0) / rad / 15; // hours from solar noon to sunrise or sunset
  const solarNoonUtc = 12 - lon / 15 - equationOfTime / 60; // hours UTC
  const dayStart = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  const sunriseMs = dayStart + (solarNoonUtc - h0) * 3600e3;
  const sunsetMs = dayStart + (solarNoonUtc + h0) * 3600e3;
  const fraction = (date.getTime() - sunriseMs) / (sunsetMs - sunriseMs);
  const altitudeDeg = Math.round(altitude / rad);
  const compass = compassPoint(azimuth);
  const text = altitudeDeg > 0 ? `Sun · ${compass} · ${altitudeDeg}° up` : `Night · sun ${-altitudeDeg}° below the horizon`;
  return { altitudeDeg, compass, fraction, sunrise: IST_TIME.format(new Date(sunriseMs)), sunset: IST_TIME.format(new Date(sunsetMs)), text };
}
