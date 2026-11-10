import { IrrigationPlan, IrrigationToday } from './irrigation.model';

export const AC_PER_HA = 2.47105;
export const HOURS_PER_DAY = 10;

/** Status colours used on the map; keys match the colour names the API sends. */
export const STATUS_HEX: Record<string, string> = {
  red: '#b02a37',
  amber: '#d98e04',
  blue: '#1f6fa8',
  green: '#2e8b57',
  grey: '#6b7570',
};

export const isNum = (n: unknown): boolean =>
  n !== null && n !== undefined && n !== '' && Number.isFinite(Number(n));

/** A missing or invalid number shows as a dash, never as NaN. */
export const num = (n: unknown, d = 0): string =>
  isNum(n) ? Number(n).toLocaleString(undefined, { maximumFractionDigits: d }) : '–';

export const pct = (n: unknown, d = 0): string =>
  isNum(n) ? num(n, d) + '%' : '–';

export const fmtDay = (iso: string): string =>
  new Date(iso + 'T00:00:00').toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });

export const shortDay = (iso: string): string =>
  new Date(iso + 'T00:00:00').toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
  });

/** The farm's day is India time. */
export const todayIso = (): string =>
  new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

export const acres = (ha: unknown): number | null =>
  isNum(ha) ? Number(ha) * AC_PER_HA : null;

export const areaText = (ha: unknown): string =>
  isNum(ha) ? `${num(acres(ha), 1)} ac (${num(ha, 1)} ha)` : '–';

export const inches = (mm: unknown): string => {
  if (!isNum(mm)) return '–';
  const q = Math.max(0.25, Math.round((Number(mm) / 25.4) * 4) / 4);
  return String(+q.toFixed(2)) + (q === 1 ? ' inch' : ' inches');
};

export const depthText = (mm: unknown, d = 0): string =>
  isNum(mm) ? `${num(mm, d)} mm (about ${inches(mm)})` : '–';

/** Soil water left in plain words: days the soil can supply the crop without rain. */
export const reserveText = (t: Pick<IrrigationToday, 'reserve_days' | 'soil_state'> | null | undefined): string => {
  if (!t || !isNum(t.reserve_days)) return '–';
  const d = Number(t.reserve_days);
  if (t.soil_state?.word === 'Dry') return 'Soil is dry';
  if (d > 30) return 'More than 30 days';
  if (d < 1) return 'under a day';
  const n = Math.round(d);
  return n + (n === 1 ? ' day' : ' days');
};

export const firstSentence = (t: string | undefined | null): string => {
  const m = (t || '').match(/^.*?[.!?](\s|$)/);
  return m ? m[0].trim() : t || '';
};

export const fmtHours = (h: number): string => {
  const m = Math.round(h * 60);
  const hh = Math.floor(m / 60);
  const mm = m % 60;
  const hours = hh + (hh === 1 ? ' hour' : ' hours');
  const mins = mm + (mm === 1 ? ' minute' : ' minutes');
  if (hh === 0) return mins;
  return mm ? `${hours} ${mins}` : hours;
};

/** "Updated Thu 1 Oct, 2:05 am" in India time; stale when older than 36 hours. */
export const updatedInfo = (iso?: string | null): { text: string; stale: boolean } | null => {
  if (!iso) return null;
  const t = new Date(iso);
  if (isNaN(t.getTime())) return null;
  const text = t.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
  return { text, stale: Date.now() - t.getTime() > 36 * 3600 * 1000 };
};

export interface NextIrrigation {
  value: string;
  sub: string;
  now?: boolean;
  hold?: boolean;
}

/** When is the next irrigation needed. */
export const nextIrrigation = (p: IrrigationPlan): NextIrrigation => {
  // A planned dry spell (flower buds still maturing): the next irrigation is the blossom window.
  if (p.headline.status === 'HOLD') {
    const se = p.season;
    return {
      value: se?.next_starts ? fmtDay(se.next_starts) : 'When the buds are mature',
      hold: true,
      sub:
        (se?.next_label ? se.next_label + '. ' : '') +
        'Do not water yet. Wait until then, unless the plants look too dry.',
    };
  }
  const needs =
    p.water_needed && p.headline.status !== 'NO_IRRIGATION' && p.headline.status !== 'HOLD';
  if (needs) {
    return {
      value: 'Now',
      sub: p.headline.status === 'IRRIGATE_BY' ? 'by the date in the advice above' : 'see the watering plan below',
      now: true,
    };
  }
  const dry = p.days.find((d) => d.needs_water);
  if (dry) return { value: fmtDay(dry.date), sub: 'the soil gets too dry then, so water by this day' };
  const last = p.days[p.days.length - 1];
  if (!last || !isNum(last.reserve_days)) return { value: `Not in the next ${p.days.length} days`, sub: '' };
  if (Number(last.reserve_days) > 30) return { value: 'Not for over a month', sub: 'if no more rain falls after this week' };
  const dt = new Date(last.date + 'T00:00:00');
  dt.setDate(dt.getDate() + Math.round(Number(last.reserve_days)));
  return {
    value: fmtDay(dt.toLocaleDateString('en-CA')),
    sub: 'earliest, if no rain falls after this week. More rain pushes it later.',
  };
};
