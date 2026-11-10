import { RainfallStatus } from '../../../../core/intefaces/rainfall-deficit.interface';
import { MONTH_NAMES, MONTH_SHORT, SEASON_PRESETS } from '../rainfall-deficit/rainfall-deficit.config';
import {
  actualForRange,
  addDays,
  classify,
  dateKey,
  daysInMonth,
  expectedForRange,
} from '../rainfall-deficit/rainfall-deficit.calc';

/** The seasons the Rainfall Deficit report uses by default, so the two screens always agree. */
const SEASONS = SEASON_PRESETS[0].seasons;

/** Below this share of the season's days with a reading, the station's total is not judged. */
const MIN_COVERAGE_PCT = 60;

/** A season total is not judged before this much rain is normal, or a dry week looks like a drought. */
const MIN_NORMAL_MM = 10;

export type SeasonTone = 'good' | 'watch' | 'act';

/** What the farm's own weather station measured this season, set against the usual. */
export interface SeasonRain {
  /** Rain measured since the season began. */
  mm: number;
  /** Share of the usual rain for these days that has fallen. */
  receivedPct: number | null;
  /** In the farmer's words, or null when there is too little to judge. */
  word: string | null;
  tone: SeasonTone;
  /** The station missed many days, so the total may read low. */
  partial: boolean;
}

/** One of the year's four rain seasons, for the strip that shows where the farm is in the year. */
export interface SeasonStep {
  name: string;
  /** "Oct-Dec". */
  monthsLabel: string;
  state: 'past' | 'current' | 'next';
}

/** What the farm's own station measured, as the "Rain from your station" card shows it. */
export interface StationRain {
  /** Rain since the season began. */
  seasonMm: number;
  /** The last seven days, today included. */
  last7Mm: number;
  /** This calendar month so far. */
  monthMm: number;
  /** The season began this month, so the month's rain is the season's rain. */
  monthIsSeason: boolean;
  /** This calendar year so far. */
  yearMm: number;
  /** Days this season with any rain. */
  rainyDays: number;
  /** The wettest day this season, or null when it has not rained. */
  wettest: { label: string; mm: number } | null;
  /** Days this season, today included, with no reading from the station. */
  missingDays: number;
}

export interface SeasonSummary {
  /** "Post-Monsoon". */
  name: string;
  /** "Oct–Dec". */
  monthsLabel: string;
  /** How much of the season's days have gone, 0 to 100. */
  progressPct: number;
  daysLeft: number;
  /** The 30-year usual rain for the whole season. */
  normalSeason: number;
  /** The usual rain for the days so far. */
  normalSoFar: number;
  monthName: string;
  /** The usual rain for this whole month. */
  normalMonth: number;
  /** The four seasons of the year in order, with the one the farm is in marked. */
  steps: SeasonStep[];
  /** Null when there is no weather station, or it has sent nothing this season. */
  rain: SeasonRain | null;
  /** The station card's figures; null with no station reading. */
  station: StationRain | null;
}

const WORD: Record<RainfallStatus['key'], { word: string | null; tone: SeasonTone }> = {
  above: { word: 'More rain than usual', tone: 'good' },
  normal: { word: 'About the usual rain', tone: 'good' },
  mod: { word: 'A little less rain than usual', tone: 'watch' },
  sig: { word: 'Much less rain than usual', tone: 'act' },
  severe: { word: 'Far less rain than usual', tone: 'act' },
  upcoming: { word: null, tone: 'good' },
  nodata: { word: null, tone: 'good' },
};

/** The first day of the rain season that this day falls in. */
export function seasonStart(now: Date): Date {
  const month = now.getMonth() + 1;
  const season = SEASONS.find((s) => s.months.includes(month)) ?? SEASONS[0];
  return new Date(now.getFullYear(), season.months[0] - 1, 1);
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/**
 * Where the farm stands in its rain season: how far through it is, how much rain is usual for it,
 * and, when the farm has a weather station, how much has really fallen. Returns null when the
 * 30-year monthly normals are not all known, rather than guessing them from the yearly figure.
 */
export function buildSeasonSummary(input: {
  /** 30-year usual rain per month, keyed 1 to 12. */
  monthly: Record<number, number>;
  /** Measured rain per day (YYYY-MM-DD), or null with no weather station. */
  daily: Map<string, number> | null;
  now: Date;
}): SeasonSummary | null {
  const today = startOfDay(input.now);
  const month = today.getMonth() + 1;
  const season = SEASONS.find((s) => s.months.includes(month));
  if (!season) return null;

  const year = today.getFullYear();
  const first = season.months[0];
  const last = season.months[season.months.length - 1];
  const start = new Date(year, first - 1, 1);
  const end = new Date(year, last - 1, daysInMonth(year, last));

  const normalSeason = expectedForRange(input.monthly, start, end);
  const normalSoFar = expectedForRange(input.monthly, start, today);
  if (normalSeason === null || normalSoFar === null) return null;

  const totalDays = Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
  const elapsed = Math.round((today.getTime() - start.getTime()) / 86400000) + 1;

  return {
    name: season.name,
    monthsLabel: seasonMonths(season.months),
    progressPct: Math.min(100, Math.max(0, (elapsed / totalDays) * 100)),
    daysLeft: Math.max(0, totalDays - elapsed),
    normalSeason,
    normalSoFar,
    monthName: MONTH_NAMES[month - 1],
    normalMonth: input.monthly[month],
    steps: SEASONS.map((step, index): SeasonStep => ({
      name: step.name,
      monthsLabel: seasonMonths(step.months),
      state: step === season ? 'current' : index < SEASONS.indexOf(season) ? 'past' : 'next',
    })),
    rain: seasonRain(input.daily, start, today, normalSoFar),
    station: stationRain(input.daily, start, today),
  };
}

function sumRange(daily: Map<string, number>, from: Date, to: Date): number {
  let total = 0;
  for (let d = new Date(from); d <= to; d = addDays(d, 1)) total += daily.get(dateKey(d)) ?? 0;
  return total;
}

/**
 * The station's rain in the ways a farmer reads it: this season, the last week, this month, this
 * year, how many days it rained and the wettest one. Needs readings from the start of the year.
 */
export function stationRain(daily: Map<string, number> | null, seasonBegan: Date, today: Date): StationRain | null {
  if (!daily?.size) return null;
  const season = actualForRange(daily, seasonBegan, today);
  if (season.total === null) return null;

  let rainyDays = 0;
  let wettest: { date: Date; mm: number } | null = null;
  for (let d = new Date(seasonBegan); d <= today; d = addDays(d, 1)) {
    const mm = daily.get(dateKey(d));
    if (mm === undefined || mm <= 0) continue;
    rainyDays++;
    if (!wettest || mm > wettest.mm) wettest = { date: new Date(d), mm };
  }

  return {
    seasonMm: season.total,
    last7Mm: sumRange(daily, addDays(today, -6), today),
    monthMm: sumRange(daily, new Date(today.getFullYear(), today.getMonth(), 1), today),
    monthIsSeason: seasonBegan.getFullYear() === today.getFullYear() && seasonBegan.getMonth() === today.getMonth(),
    yearMm: sumRange(daily, new Date(today.getFullYear(), 0, 1), today),
    rainyDays,
    wettest: wettest
      ? { label: `${wettest.date.getDate()} ${MONTH_SHORT[wettest.date.getMonth()]}`, mm: wettest.mm }
      : null,
    missingDays: season.elapsed - season.measured,
  };
}

/** "Oct-Dec", or "Jun" for a single month. */
function seasonMonths(months: number[]): string {
  const first = months[0];
  const last = months[months.length - 1];
  return first === last ? MONTH_SHORT[first - 1] : `${MONTH_SHORT[first - 1]}–${MONTH_SHORT[last - 1]}`;
}

function seasonRain(
  daily: Map<string, number> | null,
  start: Date,
  today: Date,
  normalSoFar: number,
): SeasonRain | null {
  if (!daily?.size) return null;
  const measured = actualForRange(daily, start, today);
  if (measured.total === null) return null;

  const partial = (measured.coveragePct ?? 0) < MIN_COVERAGE_PCT;
  const judged = !partial && normalSoFar >= MIN_NORMAL_MM;
  const receivedPct = normalSoFar > 0 ? (measured.total / normalSoFar) * 100 : null;
  const status = judged ? classify(receivedPct, normalSoFar, measured.total) : { key: 'nodata' as const };
  return {
    mm: measured.total,
    receivedPct,
    partial,
    ...WORD[status.key],
  };
}
