/** "pending_review" → "Pending review" */
export function labelize(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  const text = String(value).replace(/_/g, ' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export type Tone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

const TONES: Record<Tone, string[]> = {
  success: ['valid', 'verified', 'approved', 'active', 'issued', 'succeeded', 'published', 'reviewed', 'accepted',
    'observed', 'enrolled', 'given', 'calculated', 'pass', 'resolved', 'replayed', 'open_period', 'receiving'],
  warning: ['pending_validation', 'pending_review', 'pending', 'draft', 'submitted', 'proposed', 'exception', 'partial',
    'correction_requested', 'in_progress', 'open', 'generated', 'planned', 'reported', 'running', 'revised',
    'unverified', 'conditional', 'major', 'adjusted', 'not_recorded', 'recommended'],
  danger: ['rejected', 'not_verified', 'failed', 'faulty', 'withdrawn', 'calculation_error', 'critical', 'not_adopted',
    'fail', 'inactive', 'locked', 'retired', 'discarded'],
  info: ['imported', 'not_submitted', 'minor', 'closed', 'removed', 'completed'],
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
