/** "pending_review" → "Pending review" */
export function labelize(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  const text = String(value).replace(/_/g, ' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * When a record happened: daily values (daily statistics, station days, forecasts, monthly statuses) are stamped at noon
 * India time by convention, so they are shown as a date only; real readings keep their time.
 */
export function observedLabel(value: unknown): string {
  if (!value) return '—';
  const at = new Date(String(value));
  if (Number.isNaN(at.getTime())) return String(value);
  const ist = new Date(at.getTime() + 330 * 60_000);
  const noon = ist.getUTCHours() === 12 && ist.getUTCMinutes() === 0 && ist.getUTCSeconds() === 0;
  const opts: Intl.DateTimeFormatOptions = noon ? { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }
    : { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' };
  return at.toLocaleString('en-IN', opts);
}

/**
 * Sensor parameter names as the FarmFuture app shows them (Farm Insights, Sensors and device pages – reviewed 6 Nov 2026),
 * so a reading reads the same here as in FarmFuture. Soil moisture is measured at two depths: L1 = top, L2 = bottom.
 */
const SENSOR_NAMES: Record<string, string> = {
  soil_moisture: 'Soil Moisture', soil_temperature: 'Soil Temperature', ph: 'pH', ec: 'EC', nitrogen: 'Nitrogen',
  phosphorus: 'Phosphorus', potassium: 'Potassium', air_temperature: 'Temperature', humidity: 'Humidity',
  rainfall: 'Rainfall', air_pressure: 'Air Pressure', wind_speed: 'Wind Speed', leaf_wetness: 'Leaf Wetness',
  light_intensity: 'Lux',
};
const MOISTURE_LAYERS: Record<string, string> = { L1: 'Top Moisture', L2: 'Bottom Moisture' };

export function sensorName(parameter: unknown, layer?: unknown): string {
  const p = String(parameter ?? '');
  if (p === 'soil_moisture' && layer && MOISTURE_LAYERS[String(layer)]) return MOISTURE_LAYERS[String(layer)];
  return SENSOR_NAMES[p] ?? labelize(p);
}

/** How a device is named on screen: FarmFuture devices (coded FF-<MAC ID>) by their MAC ID, others by their code. */
export function deviceId(code: unknown): string {
  const c = String(code ?? '');
  return c.startsWith('FF-') ? c.slice(3) : c;
}

/** A record field that holds a unit ("unit", "volume_unit") – shown exactly as recorded, never capitalised. */
export function isUnitField(name: string): boolean {
  return name === 'unit' || name.endsWith('_unit');
}

export type Tone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

const TONES: Record<Tone, string[]> = {
  success: ['valid', 'verified', 'approved', 'active', 'issued', 'succeeded', 'published', 'reviewed', 'accepted',
    'observed', 'enrolled', 'given', 'calculated', 'pass', 'resolved', 'replayed', 'open_period', 'receiving', 'ok'],
  warning: ['pending_validation', 'pending_review', 'pending', 'draft', 'submitted', 'proposed', 'exception', 'partial',
    'correction_requested', 'in_progress', 'open', 'generated', 'planned', 'reported', 'running', 'revised',
    'unverified', 'conditional', 'major', 'adjusted', 'not_recorded', 'recommended', 'stale', 'never_run'],
  danger: ['rejected', 'not_verified', 'failed', 'faulty', 'withdrawn', 'calculation_error', 'critical', 'not_adopted',
    'fail', 'inactive', 'locked', 'retired', 'discarded'],
  info: ['imported', 'not_submitted', 'minor', 'closed', 'removed', 'completed', 'manual'],
  neutral: [],
};

export function toneOf(status: unknown): Tone {
  const s = String(status ?? '');
  for (const tone of Object.keys(TONES) as Tone[]) {
    if (TONES[tone].includes(s)) return tone;
  }
  return 'neutral';
}

/** Convert a <input type="datetime-local"> value to ISO 8601 with the browser's UTC offset. */
export function localDateTimeToIso(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (isNaN(date.getTime())) return null;
  const offset = -date.getTimezoneOffset();
  const sign = offset >= 0 ? '+' : '-';
  const pad = (n: number) => String(Math.floor(Math.abs(n))).padStart(2, '0');
  return `${value.length === 16 ? value + ':00' : value}${sign}${pad(offset / 60)}:${pad(offset % 60)}`;
}

/** ISO timestamp → value for <input type="datetime-local"> in the browser's local time. */
export function isoToLocalDateTime(value: string | null | undefined): string {
  if (!value) return '';
  const d = new Date(value);
  if (isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function formatNumber(value: unknown, digits = 2): string {
  if (value === null || value === undefined || value === '') return '—';
  const n = Number(value);
  if (isNaN(n)) return String(value);
  return n.toLocaleString(undefined, { maximumFractionDigits: digits });
}
